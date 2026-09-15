export type StatusBucket = "success" | "failed" | "running-or-pending" | "other";

const RUNNING_PENDING = new Set([
  "running",
  "pending",
  "waiting_for_resource",
  "preparing",
]);

export function statusBucket(status: string): StatusBucket {
  const normalized = status.toLowerCase();
  if (normalized === "success" || normalized === "passed") {
    return "success";
  }
  if (normalized === "failed") {
    return "failed";
  }
  if (RUNNING_PENDING.has(normalized)) {
    return "running-or-pending";
  }
  return "other";
}

export function isActivePipelineStatus(status: string): boolean {
  return statusBucket(status) === "running-or-pending";
}

export const BUCKET_COLOR: Record<StatusBucket, string> = {
  success: "#22c55e",
  failed: "#ef4444",
  "running-or-pending": "#eab308",
  other: "#9ca3af",
};
