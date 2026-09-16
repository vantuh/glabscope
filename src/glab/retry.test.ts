import { expect, mock, spyOn, test } from "bun:test";
import { isRetryableJob, parseRetriedJobId, retryArgv, retryJob } from "./retry.ts";
import * as runModule from "./run.ts";

/** stdout recorded from the format string in the installed glab 1.117.0 binary. */
const RETRY_STDOUT =
  "Retried job (ID: 224356864), status: running, ref: main, " +
  "weburl: https://gitlab.example.com/group/project/-/jobs/224356864\n";

test("reads the new attempt id from glab ci retry stdout", () => {
  expect(parseRetriedJobId(RETRY_STDOUT)).toBe("224356864");
});

test("reads the id out of SGR-wrapped stdout", () => {
  const colored =
    "\u001b[32mRetried job\u001b[0m \u001b[1m(ID: 224356864)\u001b[0m, status: running\n";
  expect(parseRetriedJobId(colored)).toBe("224356864");
});

test("stdout without the pattern yields no id", () => {
  expect(parseRetriedJobId("Retried job\n")).toBeNull();
  expect(parseRetriedJobId("")).toBeNull();
});

test("retryJob retries the given job id through glab ci retry", async () => {
  const calls: string[][] = [];
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async (args) => {
    calls.push(args);
    return { stdout: RETRY_STDOUT, stderr: "", code: 0 };
  });
  try {
    expect(await retryJob("224356863", "/tmp")).toEqual({ jobId: "224356864" });
    expect(calls).toEqual([["ci", "retry", "224356863"]]);
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("retryJob surfaces stderr on a nonzero exit", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "",
    stderr: "job is not retryable\n",
    code: 1,
  });
  try {
    await expect(retryJob("224356863", "/tmp")).rejects.toThrow("job is not retryable");
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("retryJob reports a success whose stdout names no id", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "Retried job\n",
    stderr: "",
    code: 0,
  });
  try {
    expect(await retryJob("224356863", "/tmp")).toEqual({ jobId: null });
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("retryArgv only accepts numeric job ids", () => {
  expect(retryArgv("12")).toEqual(["ci", "retry", "12"]);
  expect(() => retryArgv("lint")).toThrow("Job id must be numeric");
  expect(() => retryArgv("")).toThrow("Job id must be numeric");
});

function job(status: string, isBridge = false) {
  return { status, isBridge };
}

test("only failed and canceled jobs are retryable", () => {
  // GitLab's GraphQL statuses are uppercase; the bucket helpers fold case too.
  const retryable = ["FAILED", "CANCELED", "failed", "canceled"];
  const refused = ["SUCCESS", "RUNNING", "PENDING", "SKIPPED", "MANUAL", "CREATED"];
  for (const status of [...retryable, ...refused]) {
    expect(isRetryableJob(job(status))).toBe(retryable.includes(status));
  }
});

test("a failed bridge job is never retryable here", () => {
  expect(isRetryableJob(job("FAILED", true))).toBe(false);
  expect(isRetryableJob(job("failed", true))).toBe(false);
});
