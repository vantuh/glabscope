import { ansi256IndexToRgb } from "@opentui/core";

const MAX_LOG_CHARS = 200_000;
const SECTION_PREFIXES = ["section_start:", "section_end:"] as const;

export type LogStyle = {
  fg?: string;
  bg?: string;
  bold: boolean;
};

export type LogRun = LogStyle & { text: string };

export type LogTrace = LogStyle & {
  leftover: string;
  runs: LogRun[];
};

export function emptyLogTrace(): LogTrace {
  return { leftover: "", runs: [], bold: false };
}

export function logVisibleText(trace: LogTrace): string {
  return trace.runs.map((run) => run.text).join("");
}

function rgbHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function indexedColor(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return undefined;
  }
  return rgbHex(ansi256IndexToRgb(index));
}

function sameStyle(a: LogStyle, b: LogStyle): boolean {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold;
}

function visibleLength(runs: LogRun[]): number {
  return runs.reduce((sum, run) => sum + run.text.length, 0);
}

function trimRuns(runs: LogRun[]): LogRun[] {
  let extra = visibleLength(runs) - MAX_LOG_CHARS;
  if (extra <= 0) {
    return runs;
  }
  const next = runs.slice();
  while (extra > 0 && next.length > 0) {
    const head = next[0];
    if (!head) {
      break;
    }
    if (head.text.length <= extra) {
      extra -= head.text.length;
      next.shift();
    } else {
      next[0] = { ...head, text: head.text.slice(extra) };
      extra = 0;
    }
  }
  return next;
}

function emit(runs: LogRun[], style: LogStyle, text: string): LogRun[] {
  if (!text) {
    return runs;
  }
  const next = runs.slice();
  const last = next.at(-1);
  if (last && sameStyle(last, style)) {
    next[next.length - 1] = { ...last, text: last.text + text };
  } else {
    next.push({ ...style, text });
  }
  return trimRuns(next);
}

function isCsiFinal(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
}

type EscapeResult =
  | { kind: "incomplete" }
  | { kind: "skip"; next: number }
  | { kind: "sgr"; next: number; params: number[] };

function parseEscape(input: string, start: number): EscapeResult {
  if (start + 1 >= input.length) {
    return { kind: "incomplete" };
  }
  const intro = input.charCodeAt(start + 1);
  if (intro === 0x5b) {
    let i = start + 2;
    while (i < input.length && !isCsiFinal(input.charCodeAt(i))) {
      i += 1;
    }
    if (i >= input.length) {
      return { kind: "incomplete" };
    }
    const final = input[i];
    const body = input.slice(start + 2, i);
    const next = i + 1;
    if (final !== "m") {
      return { kind: "skip", next };
    }
    const params = body === "" ? [0] : body.split(";").map((part) => (part === "" ? 0 : Number(part)));
    return { kind: "sgr", next, params };
  }
  if (intro === 0x5d || intro === 0x50 || intro === 0x58 || intro === 0x5e || intro === 0x5f) {
    let i = start + 2;
    while (i < input.length) {
      if (input.charCodeAt(i) === 0x07) {
        return { kind: "skip", next: i + 1 };
      }
      if (input.charCodeAt(i) === 0x1b && input[i + 1] === "\\") {
        return { kind: "skip", next: i + 2 };
      }
      i += 1;
    }
    return { kind: "incomplete" };
  }
  return { kind: "skip", next: start + 2 };
}

function applySgr(style: LogStyle, params: number[]): LogStyle {
  let next = { ...style };
  for (let i = 0; i < params.length; i += 1) {
    const code = params[i] ?? 0;
    if (code === 0) {
      next = { bold: false };
      continue;
    }
    if (code === 1) {
      next.bold = true;
      continue;
    }
    if (code === 22) {
      next.bold = false;
      continue;
    }
    if (code >= 30 && code <= 37) {
      next.fg = indexedColor(code - 30);
      continue;
    }
    if (code >= 90 && code <= 97) {
      next.fg = indexedColor(code - 90 + 8);
      continue;
    }
    if (code === 39) {
      next.fg = undefined;
      continue;
    }
    if (code >= 40 && code <= 47) {
      next.bg = indexedColor(code - 40);
      continue;
    }
    if (code >= 100 && code <= 107) {
      next.bg = indexedColor(code - 100 + 8);
      continue;
    }
    if (code === 49) {
      next.bg = undefined;
      continue;
    }
    if (code === 38 || code === 48) {
      const slot: "fg" | "bg" = code === 38 ? "fg" : "bg";
      const mode = params[i + 1];
      if (mode === 5) {
        const color = indexedColor(params[i + 2] ?? -1);
        if (color) {
          next[slot] = color;
        }
        i += 2;
        continue;
      }
      if (mode === 2) {
        i += 4;
        continue;
      }
      i += 1;
    }
  }
  return next;
}

function isPrefixOfAny(text: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix.startsWith(text) && text.length < prefix.length);
}

function matchSection(input: string, start: number): EscapeResult | null {
  const rest = input.slice(start);
  if (!rest.startsWith("section_") && !isPrefixOfAny(rest, SECTION_PREFIXES)) {
    return null;
  }
  if (isPrefixOfAny(rest, SECTION_PREFIXES)) {
    return { kind: "incomplete" };
  }
  const header = /^(section_(?:start|end):\d+:[A-Za-z0-9_.-]+(?:\[[^\]]*\])?)/.exec(rest);
  if (!header) {
    if (/^section_(?:start|end):/.test(rest) && !/[\r\n\x1b]/.test(rest)) {
      return { kind: "incomplete" };
    }
    return null;
  }
  return { kind: "skip", next: start + header[0].length };
}

export function appendLogTrace(trace: LogTrace, chunk: string): LogTrace {
  const input = trace.leftover + chunk;
  let index = 0;
  let leftover = "";
  let runs = trace.runs;
  let style: LogStyle = { fg: trace.fg, bg: trace.bg, bold: trace.bold };

  while (index < input.length) {
    const current = input[index];
    if (current === "\x1b") {
      const parsed = parseEscape(input, index);
      if (parsed.kind === "incomplete") {
        leftover = input.slice(index);
        break;
      }
      if (parsed.kind === "sgr") {
        style = applySgr(style, parsed.params);
      }
      index = parsed.next;
      continue;
    }
    if (current === "\r") {
      runs = emit(runs, style, "\n");
      index += input[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    const section = matchSection(input, index);
    if (section) {
      if (section.kind === "incomplete") {
        leftover = input.slice(index);
        break;
      }
      index = section.next;
      continue;
    }
    let end = index + 1;
    while (end < input.length) {
      const ch = input[end];
      if (ch === "\x1b" || ch === "\r") {
        break;
      }
      if (ch === "s" && matchSection(input, end)) {
        break;
      }
      end += 1;
    }
    runs = emit(runs, style, input.slice(index, end));
    index = end;
  }

  return { leftover, runs, fg: style.fg, bg: style.bg, bold: style.bold };
}

export function appendLogBuffer(buffer: string, chunk: string): string {
  const seed: LogTrace =
    buffer.length === 0
      ? emptyLogTrace()
      : { leftover: "", runs: [{ text: buffer, bold: false }], bold: false };
  return logVisibleText(appendLogTrace(seed, chunk));
}
