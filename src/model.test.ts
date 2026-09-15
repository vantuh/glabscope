import { expect, test } from "bun:test";
import { emptyModel, focusedJob, nextPollDelay, reduce, selectedPipeline, shouldPollGraph } from "./model.ts";
import type { JobNode, PipelineGraph } from "./glab/graph.ts";
import type { PipelineRow } from "./glab/list.ts";

function pipeline(id: number, iid: number): PipelineRow {
  return {
    id,
    iid,
    status: "success",
    bucket: "success",
    ref: "main",
    source: "push",
  };
}

function graph(jobs: JobNode[], status = "SUCCESS"): PipelineGraph {
  return { pipelineGid: "gid://gitlab/Ci::Pipeline/1", iid: "9", status, jobs };
}

function job(name: string, kind = "BUILD"): JobNode {
  return {
    id: name,
    numericId: "1",
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
  model = reduce(model, { type: "moveJob", delta: 1 });
  model = reduce(model, { type: "openLogs" });
  expect(model.screen).toBe("logs");
  expect(focusedJob(model)?.isBridge).toBe(true);
  expect(model.graph?.iid).toBe("9");
});

test("log screen stays after tracer exits; back returns to the same job", () => {
  let model = reduce(emptyModel, { type: "openGraph", graph: graph([job("a"), job("b")]) });
  model = reduce(model, { type: "moveJob", delta: 1 });
  model = reduce(model, { type: "openLogs" });
  model = reduce(model, { type: "logChunk", chunk: "hello\n" });
  model = reduce(model, { type: "logDone" });
  expect(model.screen).toBe("logs");
  expect(model.logDone).toBe(true);
  expect(model.logBuffer).toContain("hello");
  model = reduce(model, { type: "back" });
  expect(model.screen).toBe("graph");
  expect(focusedJob(model)?.name).toBe("b");
});

test("polling delay backs off on 429", () => {
  expect(nextPollDelay(4000, false)).toBe(4000);
  expect(nextPollDelay(4000, true)).toBe(8000);
  expect(nextPollDelay(20000, true)).toBe(30000);
});

test("polling is only on the graph of an active pipeline", () => {
  const running = reduce(emptyModel, {
    type: "openGraph",
    graph: graph([job("a")], "RUNNING"),
  });
  expect(shouldPollGraph(running)).toBe(true);
  expect(shouldPollGraph(reduce(running, { type: "openLogs" }))).toBe(false);
  expect(
    shouldPollGraph(reduce(emptyModel, { type: "openGraph", graph: graph([job("a")], "SUCCESS") })),
  ).toBe(false);
});
