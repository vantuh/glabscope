import { expect, test } from "bun:test";
import { emptyModel, focusedAttempt, focusedJob, reduce, selectedPipeline, shouldPollGraph, shouldPollList, type AppModel } from "./model.ts";
import { emptyLogTrace } from "./log-text.ts";
import type { JobNode, PipelineGraph } from "./glab/graph.ts";
import type { PipelineRow } from "./glab/list.ts";

function pipeline(id: number, iid: number, status = "success"): PipelineRow {
  const bucket =
    status === "running" || status === "pending" ? ("running-or-pending" as const) : status === "failed" ? ("failed" as const) : ("success" as const);
  return {
    id,
    iid,
    status,
    bucket,
    ref: "main",
    source: "push",
  };
}

function graph(jobs: JobNode[], status = "SUCCESS", stageNames: string[] = []): PipelineGraph {
  return {
    pipelineGid: "gid://gitlab/Ci::Pipeline/1",
    iid: "9",
    status,
    jobs,
    stageNames,
    truncated: false,
  };
}

function job(name: string, kind = "BUILD", stage = "build"): JobNode {
  return {
    id: name,
    numericId: name,
    name,
    status: "success",
    bucket: "success",
    kind,
    stage,
    needsNames: [],
    isBridge: kind === "BRIDGE",
    retried: false,
  };
}

test("opening the graph uses the highlighted pipeline, not latest", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2), pipeline(10, 1)],
  });
  model = reduce(model, { type: "moveList", delta: 2 });
  expect(selectedPipeline(model)?.id).toBe(10);
  expect(selectedPipeline(model)?.iid).toBe(1);
});

test("esc from graph returns to list with selection preserved", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2)],
  });
  model = reduce(model, { type: "moveList", delta: 1 });
  model = reduce(model, { type: "openGraph", graph: graph([job("a")]) });
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("list");
  expect(selectedPipeline(model)?.id).toBe(20);
});

test("bridge job opens logs on the same pipeline graph", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("build"), job("trigger", "BRIDGE")]),
  });
  model = reduce(model, { type: "focusJob", id: "trigger" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  expect(model.screen).toBe("logs");
  expect(focusedJob(model)?.isBridge).toBe(true);
  expect(model.graph?.iid).toBe("9");
});

test("log screen stays after tracer exits; back returns to the same job", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([job("a"), job("b")]) });
  model = reduce(model, { type: "focusJob", id: "b" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  model = reduce(model, { type: "logChunk", chunk: "\u001b[31mhello\n" });
  model = reduce(model, { type: "logDone" });
  expect(model.screen).toBe("logs");
  expect(model.logDone).toBe(true);
  expect(model.logBuffer).toContain("hello");
  expect(model.logBuffer).not.toContain("\u001b");
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("graph");
  expect(focusedJob(model)?.name).toBe("b");
});

test("logsReady clears leftover SGR from a previous job", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([job("a")]) });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  model = reduce(model, { type: "logChunk", chunk: "\u001b[31" });
  expect(model.logTrace.leftover).toBe("\u001b[31");
  model = reduce(model, { type: "back" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  expect(model.logTrace).toEqual(emptyLogTrace());
  model = reduce(model, { type: "logChunk", chunk: "plain" });
  expect(model.logTrace.runs).toEqual([{ text: "plain", bold: false }]);
});

test("graph polling runs on the graph screen whenever a graph is loaded", () => {
  const running = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a")], "RUNNING"),
  });
  expect(shouldPollGraph(running)).toBe(true);
  const openingLogs = reduce(running, { type: "openLogs" });
  expect(shouldPollGraph(reduce(openingLogs, { type: "logsReady" }))).toBe(false);
  expect(shouldPollGraph(reduce(running, { type: "back" }))).toBe(false);
  // Terminal graphs keep watching (at the slower watch interval).
  expect(
    shouldPollGraph(reduce(emptyModel, { type: "openGraph", graph: graph([job("a")], "SUCCESS") })),
  ).toBe(true);
});

