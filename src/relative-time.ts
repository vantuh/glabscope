/** Shown when a pipeline has no creation timestamp to age. */
export const UNKNOWN_AGE = "—";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Largest unit first: the age is reported in the biggest one that fits. */
const UNITS: [size: number, suffix: string][] = [
  [YEAR, "y"],
  [MONTH, "mo"],
  [WEEK, "w"],
  [DAY, "d"],
  [HOUR, "h"],
  [MINUTE, "m"],
];

/**
 * Compact age of a pipeline, e.g. `4m` or `3d`. `now` is a parameter so the
 * caller decides the clock: the list recomputes this on every render, which the
 * poll already drives, and tests stay deterministic.
 */
export function relativeTime(createdAt: string, now: number): string {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) {
    return UNKNOWN_AGE;
  }
  const age = Math.max(0, now - created);
  for (const [size, suffix] of UNITS) {
    if (age >= size) {
      return `${Math.floor(age / size)}${suffix}`;
    }
  }
  return `${Math.floor(age / SECOND)}s`;
}
