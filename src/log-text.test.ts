import { expect, test } from "bun:test";
import {
  appendLogBuffer,
  appendLogTrace,
  emptyLogTrace,
  logVisibleText,
} from "./log-text.ts";

test("keeps red SGR and drops erase-to-end-of-line plus CR", () => {
  const trace = appendLogTrace(emptyLogTrace(), "\u001b[31mFAIL\u001b[0K\rnext");
  expect(logVisibleText(trace)).toBe("FAIL\nnext");
  expect(trace.runs).toEqual([{ text: "FAIL\nnext", fg: "#800000", bold: false }]);
});

test("does not color unstyled ERROR wording", () => {
  const trace = appendLogTrace(emptyLogTrace(), "ERROR: boom\n");
  expect(logVisibleText(trace)).toBe("ERROR: boom\n");
  expect(trace.runs).toEqual([{ text: "ERROR: boom\n", bold: false }]);
});

test("hides GitLab section markers while keeping following color", () => {
  const chunk =
    "\u001b[0Ksection_start:1560896352:prepare_script\r\u001b[0K\u001b[32mok\u001b[0m\n";
  const trace = appendLogTrace(emptyLogTrace(), chunk);
  expect(logVisibleText(trace)).toBe("\nok\n");
  expect(trace.runs.some((run) => run.text.includes("section_"))).toBe(false);
  expect(trace.runs.find((run) => run.text.includes("ok"))?.fg).toBe("#008000");
});

test("carries SGR across a split escape", () => {
  let trace = appendLogTrace(emptyLogTrace(), "\u001b[3");
  expect(logVisibleText(trace)).toBe("");
  trace = appendLogTrace(trace, "1mred");
  expect(logVisibleText(trace)).toBe("red");
  expect(trace.runs[0]?.fg).toBe("#800000");
});

test("ignores 24-bit SGR and keeps the previous color", () => {
  const trace = appendLogTrace(
    emptyLogTrace(),
    "\u001b[31mred\u001b[38;2;1;2;3mstill\u001b[0m",
  );
  expect(logVisibleText(trace)).toBe("redstill");
  expect(trace.runs).toEqual([{ text: "redstill", fg: "#800000", bold: false }]);
});

test("maps 256-color indexes", () => {
  const trace = appendLogTrace(emptyLogTrace(), "\u001b[38;5;196mhot\u001b[0m");
  expect(logVisibleText(trace)).toBe("hot");
  expect(trace.runs[0]?.fg).toBe("#ff0000");
});

test("caps retained visible text", () => {
  const huge = "x".repeat(250_000);
  const kept = appendLogBuffer("", huge);
  expect(kept.length).toBe(200_000);
});

test("a new empty session does not keep prior leftover SGR", () => {
  const dirty = appendLogTrace(emptyLogTrace(), "\u001b[31");
  expect(dirty.leftover).toBe("\u001b[31");
  expect(dirty.fg).toBeUndefined();
  const fresh = appendLogTrace(emptyLogTrace(), "plain");
  expect(fresh.runs).toEqual([{ text: "plain", bold: false }]);
});
