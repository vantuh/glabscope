import { glabBin } from "./probe.ts";

export function traceArgv(jobId: string): string[] {
  if (!/^\d+$/.test(jobId)) {
    throw new Error("Job id must be numeric");
  }
  return ["ci", "trace", jobId];
}

export function spawnTrace(jobId: string): ReturnType<typeof Bun.spawn> {
  return Bun.spawn([glabBin(), ...traceArgv(jobId)], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
}
