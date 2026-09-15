import { expect, test } from "bun:test";
import { appendLogBuffer, sanitizeTraceChunk } from "./log-text.ts";

test("strips ANSI and carriage returns from traces", () => {
  expect(sanitizeTraceChunk("\u001b[32mok\u001b[0K\rnext")).toBe("ok\nnext");
});

test("caps retained log buffer", () => {
  const huge = "x".repeat(250_000);
  const kept = appendLogBuffer("", huge);
  expect(kept.length).toBe(200_000);
});
