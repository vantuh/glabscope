import { expect, test } from "bun:test";
import { MAX_POLL_MS, NORMAL_POLL_MS, nextPollDelay } from "./polling.ts";

test("normal delay is 4 seconds", () => {
  expect(NORMAL_POLL_MS).toBe(4000);
});

test("rate-limited delay doubles", () => {
  expect(nextPollDelay(4000, true)).toBe(8000);
  expect(nextPollDelay(8000, true)).toBe(16000);
});

test("rate-limited delay is capped at 30 seconds", () => {
  expect(nextPollDelay(16000, true)).toBe(30000);
  expect(nextPollDelay(30000, true)).toBe(30000);
  expect(MAX_POLL_MS).toBe(30000);
});

test("a non-rate-limited tick resets the delay to normal", () => {
  expect(nextPollDelay(4000, false)).toBe(4000);
  expect(nextPollDelay(30000, false)).toBe(4000);
});
