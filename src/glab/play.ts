import { runGlab } from "./run.ts";
import type { JobNode } from "./graph.ts";

/**
 * `glab ci trigger <job-id>` is the CLI's play route for a waiting manual job
 * (it calls `POST /jobs/:id/play`); with a numeric id no `-p`/`-b` is needed.
 *
 * The command prints `Triggered job (ID: <id>), status: <status>, ref: <ref>,
 * weburl: <url>`. The format string is in the installed glab 1.117.0 binary,
 * beside retry's `Retried job (ID: <id>), ...`. glab's log writer may decorate
 * the line with SGR when stdout is a TTY, so the pattern is matched against
 * stdout with SGR removed.
 */
const TRIGGERED_ID = /Triggered job \(ID: (\d+)\)/;
const SGR = /\u001b\[[0-9;]*m/g;

export type PlayResult = {
  /**
   * The played job's id, or null when stdout did not name one. Upstream,
   * `PlayBuildService` enqueues the same build, so this normally matches the id
   * that was passed; GitLab's own invalid-transition fallback is the one path
   * that answers with a new attempt instead. Not verified against a live
   * GitLab: see the change's design notes.
   */
  jobId: string | null;
};

export function playArgv(jobId: string): string[] {
  if (!/^\d+$/.test(jobId)) {
    throw new Error("Job id must be numeric");
  }
  return ["ci", "trigger", jobId];
}

export function parseTriggeredJobId(stdout: string): string | null {
  return TRIGGERED_ID.exec(stdout.replace(SGR, ""))?.[1] ?? null;
}

/** Only a job waiting for a manual action can be run; a bridge goes elsewhere. */
export function isPlayableJob(job: Pick<JobNode, "status" | "isBridge">): boolean {
  if (job.isBridge) {
    return false;
  }
  return job.status.toLowerCase() === "manual";
}

export async function playJob(
  jobId: string,
  cwd = process.cwd(),
): Promise<PlayResult> {
  const result = await runGlab(playArgv(jobId), { cwd });
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `glab ci trigger exited ${result.code}`,
    );
  }
  return { jobId: parseTriggeredJobId(result.stdout) };
}
