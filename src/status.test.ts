import { expect, test } from "bun:test";
import { BUCKET_COLOR, isActivePipelineStatus, statusBucket, statusIcon } from "./status.ts";

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

test("status icons distinguish a live mix while color stays on four buckets", () => {
  const success = statusIcon("success");
  const failed = statusIcon("failed");
  const running = statusIcon("running");
  const pending = statusIcon("pending");
  const skipped = statusIcon("skipped");
  const canceled = statusIcon("canceled");
  const other = statusIcon("manual");
  expect(new Set([success, failed, running, pending, skipped, canceled, other]).size).toBe(7);
  expect(statusIcon("SUCCESS")).toBe(success);
  expect(statusIcon("cancelled")).toBe(canceled);
  expect(statusIcon("created")).toBe(other);

  expect(statusBucket("success")).toBe("success");
  expect(statusBucket("failed")).toBe("failed");
  expect(statusBucket("running")).toBe("running-or-pending");
  expect(statusBucket("pending")).toBe("running-or-pending");
  expect(statusBucket("skipped")).toBe("other");
  expect(statusBucket("canceled")).toBe("other");
  expect(Object.keys(BUCKET_COLOR).sort()).toEqual(
    ["failed", "other", "running-or-pending", "success"].sort(),
  );
});
