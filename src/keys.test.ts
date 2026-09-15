import { expect, test } from "bun:test";
import { isQuitKey } from "./keys.ts";

test("q is the quit key", () => {
  expect(isQuitKey("q")).toBe(true);
  expect(isQuitKey("escape")).toBe(false);
  expect(isQuitKey("Q")).toBe(false);
});
