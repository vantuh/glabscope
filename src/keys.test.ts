import { expect, test } from "bun:test";
import { isQuitKey, isRetryKey } from "./keys.ts";

test("q is the quit key", () => {
  expect(isQuitKey("q")).toBe(true);
  expect(isQuitKey("escape")).toBe(false);
  expect(isQuitKey("Q")).toBe(false);
});

test("ctrl+r is the retry key", () => {
  expect(isRetryKey({ name: "r", ctrl: true })).toBe(true);
  // Bare `r` is the manual refresh key, and other chords stay distinct.
  expect(isRetryKey({ name: "r" })).toBe(false);
  expect(isRetryKey({ name: "r", ctrl: false })).toBe(false);
  expect(isRetryKey({ name: "R", ctrl: true })).toBe(false);
  expect(isRetryKey({ name: "q", ctrl: true })).toBe(false);
  expect(isRetryKey({})).toBe(false);
});

test("ctrl+r combined with another modifier is not the retry key", () => {
  expect(isRetryKey({ name: "r", ctrl: true, shift: true })).toBe(false);
  expect(isRetryKey({ name: "r", ctrl: true, meta: true })).toBe(false);
  expect(isRetryKey({ name: "r", ctrl: true, option: true })).toBe(false);
  expect(isRetryKey({ name: "r", ctrl: true, super: true })).toBe(false);
});
