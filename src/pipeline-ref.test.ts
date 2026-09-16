import { expect, test } from "bun:test";
import { refLabel } from "./pipeline-ref.ts";

test("merge-request refs become !iid", () => {
  expect(refLabel("refs/merge-requests/2/head")).toBe("!2");
  expect(refLabel("refs/merge-requests/12/merge")).toBe("!12");
});

test("branch refs lose the refs/heads prefix", () => {
  expect(refLabel("refs/heads/release/2.1-hotfix")).toBe("release/2.1-hotfix");
  expect(refLabel("refs/heads/main")).toBe("main");
});

test("the bare branch name glab reports for older pipelines is unchanged", () => {
  expect(refLabel("main")).toBe("main");
  expect(refLabel("master")).toBe("master");
});

test("tag refs lose the refs/tags prefix", () => {
  expect(refLabel("refs/tags/v1.0")).toBe("v1.0");
  expect(refLabel("refs/tags/release/2026-09")).toBe("release/2026-09");
});

test("an unrecognized ref shape is shown unchanged", () => {
  expect(refLabel("refs/pipelines/123")).toBe("refs/pipelines/123");
  expect(refLabel("")).toBe("");
});