test("list polling runs on the list screen whenever rows exist", () => {
  const active = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3, "success"), pipeline(20, 2, "running")],
  });
  expect(shouldPollList(active)).toBe(true);
  expect(shouldPollList(reduce(active, { type: "openGraph", graph: graph([job("a")]) }))).toBe(false);
  // Terminal-only rows keep watching (at the slower watch interval).
  expect(
    shouldPollList(reduce(emptyModel, { type: "pipelines", pipelines: [pipeline(1, 1), pipeline(2, 2, "failed")] })),
  ).toBe(true);
  const navigating = reduce(active, {
    type: "startNavigating",
    target: { kind: "graph", pipelineIid: "2" },
  });
  expect(shouldPollList(navigating)).toBe(true);
  const empty = reduce(emptyModel, { type: "pipelines", pipelines: [] });
  expect(shouldPollList(empty)).toBe(false);
});

test("refresh while logs keeps the traced job even if focus would fall back", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a"), job("b")], "RUNNING"),
  });
  model = reduce(model, { type: "focusJob", id: "b" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  model = reduce(model, { type: "refreshGraph", graph: graph([job("a")], "RUNNING") });
  expect(model.screen).toBe("logs");
  expect(model.logJobId).toBe("b");
  expect(model.focusedJobIndex).toBe(1);
});

test("emptyModel navigating is null", () => {
  expect(emptyModel.navigating).toBeNull();
});

test("startNavigating sets navigating to the given target", () => {
  const target = { kind: "graph" as const, pipelineIid: "5" };
  expect(reduce(emptyModel, { type: "startNavigating", target }).navigating).toEqual(target);
});

test("openGraph and error clear navigating", () => {
  const loading = reduce(emptyModel, {
    type: "startNavigating",
    target: { kind: "graph", pipelineIid: "5" },
  });
  expect(reduce(loading, { type: "openGraph", graph: graph([job("a")]) }).navigating).toBeNull();
  expect(reduce(loading, { type: "error", message: "fail", fatal: false }).navigating).toBeNull();
});

test("openLogs only sets navigating; logsReady opens the log screen", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([job("a")]) });
  model = reduce(model, { type: "openLogs" });
  expect(model.screen).toBe("graph");
  expect(model.navigating).toEqual({ kind: "logs", jobId: "a" });
  model = reduce(model, { type: "logsReady" });
  expect(model.screen).toBe("logs");
  expect(model.logJobId).toBe("a");
  expect(model.logBuffer).toBe("");
  expect(model.logDone).toBe(false);
  expect(model.navigating).toBeNull();
});

test("logsReady is ignored after log navigation is cancelled", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([job("a")]) });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("graph");
  expect(model.navigating).toBeNull();
  expect(reduce(model, { type: "logsReady" })).toEqual(model);
});

test("non-fatal error clears on back", () => {
  let model = reduce(emptyModel, { type: "pipelines", pipelines: [pipeline(1, 1)] });
  model = reduce(model, { type: "error", message: "graphql failed", fatal: false });
  model = reduce(model, { type: "back" });
  expect(model.error).toBeNull();
  expect(model.screen).toBe("list");
});

test("refresh keeps the selected pipeline by id when rows are reordered", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2), pipeline(10, 1)],
  });
  model = reduce(model, { type: "moveList", delta: 2 });
  expect(selectedPipeline(model)?.id).toBe(10);
  model = reduce(model, {
    type: "pipelines",
    pipelines: [pipeline(10, 1), pipeline(20, 2), pipeline(30, 3)],
  });
  expect(selectedPipeline(model)?.id).toBe(10);
  expect(model.selectedIndex).toBe(0);
});

test("refresh keeps the selection when rows are retained in order", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2)],
  });
  model = reduce(model, { type: "moveList", delta: 1 });
  model = reduce(model, { type: "pipelines", pipelines: [pipeline(30, 3), pipeline(20, 2)] });
  expect(selectedPipeline(model)?.id).toBe(20);
  expect(model.selectedIndex).toBe(1);
});

test("refresh with a removed selected pipeline clamps to the nearest row", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2), pipeline(10, 1)],
  });
  model = reduce(model, { type: "moveList", delta: 2 });
  expect(selectedPipeline(model)?.id).toBe(10);
  model = reduce(model, { type: "pipelines", pipelines: [pipeline(30, 3), pipeline(20, 2)] });
  expect(selectedPipeline(model)?.id).toBe(20);
  expect(model.selectedIndex).toBe(1);
});

