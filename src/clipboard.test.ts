import { expect, test } from "bun:test";
import { copyPlainText } from "./clipboard.ts";

test("copyPlainText passes nonempty text to the writer and skips empty text", () => {
  const writes: string[] = [];
  const write = (text: string) => writes.push(text);

  copyPlainText("ERROR: boom", write);
  copyPlainText("", write);
  copyPlainText("second\nline", write);

  expect(writes).toEqual(["ERROR: boom", "second\nline"]);
});
