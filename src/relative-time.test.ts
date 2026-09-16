import { expect, test } from "bun:test";
import { relativeTime, UNKNOWN_AGE } from "./relative-time.ts";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

test("seconds, minutes, hours and days are the largest fitting unit", () => {
  expect(relativeTime(ago(30 * SECOND), NOW)).toBe("30s");
  expect(relativeTime(ago(5 * MINUTE), NOW)).toBe("5m");
  expect(relativeTime(ago(3 * HOUR), NOW)).toBe("3h");
  expect(relativeTime(ago(2 * DAY), NOW)).toBe("2d");
});

test("each unit hands over at its own boundary", () => {
  expect(relativeTime(ago(59 * SECOND), NOW)).toBe("59s");
  expect(relativeTime(ago(MINUTE), NOW)).toBe("1m");
  expect(relativeTime(ago(59 * MINUTE), NOW)).toBe("59m");
  expect(relativeTime(ago(HOUR), NOW)).toBe("1h");
  expect(relativeTime(ago(23 * HOUR), NOW)).toBe("23h");
  expect(relativeTime(ago(DAY), NOW)).toBe("1d");
  expect(relativeTime(ago(6 * DAY), NOW)).toBe("6d");
});

test("weeks, months and years cover the rest", () => {
  expect(relativeTime(ago(7 * DAY), NOW)).toBe("1w");
  expect(relativeTime(ago(29 * DAY), NOW)).toBe("4w");
  expect(relativeTime(ago(30 * DAY), NOW)).toBe("1mo");
  expect(relativeTime(ago(364 * DAY), NOW)).toBe("12mo");
  expect(relativeTime(ago(365 * DAY), NOW)).toBe("1y");
});

test("a clock that runs backwards reads as just now, not as a negative age", () => {
  expect(relativeTime(new Date(NOW + MINUTE).toISOString(), NOW)).toBe("0s");
});

test("a missing or unparsable timestamp is a placeholder", () => {
  expect(relativeTime("", NOW)).toBe(UNKNOWN_AGE);
  expect(relativeTime("not a date", NOW)).toBe(UNKNOWN_AGE);
});
