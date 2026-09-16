import { expect, test } from "bun:test";
import type { JobNode } from "../glab/graph.ts";
import { parsePipelineGraph } from "../glab/graph.ts";
import fixture from "../fixtures/pipeline-jobs-needs.json";
import { buildDag } from "./dag.ts";
import {
  EMPTY_STAGE,
  buildStageColumns,
  buildStageGraph,
  moveFocus,
  paintConnectorStrips,
} from "./stage-graph.ts";
import { latestJobs } from "../glab/graph.ts";

function job(name: string, stage: string, needsNames: string[] = [], kind = "BUILD"): JobNode {
  return {
    id: name,
    numericId: name,
    name,
    status: "success",
    bucket: "success",
    kind,
    stage,
    needsNames,
    isBridge: kind === "BRIDGE",
    retried: false,
  };
}

test("GitLab stages.nodes order columns; leftover stages follow; empty last", () => {
  const parsed = parsePipelineGraph(fixture);
  const columns = buildStageColumns(parsed.jobs, parsed.stageNames);
  expect(columns.map((col) => col.name)).toEqual([
    "prepare",
    "secure_code",
    "metrics",
    "build_images",
    "deploy",
    "security",
  ]);
  expect(columns[0]?.name).toBe("prepare");
  const prepareIndex = columns.findIndex((col) => col.name === "prepare");
  const securityIndex = columns.findIndex((col) => col.name === "security");
  expect(prepareIndex).toBeGreaterThan(-1);
  expect(securityIndex).toBeGreaterThan(prepareIndex);

  const leftover = buildStageColumns(
    [job("lint", "test"), job("compile", "build"), job("orphan", "")],
    ["build"],
  );
  expect(leftover.map((col) => col.name)).toEqual(["build", "test", EMPTY_STAGE]);
});

test("without stages.nodes, columns follow first-seen named stages", () => {
  const columns = buildStageColumns([
    job("lint", "test"),
    job("compile", "build"),
    job("orphan", ""),
    job("unit", "test"),
    job("image", "build"),
  ]);
  expect(columns.map((col) => col.name)).toEqual(["test", "build", EMPTY_STAGE]);
  expect(columns[0]?.jobs.map((item) => item.name)).toEqual(["lint", "unit"]);
});

test("graph cards collapse retries to the latest attempt", () => {
  const graph = buildStageGraph([
    { ...job("lint", "test"), id: "10", numericId: "10", retried: true, status: "failed", bucket: "failed" },
    { ...job("lint", "test"), id: "12", numericId: "12", retried: false },
    job("compile", "build"),
  ]);
  expect(graph.columns[0]?.jobs.map((item) => item.id)).toEqual(["12"]);
  expect(graph.edges).toEqual([]);
});

test("stages-only graph has columns and zero needs edges", () => {
  const graph = buildStageGraph([job("lint", "test"), job("compile", "build")]);
  expect(graph.columns.map((col) => col.name)).toEqual(["test", "build"]);
  expect(graph.edges).toEqual([]);
});

test("diamond and fixture edges are named needs only", () => {
  const diamond = buildStageGraph([
    job("A", "one"),
    job("B", "two", ["A"]),
    job("C", "two", ["A"]),
    job("D", "three", ["B", "C"]),
  ]);
  expect(diamond.edges).toHaveLength(4);
  expect(diamond.columns.map((col) => col.name)).toEqual(["one", "two", "three"]);

  const parsed = parsePipelineGraph(fixture);
  const graph = buildStageGraph(parsed.jobs, parsed.stageNames);
  const dag = buildDag(latestJobs(parsed.jobs));
  expect(graph.edges).toEqual(dag.edges);
  expect(graph.edges.every((edge) => parsed.jobs.some((j) => j.id === edge.fromId))).toBe(true);
  const byId = new Map(parsed.jobs.map((item) => [item.id, item]));
  for (const edge of graph.edges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    expect(from && to && to.needsNames.includes(from.name)).toBe(true);
  }
});

test("moveFocus stays in-stage vertically and clamps horizontally", () => {
  const columns = buildStageColumns([
    job("a1", "s1"),
    job("a2", "s1"),
    job("a3", "s1"),
    job("b1", "s2"),
    job("c1", "s3"),
    job("c2", "s3"),
  ]);
  expect(moveFocus(columns, "a2", "up")).toBe("a1");
  expect(moveFocus(columns, "a1", "up")).toBe("a1");
  expect(moveFocus(columns, "a2", "down")).toBe("a3");
  expect(moveFocus(columns, "a3", "down")).toBe("a3");
  expect(moveFocus(columns, "a2", "up")?.startsWith("a")).toBe(true);
  expect(moveFocus(columns, "a3", "down")).toBe("a3");

  expect(moveFocus(columns, "a3", "right")).toBe("b1");
  expect(moveFocus(columns, "b1", "left")).toBe("a1");
  expect(moveFocus(columns, "c2", "left")).toBe("b1");
  expect(moveFocus(columns, "a1", "left")).toBe("a1");
  expect(moveFocus(columns, "c2", "right")).toBe("c2");

  expect(moveFocus(columns, "a1", "up")).toBe("a1");
  expect(moveFocus(columns, "a2", "down")).toBe("a3");
  const afterUp = moveFocus(columns, "a3", "up");
  expect(afterUp).toBe("a2");
  expect(columns.find((col) => col.jobs.some((item) => item.id === afterUp))?.name).toBe("s1");
});

test("connector strips draw needs paths and invent none for stages-only", () => {
  const stagesOnly = buildStageGraph([job("lint", "test"), job("compile", "build")]);
  const empty = paintConnectorStrips(stagesOnly.columns, stagesOnly.edges)
    .flat()
    .join("\n");
  expect(empty).not.toContain("▶");
  expect(empty).not.toContain("◀");
  expect(empty).not.toContain("→");
  expect(empty).not.toContain("-->");

  const adjacent = buildStageGraph([job("A", "one"), job("B", "two", ["A"])]);
  const adjacentText = paintConnectorStrips(adjacent.columns, adjacent.edges).join("\n");
  expect(adjacentText).toMatch(/▶|◀/);

  const parsed = parsePipelineGraph(fixture);
  const graph = buildStageGraph(parsed.jobs, parsed.stageNames);
  const text = paintConnectorStrips(graph.columns, graph.edges).flat().join("\n");
  expect(text).toMatch(/▶|◀/);
  const tests = parsed.jobs.find((item) => item.name === "tests");
  const sonarqube = parsed.jobs.find((item) => item.name === "sonarqube");
  expect(graph.edges.some((edge) => edge.fromId === tests?.id && edge.toId === sonarqube?.id)).toBe(
    true,
  );
});