test("refreshError keeps the current data and is non-fatal", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3), pipeline(20, 2, "running")],
  });
  model = reduce(model, { type: "moveList", delta: 1 });
  model = reduce(model, { type: "refreshError", message: "429 Too Many Requests" });
  expect(model.refreshWarning).toBe("429 Too Many Requests");
  expect(model.error).toBeNull();
  expect(model.errorFatal).toBe(false);
  expect(model.pipelines).toHaveLength(2);
  expect(selectedPipeline(model)?.id).toBe(20);
  expect(model.screen).toBe("list");
});

test("refreshError does not touch user-action errors", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(1, 1, "running")],
  });
  model = reduce(model, { type: "error", message: "graph failed", fatal: false });
  model = reduce(model, { type: "refreshError", message: "list failed" });
  expect(model.error).toBe("graph failed");
  expect(model.refreshWarning).toBe("list failed");
});

test("a successful refresh clears a recovered refresh warning", () => {
  let model = reduce(emptyModel, { type: "pipelines", pipelines: [pipeline(1, 1)] });
  model = reduce(model, { type: "refreshError", message: "list failed" });
  expect(model.refreshWarning).toBe("list failed");
  model = reduce(model, { type: "pipelines", pipelines: [pipeline(1, 1), pipeline(2, 2, "running")] });
  expect(model.refreshWarning).toBeNull();
  expect(model.error).toBeNull();
  expect(model.errorFatal).toBe(false);
});

test("a successful graph refresh clears a recovered refresh warning", () => {
  let model = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(1, 1, "running")],
  });
  model = reduce(model, { type: "openGraph", graph: graph([job("a")], "RUNNING") });
  model = reduce(model, { type: "refreshError", message: "graphql failed" });
  expect(model.refreshWarning).toBe("graphql failed");
  expect(model.error).toBeNull();
  model = reduce(model, { type: "refreshGraph", graph: graph([job("a")], "RUNNING") });
  expect(model.refreshWarning).toBeNull();
  expect(model.error).toBeNull();
  expect(model.errorFatal).toBe(false);
});

test("refreshGraph preserves the focused job when refreshed jobs are reordered", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a"), job("b")], "RUNNING"),
  });
  model = reduce(model, { type: "focusJob", id: "b" });
  model = reduce(model, {
    type: "refreshGraph",
    graph: graph([job("b"), job("a")], "RUNNING"),
  });
  expect(focusedJob(model)?.id).toBe("b");
});

function attempt(name: string, numericId: string, retried: boolean): JobNode {
  return {
    ...job(name),
    id: `gid://gitlab/Ci::Build/${numericId}`,
    numericId,
    retried,
  };
}

test("refreshGraph moves focus to a job's new attempt when the old id is gone", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a"), attempt("lint", "10", false)], "RUNNING"),
  });
  // Focus the second card, so a fallback-to-first-card implementation cannot
  // pass by accident.
  model = reduce(model, { type: "focusJob", id: "gid://gitlab/Ci::Build/10" });
  // The superseded attempt stays in the payload for the attempts list.
  model = reduce(model, {
    type: "refreshGraph",
    graph: graph(
      [job("a"), attempt("lint", "10", true), attempt("lint", "12", false)],
      "RUNNING",
    ),
  });
  expect(focusedJob(model)?.name).toBe("lint");
  expect(focusedJob(model)?.numericId).toBe("12");
});

test("refreshGraph falls back to the nearest row when the focused job is gone", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a"), job("b")], "RUNNING"),
  });
  model = reduce(model, { type: "focusJob", id: "b" });
  model = reduce(model, {
    type: "refreshGraph",
    graph: graph([job("c")], "RUNNING"),
  });
  expect(focusedJob(model)?.name).toBe("c");
});

test("refresh while logs moves focus to the new attempt but keeps tracing the old one", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a"), attempt("lint", "10", false)], "RUNNING"),
  });
  model = reduce(model, { type: "focusJob", id: "gid://gitlab/Ci::Build/10" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  model = reduce(model, {
    type: "refreshGraph",
    graph: graph(
      [job("a"), attempt("lint", "10", true), attempt("lint", "12", false)],
      "RUNNING",
    ),
  });
  expect(model.logJobId).toBe("10");
  expect(model.screen).toBe("logs");
  expect(focusedJob(model)?.name).toBe("lint");
  expect(focusedJob(model)?.numericId).toBe("12");
});

