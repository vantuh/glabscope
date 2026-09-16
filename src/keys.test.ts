import { expect, test } from "bun:test";
import { isOpenKey, isQuitKey, isRetryKey } from "./keys.ts";

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

test("o is the open key, with or without shift", () => {
  expect(isOpenKey({ name: "o" })).toBe(true);
  // OpenTUI maps uppercase O to the same name with shift set.
  expect(isOpenKey({ name: "o", shift: true })).toBe(true);
  expect(isOpenKey({ name: "o", ctrl: true })).toBe(false);
  expect(isOpenKey({ name: "o", meta: true })).toBe(false);
  expect(isOpenKey({ name: "o", option: true })).toBe(false);
  expect(isOpenKey({ name: "o", super: true })).toBe(false);
  expect(isOpenKey({})).toBe(false);
  expect(isOpenKey({ name: "O" })).toBe(false);
});

test("the other keys in use are not the open key", () => {
  for (const name of ["q", "r", "enter", "return", "escape", "up", "down", "left", "right", "y"]) {
    expect(isOpenKey({ name })).toBe(false);
  }
  expect(isOpenKey({ name: "r", ctrl: true })).toBe(false);
});
