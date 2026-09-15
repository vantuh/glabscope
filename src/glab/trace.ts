export function traceArgv(jobId: string): string[] {
  if (!/^\d+$/.test(jobId)) {
    throw new Error("Job id must be numeric");
  }
  return ["ci", "trace", jobId];
}
