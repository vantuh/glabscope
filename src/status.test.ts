import { expect, test } from "bun:test";
import { isActivePipelineStatus, statusBucket } from "./status.ts";

test("maps GitLab statuses into four buckets", () => {
  expect(statusBucket("success")).toBe("success");
  expect(statusBucket("SUCCESS")).toBe("success");
  expect(statusBucket("failed")).toBe("failed");
  expect(statusBucket("running")).toBe("running-or-pending");
  expect(statusBucket("pending")).toBe("running-or-pending");
  expect(statusBucket("waiting_for_resource")).toBe("running-or-pending");
  expect(statusBucket("preparing")).toBe("running-or-pending");
  expect(statusBucket("canceled")).toBe("other");
  expect(statusBucket("manual")).toBe("other");
  expect(statusBucket("skipped")).toBe("other");
  expect(statusBucket("created")).toBe("other");
});

test("active pipeline statuses are the running-or-pending bucket", () => {
  expect(isActivePipelineStatus("running")).toBe(true);
  expect(isActivePipelineStatus("success")).toBe(false);
  expect(isActivePipelineStatus("failed")).toBe(false);
});
