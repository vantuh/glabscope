export const NORMAL_POLL_MS = 4000;
export const MAX_POLL_MS = 30_000;

/**
 * Delay before the next poll tick. A rate-limited tick doubles the current
 * delay up to the cap; any non-rate-limited outcome resets to the normal
 * interval.
 */
export function nextPollDelay(currentMs: number, rateLimited: boolean): number {
  if (!rateLimited) {
    return NORMAL_POLL_MS;
  }
  return Math.min(currentMs * 2, MAX_POLL_MS);
}
