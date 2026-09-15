import { expect, test } from "bun:test";
import type { JobNode } from "../glab/graph.ts";
import { buildDag, renderDagAscii } from "./dag.ts";

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

test("viewport clips ASCII output", () => {
  const dag = buildDag([job("A"), job("B", ["A"])]);
  const lines = renderDagAscii(dag, "B", { width: 8, height: 1, scrollX: 0, scrollY: 0 });
  expect(lines).toHaveLength(1);
  expect(lines[0]?.length).toBeLessThanOrEqual(8);
  expect(renderDagAscii(dag, "B", { width: 80, height: 4 }).join("\n")).toContain("[B]");
});
