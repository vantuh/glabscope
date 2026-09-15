import { expect, test } from "bun:test";
import { probeGlab } from "./probe.ts";

test("missing glab binary is an error, not an empty list", async () => {
  const result = await probeGlab("/this/glab/does/not/exist");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message).toContain("glab was not found");
  }
});

test("glab on PATH reports ok", async () => {
  const result = await probeGlab("glab");
  expect(result.ok).toBe(true);
});
