export const NORMAL_POLL_MS = 4000;
export const MAX_POLL_MS = 30_000;
/** Watch interval once everything visible is terminal, to catch retries/new jobs. */
export const IDLE_POLL_MS = 5000;

/**
 * Delay before the next poll tick. Callers pass `rateLimited: true` after a
 * rate-limited tick (the current delay doubles up to the cap) and
 * `rateLimited: false` only after a successful refresh, which resets to the
 * normal interval. Ordinary failures keep the current delay by not calling
 * this at all.
 */
export function nextPollDelay(currentMs: number, rateLimited: boolean): number {
  if (!rateLimited) {
    return NORMAL_POLL_MS;
  }
  return Math.min(currentMs * 2, MAX_POLL_MS);
}
