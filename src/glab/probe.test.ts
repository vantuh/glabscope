import { expect, test } from "bun:test";
import { probeGlab } from "./probe.ts";

test("glab probe fails when the binary is missing", async () => {
  const result = await probeGlab("/this/glab/does/not/exist");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message).toContain("glab was not found");
  }
});
