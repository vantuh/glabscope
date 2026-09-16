import { parseJsonStdout, runGlab } from "./run.ts";
import { looksRateLimited, rateLimitedError } from "./ratelimit.ts";
import { pipelineJobsQuery } from "./query.ts";
import { statusBucket, type StatusBucket } from "../status.ts";

export class NeedsUnavailableError extends Error {
  constructor(message = "GitLab GraphQL on this instance does not expose job needs") {
    super(message);
    this.name = "NeedsUnavailableError";
  }
}

export type JobNode = {
  id: string;
  numericId: string;
  name: string;
  status: string;
  bucket: StatusBucket;
  kind: string;
  stage: string;
  needsNames: string[];
  isBridge: boolean;
  retried: boolean;
};

export type PipelineGraph = {
  pipelineGid: string;
  iid: string;
  status: string;
  jobs: JobNode[];
  stageNames: string[];
  truncated: boolean;
};

type GqlNeed = { id?: string; name?: string };
type GqlJob = {
  id: string;
  name: string;
  status: string;
  kind?: string;
  retried?: boolean | null;
  stage?: { name?: string } | null;
  needs?: { nodes?: GqlNeed[] | null } | null;
};

type GqlResponse = {
  data?: {
    project?: {
      pipeline?: {
        id: string;
        iid: string;
        status: string;
        stages?: { nodes?: { name?: string | null }[] | null } | null;
        jobs?: { nodes?: GqlJob[] | null; pageInfo?: { hasNextPage?: boolean } | null };
      } | null;
    } | null;
  };
  errors?: { message: string; path?: unknown; extensions?: { fieldName?: string } }[];
};

export function attemptKey(job: Pick<JobNode, "name" | "stage">): string {
  return `${job.stage}\0${job.name}`;
}

export function jobAttempts(jobs: JobNode[], job: Pick<JobNode, "name" | "stage">): JobNode[] {
  return jobs
    .filter((item) => item.name === job.name && item.stage === job.stage)
    .slice()
    .sort((a, b) => Number(b.numericId) - Number(a.numericId));
}

export function latestJobs(jobs: JobNode[]): JobNode[] {
  const groups = new Map<string, JobNode[]>();
  const order: string[] = [];
  for (const job of jobs) {
    const key = attemptKey(job);
    const list = groups.get(key);
    if (!list) {
      order.push(key);
      groups.set(key, [job]);
    } else {
      list.push(job);
    }
  }
  return order.map((key) => {
    const list = groups.get(key) ?? [];
    return (
      list.find((job) => !job.retried) ??
      list.reduce((best, job) =>
        Number(job.numericId) > Number(best.numericId) ? job : best,
      )
    );
  });
}

export function numericIdFromGid(gid: string): string {
  const tail = gid.split("/").pop();
  if (!tail || !/^\d+$/.test(tail)) {
    throw new Error(`Cannot parse numeric id from ${gid}`);
  }
  return tail;
}

export function parsePipelineGraph(payload: GqlResponse): PipelineGraph {
  const needsMissing = payload.errors?.some(
    (error) =>
      error.extensions?.fieldName === "needs" ||
      /Field 'needs' doesn't exist/i.test(error.message),
  );
  if (needsMissing) {
    throw new NeedsUnavailableError(payload.errors?.[0]?.message);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const pipeline = payload.data?.project?.pipeline;
  if (!pipeline) {
    throw new Error("Pipeline not found");
  }
  const nodes = pipeline.jobs?.nodes;
  if (!nodes) {
    throw new Error("Pipeline jobs were not returned");
  }

  const jobs: JobNode[] = nodes.map((node) => {
    if (node.needs === undefined) {
      throw new NeedsUnavailableError("Job payload is missing needs");
    }
    const kind = node.kind ?? "BUILD";
    return {
      id: node.id,
      numericId: numericIdFromGid(node.id),
      name: node.name,
      status: node.status,
      bucket: statusBucket(node.status),
      kind,
      stage: node.stage?.name ?? "",
      needsNames: (node.needs?.nodes ?? [])
        .map((need) => need.name)
        .filter((name): name is string => Boolean(name)),
      isBridge: kind.toUpperCase() === "BRIDGE",
      retried: Boolean(node.retried),
    };
  });

  return {
    pipelineGid: pipeline.id,
    iid: pipeline.iid,
    status: pipeline.status,
    jobs,
    stageNames: (pipeline.stages?.nodes ?? [])
      .map((stage) => stage.name?.trim() ?? "")
      .filter((name) => name.length > 0),
    truncated: Boolean(pipeline.jobs?.pageInfo?.hasNextPage),
  };
}

const projectPathCache = new Map<string, string>();

export async function projectFullPath(cwd = process.cwd()): Promise<string> {
  const cached = projectPathCache.get(cwd);
  if (cached) {
    return cached;
  }
  const raw = parseJsonStdout<{ path_with_namespace?: string; path?: string }>(
    await runGlab(["repo", "view", "-F", "json"], { cwd }),
  );
  const path = raw.path_with_namespace ?? raw.path;
  if (!path) {
    throw new Error("glab repo view did not include path_with_namespace");
  }
  projectPathCache.set(cwd, path);
  return path;
}

export async function fetchPipelineGraph(
  pipelineIid: string,
  cwd = process.cwd(),
): Promise<PipelineGraph> {
  const fullPath = await projectFullPath(cwd);
  const result = await runGlab(
    ["api", "graphql", "-f", `query=${pipelineJobsQuery(fullPath, pipelineIid)}`],
    { cwd },
  );
  if (result.code !== 0) {
    if (looksRateLimited(`${result.stderr}\n${result.stdout}`)) {
      throw rateLimitedError(result);
    }
    throw new Error(result.stderr.trim() || result.stdout.trim() || "graphql failed");
  }
  return parsePipelineGraph(JSON.parse(result.stdout) as GqlResponse);
}
