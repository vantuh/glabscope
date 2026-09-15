import { expect, test } from "bun:test";
import { traceArgv } from "./trace.ts";

test("builds glab ci trace argv for a job id", () => {
  expect(traceArgv("224356863")).toEqual(["ci", "trace", "224356863"]);
});

test("rejects non-numeric job ids", () => {
  expect(() => traceArgv("lint")).toThrow();
});