test("manual refresh flag is set by the action and cleared by outcomes", () => {
  let model = reduce(emptyModel, { type: "pipelines", pipelines: [pipeline(1, 1)] });
  model = reduce(model, { type: "manualRefresh", target: "list" });
  expect(model.manualRefresh).toBe("list");
  model = reduce(model, { type: "pipelines", pipelines: [pipeline(1, 1)] });
  expect(model.manualRefresh).toBeNull();
  model = reduce(model, { type: "manualRefresh", target: "graph" });
  model = reduce(model, { type: "refreshError", message: "refresh failed" });
  expect(model.manualRefresh).toBeNull();
  expect(model.refreshWarning).toBe("refresh failed");
});

test("openGraph focuses the first job of the leftmost GitLab stage", () => {
  const security = { ...job("sast", "BUILD", "security"), id: "gid://gitlab/Ci::Build/2", numericId: "2" };
  const prepare = { ...job("prepare", "BUILD", "prepare"), id: "gid://gitlab/Ci::Build/1", numericId: "1" };
  const model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([security, prepare], "SUCCESS", ["prepare", "security"]),
  });
  expect(focusedJob(model)?.name).toBe("prepare");
});

test("enter on a retried card opens attempts; logs return there; esc returns to graph", () => {
  const failed = {
    ...job("lint"),
    id: "gid://gitlab/Ci::Build/10",
    numericId: "10",
    retried: true,
    status: "failed",
    bucket: "failed" as const,
  };
  const latest = {
    ...job("lint"),
    id: "gid://gitlab/Ci::Build/12",
    numericId: "12",
  };
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([failed, latest]) });
  expect(focusedJob(model)?.id).toBe(latest.id);
  model = reduce(model, { type: "openAttempts" });
  expect(model.screen).toBe("attempts");
  expect(focusedAttempt(model)?.numericId).toBe("12");
  model = reduce(model, { type: "focusAttempt", id: failed.id });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  expect(model.screen).toBe("logs");
  expect(model.logJobId).toBe("10");
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("attempts");
  expect(focusedAttempt(model)?.numericId).toBe("10");
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("graph");
});

test("graph polling continues on the attempts screen", () => {
  const failed = { ...job("lint"), id: "10", numericId: "10", retried: true };
  const latest = { ...job("lint"), id: "12", numericId: "12" };
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([failed, latest]) });
  model = reduce(model, { type: "openAttempts" });
  expect(shouldPollGraph(model)).toBe(true);
});

function retryableJob(name: string, numericId = name, status = "failed"): JobNode {
  return {
    ...job(name),
    id: `gid://gitlab/Ci::Build/${numericId}`,
    numericId,
    status,
    bucket: status === "canceled" ? "other" : "failed",
  };
}

function graphWithFailedJob(): PipelineGraph {
  return graph([retryableJob("lint", "10")], "FAILED");
}

test("startRetry marks one restart in flight and clears the previous notice", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10", "success") });
  expect(model.retryMessage).toBe("only failed or canceled jobs can be retried");
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  expect(model.retry).toEqual({ jobId: "10", screen: "graph" });
  expect(model.retryMessage).toBeNull();
});

test("a second retry while one is in flight is rejected", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  const inFlight = model;
  expect(reduce(inFlight, { type: "startRetry", job: retryableJob("lint", "10") })).toEqual(
    inFlight,
  );
});

test("startRetry refuses a job whose status is not retryable", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  for (const status of ["success", "running", "pending", "skipped", "manual", "created"]) {
    const refused = reduce(model, { type: "startRetry", job: retryableJob("lint", "10", status) });
    expect(refused.retry).toBeNull();
    expect(refused.retryMessage).toBe("only failed or canceled jobs can be retried");
  }
  const canceled = reduce(model, { type: "startRetry", job: retryableJob("lint", "10", "canceled") });
  expect(canceled.retry).toEqual({ jobId: "10", screen: "graph" });
});

