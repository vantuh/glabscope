import { expect, test } from "bun:test";
import { IDLE_POLL_MS, MAX_POLL_MS, NORMAL_POLL_MS, nextPollDelay } from "./polling.ts";

test("normal delay is 4 seconds", () => {
  expect(NORMAL_POLL_MS).toBe(4000);
});

test("watch delay is 15 seconds", () => {
  expect(IDLE_POLL_MS).toBe(15000);
});

test("the delays are ordered normal < watch < max", () => {
  expect(NORMAL_POLL_MS).toBeLessThan(IDLE_POLL_MS);
  expect(IDLE_POLL_MS).toBeLessThan(MAX_POLL_MS);
});

test("the watch interval is at least twice the normal interval", () => {
  expect(IDLE_POLL_MS).toBeGreaterThanOrEqual(2 * NORMAL_POLL_MS);
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

test("a rate-limited tick from the watch interval reaches the cap in one step", () => {
  expect(nextPollDelay(IDLE_POLL_MS, true)).toBe(MAX_POLL_MS);
});

test("a successful tick from the watch interval clears the escalation", () => {
  // `nextPollDelay` only clears the escalation back to the normal interval;
  // the list loop and the graph loop in `app.tsx` then assign `IDLE_POLL_MS`
  // when the screen holds nothing running or pending, so a successful watch
  // tick reschedules at 15 s again rather than at the normal 4 s.
  expect(nextPollDelay(IDLE_POLL_MS, false)).toBe(NORMAL_POLL_MS);
  expect(nextPollDelay(MAX_POLL_MS, false)).toBe(NORMAL_POLL_MS);
  expect(IDLE_POLL_MS).toBe(15000);
});
