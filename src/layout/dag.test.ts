import { expect, test } from "bun:test";
import type { JobNode } from "../glab/graph.ts";
import { parsePipelineGraph } from "../glab/graph.ts";
import fixture from "../fixtures/pipeline-jobs-needs.json";
import { buildDag } from "./dag.ts";

function job(
  name: string,
  needsNames: string[] = [],
  kind = "BUILD",
): JobNode {
  return {
    id: name,
    numericId: name,
    name,
    status: "success",
    bucket: "success",
    kind,
    stage: "test",
    needsNames,
    isBridge: kind === "BRIDGE",
  };
}

test("diamond needs graph ranks downstream after upstream", () => {
  const dag = buildDag([
    job("A"),
    job("B", ["A"]),
    job("C", ["A"]),
    job("D", ["B", "C"]),
  ]);
  expect(dag.edges).toHaveLength(4);
  expect(dag.ranks[0]?.map((item) => item.name)).toEqual(["A"]);
  expect(dag.ranks[1]?.map((item) => item.name).sort()).toEqual(["B", "C"]);
  expect(dag.ranks[2]?.map((item) => item.name)).toEqual(["D"]);
});

test("stages-only jobs do not invent edges", () => {
  const dag = buildDag([job("lint"), job("test"), job("build")]);
  expect(dag.edges).toEqual([]);
  expect(dag.ranks).toHaveLength(1);
  expect(dag.ranks[0]?.map((item) => item.name)).toEqual(["lint", "test", "build"]);
});

test("fixture edges are named needs only", () => {
  const graph = parsePipelineGraph(fixture);
  const dag = buildDag(graph.jobs);
  const byId = new Map(graph.jobs.map((item) => [item.id, item]));
  expect(dag.edges.length).toBeGreaterThan(0);
  for (const edge of dag.edges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    expect(from && to && to.needsNames.includes(from.name)).toBe(true);
  }
});
