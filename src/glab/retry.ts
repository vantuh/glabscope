import { runGlab } from "./run.ts";
import type { JobNode } from "./graph.ts";

/**
 * `glab ci retry` prints `Retried job (ID: <id>), status: <status>, ref: <ref>,
 * weburl: <url>`. The format string is in the installed glab 1.117.0 binary.
 * glab's log writer may decorate the line with SGR when stdout is a TTY, so
 * the pattern is matched against stdout with SGR removed.
 */
const RETRIED_ID = /Retried job \(ID: (\d+)\)/;
const SGR = /\u001b\[[0-9;]*m/g;

export type RetryResult = {
  /** The restarted attempt's job id, or null when stdout did not name one. */
  jobId: string | null;
};

export function retryArgv(jobId: string): string[] {
  if (!/^\d+$/.test(jobId)) {
    throw new Error("Job id must be numeric");
  }
  return ["ci", "retry", jobId];
}

export function parseRetriedJobId(stdout: string): string | null {
  return RETRIED_ID.exec(stdout.replace(SGR, ""))?.[1] ?? null;
}

/** Retrying a bridge job goes through GitLab's child-pipeline route, not this one. */
export function isRetryableJob(job: Pick<JobNode, "status" | "isBridge">): boolean {
  if (job.isBridge) {
    return false;
  }
  const status = job.status.toLowerCase();
  return status === "failed" || status === "canceled";
}

export async function retryJob(
  jobId: string,
  cwd = process.cwd(),
): Promise<RetryResult> {
  const result = await runGlab(retryArgv(jobId), { cwd });
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `glab ci retry exited ${result.code}`,
    );
  }
  return { jobId: parseRetriedJobId(result.stdout) };
}
