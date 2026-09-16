import { expect, test } from "bun:test";
import { copyPlainText } from "./clipboard.ts";

test("copyPlainText writes nonempty text and reports it, skipping empty text", () => {
  const writes: string[] = [];
  const write = (text: string) => writes.push(text);

  expect(copyPlainText("ERROR: boom", write)).toBe(true);
  expect(copyPlainText("", write)).toBe(false);
  expect(copyPlainText("second\nline", write)).toBe(true);

  expect(writes).toEqual(["ERROR: boom", "second\nline"]);
});
