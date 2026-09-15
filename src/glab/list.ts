import { parseJsonStdout, runGlab } from "./run.ts";
import { statusBucket, type StatusBucket } from "../status.ts";
import { looksRateLimited, rateLimitedError } from "./ratelimit.ts";

export type PipelineRow = {
  id: number;
  iid: number;
  status: string;
  bucket: StatusBucket;
  ref: string;
  source: string;
};

type GlabPipelineJson = {
  id: number;
  iid: number;
  status: string;
  ref?: string;
  source?: string;
};

export function mapPipelines(raw: GlabPipelineJson[]): PipelineRow[] {
  return raw.map((pipeline) => ({
    id: pipeline.id,
    iid: pipeline.iid,
    status: pipeline.status,
    bucket: statusBucket(pipeline.status),
    ref: pipeline.ref ?? "",
    source: pipeline.source ?? "",
  }));
}

export async function listPipelines(
  cwd = process.cwd(),
): Promise<PipelineRow[]> {
  const pageSize = 50;
  const rows: PipelineRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const result = await runGlab(
      ["ci", "list", "-F", "json", "-P", String(pageSize), "-p", String(page)],
      { cwd },
    );
    if (result.code !== 0 && looksRateLimited(`${result.stderr}\n${result.stdout}`)) {
      throw rateLimitedError(result);
    }
    const chunk = mapPipelines(parseJsonStdout<GlabPipelineJson[]>(result));
    rows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
  }
  return rows;
}
