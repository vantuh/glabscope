import { expect, test } from "bun:test";
import { mapPipelines } from "./list.ts";

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