test("startRetry refuses a bridge job in its own words", () => {
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([retryableJob("trigger", "10")], "FAILED"),
  });
  const bridge = { ...retryableJob("trigger", "10"), kind: "BRIDGE", isBridge: true };
  model = reduce(model, { type: "startRetry", job: bridge });
  expect(model.retry).toBeNull();
  expect(model.retryMessage).toBe("this job cannot be retried here");
});

test("a rejected retry clears the in-flight mark and keeps a non-fatal message", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  model = reduce(model, { type: "retryFailed", message: "job is not retryable" });
  expect(model.retry).toBeNull();
  expect(model.retryMessage).toBe("job is not retryable");
  expect(model.error).toBeNull();
  expect(model.errorFatal).toBe(false);
  expect(model.graph).not.toBeNull();
  expect(model.screen).toBe("graph");
});

test("navigation or another retry clears the retry notice", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10", "success") });
  expect(model.retryMessage).toBe("only failed or canceled jobs can be retried");
  expect(reduce(model, { type: "focusJob", id: "gid://gitlab/Ci::Build/10" }).retryMessage).toBeNull();
  expect(reduce(model, { type: "startRetry", job: retryableJob("lint", "10") }).retryMessage).toBeNull();
});

test("a successful refresh keeps the retry notice until the operator moves", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10", "success") });
  // A poll landing right after the notice must not wipe the reason with it.
  model = reduce(model, {
    type: "refreshGraph",
    graph: graph([retryableJob("lint", "10")], "FAILED"),
  });
  expect(model.retryMessage).toBe("only failed or canceled jobs can be retried");
});

test("a graph refresh while the restart runs leaves the retry in flight", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  const refreshed = reduce(model, {
    type: "refreshGraph",
    graph: graph([retryableJob("lint", "10"), retryableJob("lint", "12")], "RUNNING"),
  });
  expect(refreshed.retry).toEqual({ jobId: "10", screen: "graph" });
});

test("retrySucceeded on the graph clears the in-flight mark", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  model = reduce(model, { type: "retrySucceeded", jobId: "12" });
  expect(model.retry).toBeNull();
  expect(model.retryMessage).toBeNull();
  expect(model.screen).toBe("graph");
});

test("a retry that lands after another log was opened leaves that log alone", () => {
  const first = { ...retryableJob("lint", "10"), id: "gid://gitlab/Ci::Build/10" };
  const second = { ...retryableJob("deploy", "20"), id: "gid://gitlab/Ci::Build/20" };
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([first, second], "FAILED"),
  });
  model = openLogOn(model, "gid://gitlab/Ci::Build/10");
  model = reduce(model, { type: "logChunk", chunk: "first attempt\n" });
  model = reduce(model, { type: "startRetry", job: first });
  expect(model.retry).toEqual({ jobId: "10", screen: "logs" });

  // The operator leaves for the other job's log while the restart is in flight.
  model = reduce(model, { type: "back" });
  model = openLogOn(model, "gid://gitlab/Ci::Build/20");
  model = reduce(model, { type: "logChunk", chunk: "second job\n" });
  expect(model.logJobId).toBe("20");

  model = reduce(model, { type: "retrySucceeded", jobId: "12" });
  expect(model.screen).toBe("logs");
  expect(model.logJobId).toBe("20");
  expect(model.logBuffer).toContain("second job");
  expect(model.logBuffer).not.toContain("first attempt");
  expect(model.retry).toBeNull();
});

function openLogOn(model: AppModel, id: string): AppModel {
  const focused = reduce(model, { type: "focusJob", id });
  return reduce(reduce(focused, { type: "openLogs" }), { type: "logsReady" });
}

test("retrySucceeded re-attaches the log screen to the new attempt", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = openLogOn(model, "gid://gitlab/Ci::Build/10");
  model = reduce(model, { type: "logChunk", chunk: "boom\n" });
  model = reduce(model, { type: "logDone" });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  model = reduce(model, { type: "retrySucceeded", jobId: "12" });

  expect(model.screen).toBe("logs");
  expect(model.logJobId).toBe("12");
  expect(model.logBuffer).toBe("");
  expect(model.logTrace).toEqual(emptyLogTrace());
  expect(model.logDone).toBe(false);
  expect(model.retry).toBeNull();
  expect(model.retryMessage).toBeNull();
  expect(focusedJob(model)?.numericId).toBe("10");
});

