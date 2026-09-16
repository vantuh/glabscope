import { expect, mock, spyOn, test } from "bun:test";
import { isPlayableJob, parseTriggeredJobId, playArgv, playJob } from "./play.ts";
import * as runModule from "./run.ts";

/**
 * stdout built from the format string in the installed glab 1.117.0 binary:
 * `Triggered job (ID: %d), status: %s, ref: %s, weburl: %s`.
 */
const TRIGGERED_STDOUT =
  "Triggered job (ID: 224356864), status: pending, ref: main, " +
  "weburl: https://gitlab.example.com/group/project/-/jobs/224356864\n";

test("reads the played job id from glab ci trigger stdout", () => {
  expect(parseTriggeredJobId(TRIGGERED_STDOUT)).toBe("224356864");
});

test("reads the id out of SGR-wrapped stdout", () => {
  const colored =
    "\u001b[32mTriggered job\u001b[0m \u001b[1m(ID: 224356864)\u001b[0m, status: pending\n";
  expect(parseTriggeredJobId(colored)).toBe("224356864");
});

test("stdout without the pattern yields no id", () => {
  expect(parseTriggeredJobId("Triggered job\n")).toBeNull();
  expect(parseTriggeredJobId("")).toBeNull();
});

test("playJob triggers the given job id through glab ci trigger", async () => {
  const calls: string[][] = [];
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async (args) => {
    calls.push(args);
    return { stdout: TRIGGERED_STDOUT, stderr: "", code: 0 };
  });
  try {
    expect(await playJob("224356863", "/tmp")).toEqual({ jobId: "224356864" });
    expect(calls).toEqual([["ci", "trigger", "224356863"]]);
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("playJob surfaces stderr on a nonzero exit", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "",
    stderr: "Could not trigger job with ID: 224356863\n",
    code: 1,
  });
  try {
    await expect(playJob("224356863", "/tmp")).rejects.toThrow(
      "Could not trigger job with ID: 224356863",
    );
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("playJob reports a success whose stdout names no id", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "Triggered job\n",
    stderr: "",
    code: 0,
  });
  try {
    expect(await playJob("224356863", "/tmp")).toEqual({ jobId: null });
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

test("playArgv only accepts numeric job ids, before spawning anything", async () => {
  expect(playArgv("12")).toEqual(["ci", "trigger", "12"]);
  expect(() => playArgv("lint")).toThrow("Job id must be numeric");
  expect(() => playArgv("")).toThrow("Job id must be numeric");

  const calls: string[][] = [];
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async (args) => {
    calls.push(args);
    return { stdout: "", stderr: "", code: 0 };
  });
  try {
    await expect(playJob("lint", "/tmp")).rejects.toThrow("Job id must be numeric");
    expect(calls).toEqual([]);
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});

function job(status: string, isBridge = false) {
  return { status, isBridge };
}

test("only jobs waiting for a manual action can be run", () => {
  // GitLab's GraphQL statuses are uppercase; the gate folds case like the buckets do.
  const playable = ["MANUAL", "manual"];
  const refused = [
    "SUCCESS",
    "FAILED",
    "CANCELED",
    "SKIPPED",
    "SCHEDULED",
    "CREATED",
    "RUNNING",
    "PENDING",
  ];
  for (const status of [...playable, ...refused]) {
    expect(isPlayableJob(job(status))).toBe(playable.includes(status));
  }
});

test("a manual bridge job is never run here", () => {
  expect(isPlayableJob(job("MANUAL", true))).toBe(false);
  expect(isPlayableJob(job("manual", true))).toBe(false);
});
