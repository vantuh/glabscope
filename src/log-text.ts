import { stripAnsiSequences } from "@opentui/core";

const MAX_LOG_CHARS = 200_000;

export function sanitizeTraceChunk(chunk: string): string {
  return stripAnsiSequences(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function appendLogBuffer(buffer: string, chunk: string): string {
  const next = buffer + sanitizeTraceChunk(chunk);
  if (next.length <= MAX_LOG_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_LOG_CHARS);
}
