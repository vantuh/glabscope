import { expect, test } from "bun:test";
import { emptyModel, focusedJob, reduce, selectedPipeline, shouldPollGraph, shouldPollList } from "./model.ts";
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

function graph(jobs: JobNode[], status = "SUCCESS"): PipelineGraph {
  return { pipelineGid: "gid://gitlab/Ci::Pipeline/1", iid: "9", status, jobs, truncated: false };
}

function job(name: string, kind = "BUILD"): JobNode {
  return {
    id: name,
    numericId: name,
    name,
    status: "success",
    bucket: "success",
    kind,
    stage: "build",
    needsNames: [],
    isBridge: kind === "BRIDGE",
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

test("polling is only on the graph of an active pipeline", () => {
  const running = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a")], "RUNNING"),
  });
  expect(shouldPollGraph(running)).toBe(true);
  const openingLogs = reduce(running, { type: "openLogs" });
  expect(shouldPollGraph(reduce(openingLogs, { type: "logsReady" }))).toBe(false);
  expect(
    shouldPollGraph(reduce(emptyModel, { type: "openGraph", graph: graph([job("a")], "SUCCESS") })),
  ).toBe(false);
  expect(shouldPollGraph(reduce(running, { type: "back" }))).toBe(false);
});

test("list polling only on the list screen with an active pipeline", () => {
  const active = reduce(emptyModel, {
    type: "pipelines",
    pipelines: [pipeline(30, 3, "success"), pipeline(20, 2, "running")],
  });
  expect(shouldPollList(active)).toBe(true);
  expect(shouldPollList(reduce(active, { type: "openGraph", graph: graph([job("a")]) }))).toBe(false);
  expect(
    shouldPollList(reduce(emptyModel, { type: "pipelines", pipelines: [pipeline(1, 1), pipeline(2, 2, "failed")] })),
  ).toBe(false);
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
