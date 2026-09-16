import { expect, test, spyOn, mock } from "bun:test";
import { listPipelines, mapPipelines } from "./list.ts";
import { RateLimitedError } from "./ratelimit.ts";
import * as runModule from "./run.ts";

test("maps list JSON statuses into four buckets", () => {
  const rows = mapPipelines([
    { id: 1, iid: 10, status: "success", ref: "main" },
    { id: 2, iid: 9, status: "failed", ref: "main" },
    { id: 3, iid: 8, status: "running", ref: "feat" },
    { id: 4, iid: 7, status: "canceled", ref: "main" },
  ]);
  expect(rows.map((row) => row.bucket)).toEqual([
    "success",
    "failed",
    "running-or-pending",
    "other",
  ]);
  expect(rows[2]?.id).toBe(3);
});

test("carries the creation timestamp through, empty when glab reports none", () => {
  const rows = mapPipelines([
    {
      id: 1,
      iid: 10,
      status: "success",
      ref: "main",
      created_at: "2026-09-16T09:12:34.085Z",
    },
    { id: 2, iid: 9, status: "failed", ref: "main" },
  ]);
  expect(rows[0]?.createdAt).toBe("2026-09-16T09:12:34.085Z");
  expect(rows[1]?.createdAt).toBe("");
});

test("nonzero glab list is an error, not an empty success", async () => {
  const previous = process.env.GLAB_BIN;
  process.env.GLAB_BIN = "/usr/bin/false";
  try {
    await expect(listPipelines(process.cwd())).rejects.toThrow();
  } finally {
    if (previous === undefined) {
      delete process.env.GLAB_BIN;
    } else {
      process.env.GLAB_BIN = previous;
    }
  }
});

test("a rate-limited list page is classified as a rate-limit error", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "",
    stderr: "ERROR: 429 Too Many Requests",
    code: 1,
  });
  try {
    await expect(listPipelines(process.cwd())).rejects.toThrow(RateLimitedError);
  } finally {
    runSpy.mockRestore();
  }
});

test("ordinary list failures are not classified as rate limits", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: "",
    stderr: "error: 500 Internal Server Error",
    code: 1,
  });
  try {
    await expect(listPipelines(process.cwd())).rejects.not.toThrow(RateLimitedError);
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});