test("re-attaching the trace moves graph focus to the job's new attempt", () => {
  const oldAttempt = { ...retryableJob("lint", "10"), retried: true };
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([oldAttempt, retryableJob("lint", "12")], "FAILED"),
  });
  model = reduce(model, { type: "openAttempts" });
  model = reduce(model, { type: "focusAttempt", id: "gid://gitlab/Ci::Build/10" });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logsReady" });
  expect(model.logJobId).toBe("10");

  model = reduce(model, { type: "startRetry", job: oldAttempt });
  model = reduce(model, { type: "retrySucceeded", jobId: "14" });
  expect(model.logJobId).toBe("14");
  expect(focusedJob(model)?.numericId).toBe("12");
});

test("a retry whose new attempt cannot be identified returns to the graph", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = openLogOn(model, "gid://gitlab/Ci::Build/10");
  model = reduce(model, { type: "logChunk", chunk: "boom\n" });
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  model = reduce(model, { type: "retrySucceeded", jobId: null });

  expect(model.screen).toBe("graph");
  expect(model.logJobId).toBeNull();
  expect(model.retry).toBeNull();
  expect(model.retryMessage).toBe("retried, but the new attempt could not be followed");
  expect(focusedJob(model)?.numericId).toBe("10");
});

test("refreshGraph follows the attempt that replaced the job's latest one", () => {
  const superseded = { ...retryableJob("lint", "10"), retried: true };
  const latest = { ...retryableJob("lint", "12"), retried: false };
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([superseded, latest], "FAILED"),
  });
  model = reduce(model, { type: "openAttempts" });
  expect(focusedAttempt(model)?.numericId).toBe("12");

  model = reduce(model, {
    type: "refreshGraph",
    graph: graph([superseded, { ...latest, retried: true }, retryableJob("lint", "14")], "RUNNING"),
  });
  expect(model.screen).toBe("attempts");
  expect(focusedAttempt(model)?.numericId).toBe("14");
});

test("refreshGraph keeps attempts focus on an earlier attempt that was retried", () => {
  const superseded = { ...retryableJob("lint", "10"), retried: true };
  const latest = { ...retryableJob("lint", "12"), retried: false };
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([superseded, latest], "FAILED"),
  });
  model = reduce(model, { type: "openAttempts" });
  model = reduce(model, { type: "focusAttempt", id: "gid://gitlab/Ci::Build/10" });
  expect(focusedAttempt(model)?.numericId).toBe("10");

  model = reduce(model, {
    type: "refreshGraph",
    graph: graph([superseded, { ...latest, retried: true }, retryableJob("lint", "14")], "RUNNING"),
  });
  expect(focusedAttempt(model)?.numericId).toBe("10");
});

test("a retry started from the attempts list never re-attaches a log screen", () => {
  const superseded = { ...retryableJob("lint", "10"), retried: true };
  const latest = { ...retryableJob("lint", "12"), retried: false };
  let model = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([superseded, latest], "FAILED"),
  });
  model = reduce(model, { type: "openAttempts" });
  model = reduce(model, { type: "logChunk", chunk: "kept\n" });
  model = reduce(model, { type: "startRetry", job: latest });
  expect(model.retry).toEqual({ jobId: "12", screen: "attempts" });
  model = reduce(model, { type: "retrySucceeded", jobId: "14" });
  expect(model.screen).toBe("attempts");
  expect(model.logJobId).toBeNull();
  expect(model.retry).toBeNull();
});

test("a second retry from the log while one is in flight is rejected", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graphWithFailedJob() });
  model = openLogOn(model, "gid://gitlab/Ci::Build/10");
  model = reduce(model, { type: "startRetry", job: retryableJob("lint", "10") });
  expect(model.retry).toEqual({ jobId: "10", screen: "logs" });
  const inFlight = model;
  expect(reduce(inFlight, { type: "startRetry", job: retryableJob("lint", "10") })).toEqual(
    inFlight,
  );
  expect(reduce(inFlight, { type: "retrySucceeded", jobId: "12" }).logJobId).toBe("12");
});
