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

/** Nerd Font glyphs; color still comes from `statusBucket` / `BUCKET_COLOR`. */
const STATUS_ICON: Record<string, string> = {
  success: "\uf00c",
  passed: "\uf00c",
  failed: "\uf00d",
  running: "\uf110",
  pending: "\uf017",
  waiting_for_resource: "\uf017",
  preparing: "\uf110",
  skipped: "\uf05e",
  canceled: "\uf28d",
  cancelled: "\uf28d",
};

const OTHER_ICON = "\uf111";

export function statusIcon(status: string): string {
  return STATUS_ICON[status.toLowerCase()] ?? OTHER_ICON;
}
