import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { PipelineGraph } from "./glab/graph.ts";
import * as probeModule from "./glab/probe.ts";
import * as listModule from "./glab/list.ts";
import * as graphModule from "./glab/graph.ts";
import * as traceModule from "./glab/trace.ts";
import * as retryModule from "./glab/retry.ts";
import * as playModule from "./glab/play.ts";
import * as clipboardModule from "./clipboard.ts";
import { RateLimitedError } from "./glab/ratelimit.ts";
import { IDLE_POLL_MS, NORMAL_POLL_MS } from "./polling.ts";
import type { PipelineRow } from "./glab/list.ts";

const fetchGraphCalls: string[] = [];
let graphGate = Promise.withResolvers<PipelineGraph>();
let spawnCalls = 0;
let spawnJobIds: string[] = [];
let spawnShouldThrow = false;
let spawnFailFromCall: number | null = null;
let procKills = 0;
let retryCalls: string[] = [];
let retryGate: PromiseWithResolvers<{ jobId: string | null }> | null = null;
let retryError: string | null = null;
let playCalls: string[] = [];
let playGate: PromiseWithResolvers<{ jobId: string | null }> | null = null;
let playError: string | null = null;
let traceStaysLive = false;
let traceStdout: Uint8Array | null = null;
let traceStreams: QueuedTrace[] = [];
let listCalls = 0;
let listScript: (PipelineRow[] | Error)[] = [];
let listDefault: PipelineRow[] = [];
let listFallback: PipelineRow[] | null = null;
let listGate: PromiseWithResolvers<PipelineRow[]> | null = null;
let graphScript: (PipelineGraph | Error)[] = [];
let graphFallback: PipelineGraph | null = null;

function sampleGraph(): PipelineGraph {
  return {
    pipelineGid: "gid://gitlab/Ci::Pipeline/1",
    iid: "5",
    status: "SUCCESS",
    jobs: [
      {
        id: "gid://gitlab/Ci::Build/99",
        numericId: "99",
        name: "build",
        status: "success",
        bucket: "success",
        kind: "BUILD",
        stage: "build",
        needsNames: [],
        isBridge: false,
        retried: false,
      },
    ],
    stageNames: ["build"],
    truncated: false,
  };
}

function closedStream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

function bytesStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function fakeProc(): ReturnType<typeof Bun.spawn> {
  const queued = traceStreams.shift();
  const live = queued !== undefined || traceStaysLive;
  const stdout =
    queued?.stream ??
    (traceStdout
      ? bytesStream(traceStdout)
      : traceStaysLive
        ? new ReadableStream<Uint8Array>({})
        : closedStream());
  return {
    stdout,
    stderr: live ? new ReadableStream<Uint8Array>({}) : closedStream(),
    exited: live ? new Promise(() => {}) : Promise.resolve(0),
    kill() {
      procKills += 1;
    },
  } as ReturnType<typeof Bun.spawn>;
}

/** A trace process whose output the test releases chunk by chunk. */
type QueuedTrace = {
  stream: ReadableStream<Uint8Array>;
  write: (text: string) => void;
};

function queuedTrace(): QueuedTrace {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
  });
  return {
    stream,
    write: (text: string) => controller?.enqueue(new TextEncoder().encode(text)),
  };
}

import type { CapturedSpan } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { App, COPIED_NOTICE_MS, GraphBody, ScreenPanel } from "./app.tsx";
import { buildStageGraph } from "./layout/stage-graph.ts";
import fixture from "./fixtures/pipeline-jobs-needs.json";
import { parsePipelineGraph } from "./glab/graph.ts";
import { BUCKET_COLOR, statusIcon } from "./status.ts";

async function waitForFrame(
  setup: Awaited<ReturnType<typeof testRender>>,
  predicate: (frame: string) => boolean,
  label: string,
) {
  for (let i = 0; i < 80; i++) {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (predicate(frame)) {
      return frame;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Did not find ${label} in:\n${setup.captureCharFrame()}`);
}

/**
 * The chrome row carrying the given key hint, plus its content between the
 * frame borders, so assertions can name the row's first and last content
 * column instead of absolute frame offsets.
 */
function chromeRow(frame: string, hint: string) {
  const row = frame.split("\n").find((line) => line.includes(hint)) ?? "";
  return { row, text: row.slice(row.indexOf("│") + 1, row.lastIndexOf("│")) };
}

function isDimmed(span: CapturedSpan) {
  const [r, g, b, a] = span.bg.toInts();
  return a === 255 && r > 0 && g > r && b > g;
}

function isDimmedAt(spans: CapturedSpan[], column: number) {
  let offset = 0;
  for (const span of spans) {
    if (column >= offset && column < offset + span.width) {
      return isDimmed(span);
    }
    offset += span.width;
  }
  return false;
}

function hasDimmedPanelBody(setup: Awaited<ReturnType<typeof testRender>>) {
  const frame = setup.captureCharFrame();
  const lines = frame.split("\n");
  const spans = setup.captureSpans().lines;
  const dimmed = spans.map((line) => line.spans.some(isDimmed));
  const title = lines.findIndex((line) => line.includes("pipelines") || line.includes("pipeline 5"));
  const footer = lines.findIndex(
    (line) => line.includes("enter graph") || line.includes("arrows move"),
  );
  const top = lines.findIndex((line) => line.includes("╭"));
  const leftCol = lines[top]?.indexOf("╭") ?? -1;
  const bottom = lines.findLastIndex((line) => leftCol >= 0 && line[leftCol] === "╰");
  const rightCol = lines[top]?.lastIndexOf("╮") ?? -1;
  const bordersUndimmed =
    leftCol >= 0 &&
    rightCol > leftCol &&
    bottom > top &&
    lines.every((line, index) => {
      if (index < top || index > bottom || index >= spans.length) {
        return true;
      }
      if (index === top || index === bottom) {
        return !dimmed[index];
      }
      const rowSpans = spans[index]?.spans ?? [];
      return (
        line[leftCol] === "│" &&
        line[rightCol] === "│" &&
        !isDimmedAt(rowSpans, leftCol) &&
        !isDimmedAt(rowSpans, rightCol)
      );
    });
  return (
    title >= 0 &&
    footer > title &&
    dimmed.some((value, index) => value && index > title && index < footer) &&
    !dimmed[title] &&
    !dimmed[footer] &&
    bordersUndimmed
  );
}

async function mountApp() {
  const setup = await testRender(<App />, { width: 60, height: 12 });
  const frame = await waitForFrame(
    setup,
    (frame) => frame.includes("pipelines"),
    "pipelines list",
  );
  expect(frame).toMatch(/[╭╮╰╯]/);
  expect(frame.match(/pipelines/g)).toHaveLength(1);
  return setup;
}

async function openGraph(setup: Awaited<ReturnType<typeof testRender>>) {
  setup.mockInput.pressEnter();
  graphGate.resolve(sampleGraph());
  const frame = await waitForFrame(setup, (frame) => frame.includes("build"), "graph screen");
  expect(frame).toContain("pipeline 5");
  expect(frame).toMatch(/[╭╮╰╯]/);
}

beforeEach(() => {
  fetchGraphCalls.length = 0;
  graphGate = Promise.withResolvers();
  spawnCalls = 0;
  spawnJobIds = [];
  spawnShouldThrow = false;
  spawnFailFromCall = null;
  procKills = 0;
  retryCalls = [];
  retryGate = null;
  retryError = null;
  playCalls = [];
  playGate = null;
  playError = null;
  traceStreams = [];
  traceStaysLive = false;
  traceStdout = null;
  listCalls = 0;
  listScript = [];
  listDefault = [
    {
      id: 42,
      iid: 5,
      status: "success",
      bucket: "success",
      ref: "main",
      source: "push",
      createdAt: recentCreatedAt(),
    },
  ];
  graphScript = [];
  listGate = null;
  listFallback = null;
  graphFallback = null;

  spyOn(probeModule, "probeGlab").mockResolvedValue({ ok: true });
  spyOn(listModule, "listPipelines").mockImplementation(() => {
    listCalls += 1;
    // The boot load always uses the default rows; scripted responses apply
    // to background refreshes only.
    if (listCalls > 1) {
      if (listGate) {
        return listGate.promise;
      }
      const next = listScript.shift();
      if (next instanceof Error) {
        return Promise.reject(next);
      }
      if (next) {
        listFallback = next;
        return Promise.resolve(next);
      }
      return Promise.resolve(listFallback ?? listDefault);
    }
    listFallback = listDefault;
    return Promise.resolve(listDefault);
  });
  spyOn(graphModule, "fetchPipelineGraph").mockImplementation((iid: string) => {
    fetchGraphCalls.push(iid);
    const next = graphScript.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    if (next) {
      graphFallback = next;
      return Promise.resolve(next);
    }
    return graphFallback ? Promise.resolve(graphFallback) : graphGate.promise;
  });
  spyOn(traceModule, "spawnTrace").mockImplementation((jobId: string) => {
    spawnCalls += 1;
    spawnJobIds.push(jobId);
    if (spawnShouldThrow || spawnFailFromCall === spawnCalls) {
      throw new Error("spawn failed");
    }
    return fakeProc();
  });
  spyOn(retryModule, "retryJob").mockImplementation((jobId: string) => {
    retryCalls.push(jobId);
    if (retryError) {
      return Promise.reject(new Error(retryError));
    }
    return retryGate ? retryGate.promise : Promise.resolve({ jobId: null });
  });
  spyOn(playModule, "playJob").mockImplementation((jobId: string) => {
    playCalls.push(jobId);
    if (playError) {
      return Promise.reject(new Error(playError));
    }
    return playGate ? playGate.promise : Promise.resolve({ jobId: null });
  });
});

afterEach(() => {
  mock.restore();
});

test("screen panel renders rounded chrome with its title", async () => {
  const setup = await testRender(
    <ScreenPanel title="startup" keyHelp="q quit">
      <text>Checking glab…</text>
    </ScreenPanel>,
    { width: 40, height: 8 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("startup");
    expect(frame).toContain("Checking glab");
    expect(frame).toMatch(/[╭╮╰╯]/);
  } finally {
    setup.renderer.destroy();
  }
});

test("blank TUI renders and exits on q", async () => {
  let exited = false;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exited = true;
    void code;
  }) as typeof process.exit;

  const setup = await testRender(<App />, { width: 40, height: 8 });
  try {
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("Checking glab") || text.includes("pipelines"),
      "boot screen",
    );
    expect(frame.includes("Checking glab") || frame.includes("pipelines")).toBe(true);
    expect(frame).toMatch(/[╭╮╰╯]/);
    if (frame.includes("Checking glab")) {
      expect(frame).toContain("startup");
    }
    setup.mockInput.pressKey("q");
    await setup.renderOnce();
    expect(exited).toBe(true);
  } finally {
    process.exit = originalExit;
    setup.renderer.destroy();
  }
});

test("repeated Enter on the list fetches the graph only once", async () => {
  const setup = await mountApp();
  try {
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(fetchGraphCalls).toEqual(["5"]);
  } finally {
    graphGate.resolve(sampleGraph());
    setup.renderer.destroy();
  }
});

test("list shows an animated loading line inside its frame before the graph fetch resolves", async () => {
  const setup = await mountApp();
  try {
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("pipeline…"),
      "list loading indicator",
    );
    expect(frame).toContain("pipeline…");
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    expect(frame).toMatch(/[╭╮╰╯]/);
    expect(frame).toContain("#42");
    expect(hasDimmedPanelBody(setup)).toBe(true);
    const lines = frame.split("\n");
    expect(lines.findIndex((line) => line.includes("pipelines"))).toBeLessThan(
      lines.findIndex((line) => line.includes("Loading pipeline…")),
    );
    expect(frame).not.toContain("build");

    const firstSpinner = frame.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)?.[0];
    let nextSpinner = firstSpinner;
    for (let i = 0; i < 10 && nextSpinner === firstSpinner; i++) {
      await Bun.sleep(25);
      await setup.renderOnce();
      nextSpinner = setup.captureCharFrame().match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)?.[0];
    }
    expect(nextSpinner).not.toBe(firstSpinner);
  } finally {
    graphGate.resolve(sampleGraph());
    setup.renderer.destroy();
  }
});

test("graph fetch failure clears loading and allows retry", async () => {
  const setup = await mountApp();
  try {
    setup.mockInput.pressEnter();
    graphGate.reject(new Error("graph failed"));
    const errorFrame = await waitForFrame(
      setup,
      (text) => text.includes("graph failed"),
      "graph error",
    );
    expect(errorFrame).toContain("error");
    expect(errorFrame).toMatch(/[╭╮╰╯]/);
    const errorSpan = setup
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("graph failed"));
    expect(errorSpan?.fg.toInts()).toEqual([239, 68, 68, 255]);
    expect(errorFrame).not.toContain("pipeline…");

    setup.mockInput.pressEscape();
    await waitForFrame(setup, (text) => text.includes("pipelines"), "pipelines list");
    graphGate = Promise.withResolvers();
    setup.mockInput.pressEnter();
    graphGate.resolve(sampleGraph());
    await waitForFrame(setup, (text) => text.includes("build"), "graph screen");
    expect(fetchGraphCalls).toEqual(["5", "5"]);
  } finally {
    graphGate.resolve(sampleGraph());
    setup.renderer.destroy();
  }
});

test("graph keeps the truncation warning inside its chrome", async () => {
  const setup = await mountApp();
  try {
    setup.mockInput.pressEnter();
    graphGate.resolve({ ...sampleGraph(), truncated: true });
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("job list truncated at 100"),
      "truncated graph",
    );
    expect(frame).toContain("pipeline 5");
    expect(frame).toMatch(/[╭╮╰╯]/);
  } finally {
    setup.renderer.destroy();
  }
});

test("repeated Enter on the graph does not spawn a second trace", async () => {
  const setup = await mountApp();
  try {
    await openGraph(setup);
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter();
    await waitForFrame(setup, () => spawnCalls >= 1, "trace spawn");
    for (let i = 0; i < 3; i++) {
      await setup.renderOnce();
      await Bun.sleep(1);
    }
    expect(spawnCalls).toBe(1);
  } finally {
    setup.renderer.destroy();
  }
});

test("spawn failure clears loading and shows the error screen", async () => {
  const setup = await mountApp();
  try {
    await openGraph(setup);
    spawnShouldThrow = true;
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("spawn failed"),
      "spawn error",
    );
    expect(frame).toContain("spawn failed");
    expect(frame).not.toContain("log…");

    setup.mockInput.pressEscape();
    await waitForFrame(setup, (text) => text.includes("build"), "graph screen");
    spawnShouldThrow = false;
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (text) => text.includes("live") || text.includes("ended"),
      "log screen after retry",
    );
    expect(spawnCalls).toBe(2);
  } finally {
    setup.renderer.destroy();
  }
});

test("live log chrome keeps the waiting message inside the panel", async () => {
  const setup = await mountApp();
  try {
    await openGraph(setup);
    traceStaysLive = true;
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("live · ctrl+r retry · y yank · esc back"),
      "live log screen",
    );
    expect(frame).toContain("log build");
    expect(frame).toContain("waiting for glab ci trace…");
    expect(frame).toMatch(/[╭╮╰╯]/);
  } finally {
    setup.renderer.destroy();
  }
});

test("log panel paints SGR red and leaves unstyled ERROR default", async () => {
  const setup = await mountApp();
  try {
    await openGraph(setup);
    traceStdout = new TextEncoder().encode("\u001b[31mFAIL\u001b[0m\nERROR: boom\n");
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("FAIL") && text.includes("ERROR: boom") && text.includes("ended"),
      "colored log screen",
    );
    expect(frame).toContain("log build");
    expect(frame).toContain("ended · ctrl+r retry · y yank · esc back");
    expect(frame).toMatch(/[╭╮╰╯]/);
    const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
    const failSpan = spans.find((span) => span.text.includes("FAIL"));
    const errorSpan = spans.find((span) => span.text.includes("ERROR"));
    expect(failSpan?.fg.toInts()).toEqual([128, 0, 0, 255]);
    expect(errorSpan?.fg.toInts()).not.toEqual([128, 0, 0, 255]);
  } finally {
    setup.renderer.destroy();
  }
});

test("graph shows an animated loading line inside its frame before the log screen", async () => {
  const setup = await mountApp();
  try {
    await openGraph(setup);
    setup.mockInput.pressEnter();
    let frame = "";
    let sawLoading = false;
    for (let i = 0; i < 200; i++) {
      await setup.renderOnce();
      frame = setup.captureCharFrame();
      if (frame.includes("log…")) {
        expect(frame).toContain("log…");
        expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
        expect(frame).toMatch(/[╭╮╰╯]/);
        expect(frame).toContain("build");
        expect(hasDimmedPanelBody(setup)).toBe(true);
        const lines = frame.split("\n");
        expect(lines.findIndex((line) => line.includes("pipeline 5"))).toBeLessThan(
          lines.findIndex((line) => line.includes("Loading log…")),
        );
        sawLoading = true;
        break;
      }
      await Bun.sleep(1);
    }
    if (!sawLoading) {
      throw new Error(`Did not find log loading indicator in:\n${frame}`);
    }
    const endedFrame = await waitForFrame(
      setup,
      (text) => text.includes("ended · ctrl+r retry · y yank · esc back"),
      "ended log screen",
    );
    expect(endedFrame).toContain("log build");
    expect(endedFrame).toContain("ended · ctrl+r retry · y yank · esc back");
    expect(endedFrame).toContain("waiting for glab ci trace…");
    expect(endedFrame).toMatch(/[╭╮╰╯]/);
  } finally {
    setup.renderer.destroy();
  }
});


function recentCreatedAt(): string {
  return new Date(Date.now() - 5 * 60_000).toISOString();
}

function row(id: number, iid: number, bucket: PipelineRow["bucket"], status = "success"): PipelineRow {
  return { id, iid, status, bucket, ref: "main", source: "push", createdAt: recentCreatedAt() };
}

function runningRow(id: number, iid: number): PipelineRow {
  return row(id, iid, "running-or-pending", "running");
}

function jobIn(name: string, numericId: string, status: string): PipelineGraph["jobs"][number] {
  const bucket =
    status === "success"
      ? "success"
      : status === "running" || status === "pending"
        ? "running-or-pending"
        : status === "failed"
          ? "failed"
          : "other";
  return {
    id: `gid://gitlab/Ci::Build/${numericId}`,
    numericId,
    name,
    status,
    bucket,
    kind: "BUILD",
    stage: "build",
    needsNames: [],
    isBridge: false,
    retried: false,
  };
}

function graphFor(status: string, jobs: PipelineGraph["jobs"]): PipelineGraph {
  return {
    pipelineGid: "gid://gitlab/Ci::Pipeline/1",
    iid: "5",
    status,
    jobs,
    stageNames: [...new Set(jobs.map((job) => job.stage).filter(Boolean))],
    truncated: false,
  };
}

/**
 * Press the retry key and answer its confirmation prompt the way the operator
 * does: the prompt is a separate render, so the confirming key arrives after
 * the screen has redrawn with it open.
 */
async function askAndConfirm(setup: Awaited<ReturnType<typeof testRender>>) {
  setup.mockInput.pressKey("r", { ctrl: true });
  await waitForFrame(setup, (frame) => frame.includes("enter confirm"), "confirmation prompt");
  setup.mockInput.pressEnter();
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let i = 0; i < 300; i++) {
    if (predicate()) {
      return;
    }
    await Bun.sleep(5);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Record scheduled timer delays while compressing them so 4s poll intervals
 * fire within ~20ms of real time. Raw delays stay readable for assertions.
 */
function capturePollTimers() {
  const realSetTimeout = globalThis.setTimeout.bind(globalThis) as unknown as (
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => ReturnType<typeof setTimeout>;
  const scheduled: number[] = [];
  const spy = spyOn(globalThis, "setTimeout").mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => {
    scheduled.push(timeout ?? 0);
    // Compress poll cadence: the 4s active interval fires within ~20ms;
    // watch and longer backoff delays fire within ~100ms. Raw delays
    // stay readable for assertions.
    const ms = (timeout ?? 0) >= 5000 ? 100 : Math.min(timeout ?? 0, 20);
    return realSetTimeout(handler, ms, ...args);
  }) as unknown as typeof setTimeout);
  return { scheduled, spy };
}

function pollDelays(scheduled: number[]): number[] {
  return scheduled.filter((delay) => delay >= 1000);
}

test("list with a running pipeline refreshes immediately, keeps scheduling, and stops when leaving the list", async () => {
  const { scheduled } = capturePollTimers();
  listDefault = [runningRow(42, 5)];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(() => listCalls >= 2, "immediate eligible refresh");
    await waitFor(
      () => listCalls >= 3 && pollDelays(scheduled).length >= 1 && pollDelays(scheduled)[0] === 4000,
      "subsequent scheduled refresh",
    );

    graphGate.resolve(sampleGraph());
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "graph screen");
    const afterLeave = listCalls;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(listCalls).toBe(afterLeave);
  } finally {
    setup.renderer.destroy();
  }
});

test("list refresh slows to the watch interval once every visible row is terminal", async () => {
  const { scheduled } = capturePollTimers();
  listDefault = [runningRow(42, 5)];
  listScript = [[row(43, 4, "success"), row(44, 3, "success")]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(() => listCalls >= 2, "refresh with terminal results");
    // The loop keeps watching at the slow interval instead of stopping.
    await waitFor(() => pollDelays(scheduled).includes(IDLE_POLL_MS), "watch interval scheduled");
    const during = listCalls;
    await Bun.sleep(250);
    expect(listCalls).toBeGreaterThan(during);
  } finally {
    setup.renderer.destroy();
  }
});

test("watch refresh discovers a new pipeline started while everything was terminal", async () => {
  const { scheduled } = capturePollTimers();
  listDefault = [row(43, 4, "success"), row(44, 3, "success")];
  listScript = [[row(43, 4, "success"), row(44, 3, "success"), runningRow(45, 5)]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitForFrame(
      setup,
      (frame) => frame.includes("#45") && frame.includes("running"),
      "newly started pipeline discovered",
    );
    expect(pollDelays(scheduled)[0]).toBe(IDLE_POLL_MS);
    expect(pollDelays(scheduled)[1]).toBe(NORMAL_POLL_MS);
  } finally {
    setup.renderer.destroy();
  }
});

test("list refresh preserves the selected pipeline when rows are reordered", async () => {
  listDefault = [runningRow(42, 5), row(43, 4, "success")];
  listScript = [[row(43, 4, "success"), runningRow(42, 5)]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(() => listCalls >= 2, "reordered refresh");
    const lines = setup.captureCharFrame().split("\n");
    const selectedLine = lines.findIndex((line) => line.includes("> #42"));
    const otherLine = lines.findIndex((line) => line.includes("#43"));
    expect(selectedLine).toBeGreaterThan(-1);
    expect(otherLine).toBeGreaterThan(-1);
    expect(selectedLine).toBeGreaterThan(otherLine);
  } finally {
    setup.renderer.destroy();
  }
});

test("a missing selected pipeline clamps selection and keeps navigation working", async () => {
  listDefault = [runningRow(42, 5)];
  listScript = [[row(43, 4, "success"), row(44, 3, "success")]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(() => listCalls >= 2, "refresh without the selected row");
    await waitForFrame(setup, (frame) => frame.includes("> #43"), "clamped selection");
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(setup, (frame) => frame.includes("> #44"), "navigation after clamp");
  } finally {
    setup.renderer.destroy();
  }
});

test("a background list failure keeps the list visible, retries, and clears the warning on recovery", async () => {
  capturePollTimers();
  listDefault = [runningRow(42, 5), row(43, 4, "success")];
  listScript = [new Error("list failed"), new Error("list failed")];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    // The warning renders inline while the last successful rows stay usable,
    // and keyboard navigation still works while the warning shows.
    await waitForFrame(
      setup,
      (frame) => frame.includes("#42") && frame.includes("list failed"),
      "warning beside the retained list",
    );
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(
      setup,
      (frame) => frame.includes("> #43") && frame.includes("list failed"),
      "navigation during warning",
    );
    // The retry at the bounded delay succeeds and clears the warning.
    await waitForFrame(
      setup,
      (frame) => frame.includes("#42") && !frame.includes("list failed"),
      "recovered list without warning",
    );
    expect(listCalls).toBeGreaterThanOrEqual(4);
  } finally {
    setup.renderer.destroy();
  }
});

test("a rate-limited list refresh backs off and resets the interval after success", async () => {
  const { scheduled } = capturePollTimers();
  listDefault = [runningRow(42, 5)];
  listScript = [new RateLimitedError("429 Too Many Requests")];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(
      () => pollDelays(scheduled).length >= 1 && pollDelays(scheduled)[0] === 8000,
      "doubled backoff delay",
    );
    await waitFor(
      () => pollDelays(scheduled).length >= 2 && pollDelays(scheduled)[1] === 4000,
      "interval reset after recovery",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("graph polling updates job status and recovers from an ordinary failure", async () => {
  capturePollTimers();
  graphGate.resolve({
    ...sampleGraph(),
    status: "RUNNING",
    jobs: [jobIn("build", "99", "running")],
  });
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "running graph");
    expect(fetchGraphCalls.length).toBeGreaterThanOrEqual(2);

    graphScript = [new Error("graphql failed"), new Error("graphql failed")];
    await waitForFrame(
      setup,
      (frame) => frame.includes("graphql failed") && frame.includes("build"),
      "non-fatal refresh warning beside the retained graph",
    );

    graphScript = [graphFor("SUCCESS", [jobIn("build", "99", "success")])];
    await waitForFrame(setup, (frame) => !frame.includes("graphql failed"), "recovered graph");
    const buildSpan = setup
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("build") && span.fg.toInts()[1] === 197);
    expect(buildSpan?.fg.toInts()).toEqual([34, 197, 94, 255]);
    expect(fetchGraphCalls.length).toBeGreaterThanOrEqual(4);
  } finally {
    setup.renderer.destroy();
  }
});

test("graph polling pauses during logs, resumes on return, and slows to the watch interval", async () => {
  const { scheduled } = capturePollTimers();
  listDefault = [runningRow(42, 5)];
  graphGate.resolve(graphFor("RUNNING", [jobIn("build", "99", "running")]));
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "running graph");
    await waitFor(() => fetchGraphCalls.length >= 2, "graph polling started");

    traceStaysLive = true;
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("live · ctrl+r retry · y yank · esc back"), "log screen");
    const paused = fetchGraphCalls.length;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(fetchGraphCalls.length).toBe(paused);

    graphScript = [
      graphFor("RUNNING", [jobIn("build", "99", "running")]),
      graphFor("SUCCESS", [jobIn("build", "99", "success")]),
    ];
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("build"), "graph after return");
    await waitFor(() => fetchGraphCalls.length >= paused + 2, "resumed polling");
    // A terminal refresh slows the loop to the watch interval; polling keeps
    // going so externally retried jobs still appear.
    await waitFor(() => pollDelays(scheduled).includes(IDLE_POLL_MS), "watch interval scheduled");
    const during = fetchGraphCalls.length;
    await Bun.sleep(250);
    expect(fetchGraphCalls.length).toBeGreaterThan(during);

    // Leaving the graph screen stops its loop entirely.
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "back to list");
    const after = fetchGraphCalls.length;
    await Bun.sleep(250);
    expect(fetchGraphCalls.length).toBe(after);
  } finally {
    setup.renderer.destroy();
  }
});

test("graph refresh backs off on 429, resets after success, and keeps focus across reordered jobs", async () => {
  const { scheduled } = capturePollTimers();
  graphGate.resolve(
    graphFor("RUNNING", [jobIn("a", "10", "running"), jobIn("b", "11", "running")]),
  );
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("pipeline 5") &&
        frame.split("\n").some((line) => line.includes("▸") && /\ba\b/.test(line)),
      "running graph",
    );
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(
      setup,
      (frame) => frame.split("\n").some((line) => line.includes("▸") && /\bb\b/.test(line)),
      "focused job b",
    );

    graphScript = [
      new RateLimitedError("429 Too Many Requests"),
      graphFor("RUNNING", [jobIn("b", "11", "running"), jobIn("a", "10", "running")]),
    ];
    await waitFor(
      () => {
        const delays = pollDelays(scheduled);
        const backoff = delays.indexOf(8000);
        return backoff !== -1 && delays[backoff + 1] === 4000;
      },
      "graph backoff then interval reset",
    );
    await waitForFrame(
      setup,
      (frame) => {
        const lines = frame.split("\n");
        const bLine = lines.findIndex((line) => line.includes("▸") && /\bb\b/.test(line));
        const aLine = lines.findIndex((line) => !line.includes("▸") && /\ba\b/.test(line));
        return bLine > -1 && aLine > -1 && bLine < aLine;
      },
      "reordered jobs with preserved focus",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("r refetches the list after automatic refresh stopped and preserves selection", async () => {
  listDefault = [row(42, 5, "success")];
  listScript = [[row(42, 5, "success"), row(43, 4, "success", "failed")]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    const callsBefore = listCalls;
    setup.mockInput.pressKey("r");
    await waitForFrame(
      setup,
      (frame) => frame.includes("#43") && frame.includes("> #42"),
      "manually refreshed list with preserved selection",
    );
    expect(listCalls).toBe(callsBefore + 1);
  } finally {
    setup.renderer.destroy();
  }
});

test("a failed manual list refresh keeps the rows and shows a warning", async () => {
  listDefault = [row(42, 5, "success")];
  listScript = [new Error("manual refresh failed")];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressKey("r");
    await waitForFrame(
      setup,
      (frame) => frame.includes("#42") && frame.includes("manual refresh failed"),
      "warning beside retained rows",
    );
    expect(listCalls).toBe(2);
  } finally {
    setup.renderer.destroy();
  }
});

test("r refetches the graph after polling stopped and shows new jobs", async () => {
  graphGate.resolve(sampleGraph());
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "terminal graph");
    const callsBefore = fetchGraphCalls.length;
    graphScript = [
      graphFor("SUCCESS", [
        jobIn("build", "99", "success"),
        jobIn("deploy", "100", "success"),
      ]),
    ];
    setup.mockInput.pressKey("r");
    await waitForFrame(setup, (frame) => frame.includes("deploy"), "graph with retried-in job");
    expect(fetchGraphCalls.length).toBe(callsBefore + 1);
  } finally {
    setup.renderer.destroy();
  }
});

test("the footer shows a refreshing spinner while a background refresh is in flight", async () => {
  listDefault = [runningRow(42, 5)];
  listGate = Promise.withResolvers<PipelineRow[]>();
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitForFrame(
      setup,
      (frame) => frame.includes("refreshing…") && /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(frame),
      "in-flight refresh status",
    );
    // Settling the request clears the status.
    listGate.resolve([runningRow(42, 5)]);
    await waitForFrame(
      setup,
      (frame) => !frame.includes("refreshing…"),
      "refresh status cleared",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("the refresh spinner is pinned to the right edge, apart from the key help", async () => {
  listDefault = [runningRow(42, 5)];
  listGate = Promise.withResolvers<PipelineRow[]>();
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("refreshing…") && /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(frame),
      "in-flight refresh status",
    );
    const help = "enter graph  r refresh  q quit";
    const { row, text } = chromeRow(frame, "enter graph");
    // Keys flush left, status flush right, both on the same chrome row.
    expect(text.startsWith(help)).toBe(true);
    expect(text.endsWith("refreshing…")).toBe(true);
    // The gap is exactly the justified remainder of the row: no separator is
    // baked into the status text itself.
    const gap = text.length - help.length - "⠋ refreshing…".length;
    expect(gap).toBeGreaterThan(1);
    expect(text.slice(help.length)).toMatch(
      new RegExp(`^ {${gap}}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] refreshing…$`),
    );
    expect(row).toContain(help);
  } finally {
    setup.renderer.destroy();
  }
});

test("the graph chrome keeps its long key help intact with the spinner pinned right", async () => {
  capturePollTimers();
  graphGate.resolve({ ...sampleGraph(), status: "RUNNING" });
  const setup = await testRender(<App />, { width: 120, height: 20 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "graph screen");
    // Hold the next poll so the status stays on screen for the capture.
    graphGate = Promise.withResolvers<PipelineGraph>();
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("refreshing…") && /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(frame),
      "in-flight graph refresh",
    );
    const help = "arrows move  enter log  r refresh  ctrl+r retry/run  esc list  q quit";
    const { text } = chromeRow(frame, "arrows move");
    // At a realistic terminal width the longest help line survives whole and
    // the status still sits at the far right of the same row.
    expect(text.startsWith(help)).toBe(true);
    expect(text.endsWith("refreshing…")).toBe(true);
    const gap = text.length - help.length - "⠋ refreshing…".length;
    expect(gap).toBeGreaterThan(1);
    expect(text.slice(help.length)).toMatch(
      new RegExp(`^ {${gap}}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] refreshing…$`),
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("with no status pending the chrome row carries the key help alone", async () => {
  const setup = await mountApp();
  try {
    const frame = setup.captureCharFrame();
    const help = "enter graph  r refresh  q quit";
    const { text } = chromeRow(frame, "enter graph");
    expect(text.startsWith(help)).toBe(true);
    // Nothing takes the status slot: no placeholder and no trailing text.
    expect(text.slice(help.length).trim()).toBe("");
    expect(text).not.toContain("refreshing");
    expect(text).not.toContain("copied");
  } finally {
    setup.renderer.destroy();
  }
});

test("a refresh error stays a body row above the chrome row", async () => {
  capturePollTimers();
  listDefault = [runningRow(42, 5)];
  listScript = [new Error("list failed")];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("refresh error: list failed"),
      "refresh warning row",
    );
    const lines = frame.split("\n");
    const warningRow = lines.findIndex((line) => line.includes("refresh error:"));
    const chromeIndex = lines.findIndex((line) => line.includes("enter graph"));
    const warning = chromeRow(frame, "refresh error:");
    const chrome = chromeRow(frame, "enter graph");
    expect(warningRow).toBeGreaterThan(-1);
    // Body content, above the chrome, not inside the status area.
    expect(warningRow).toBeLessThan(chromeIndex);
    expect(chrome.row).not.toContain("refresh error");
    expect(warning.text.startsWith("refresh error: list failed — retrying")).toBe(true);
  } finally {
    setup.renderer.destroy();
  }
});

test("a status that overflows the row stays whole while the help text truncates", async () => {
  listDefault = [runningRow(42, 5)];
  listGate = Promise.withResolvers<PipelineRow[]>();
  const setup = await testRender(<App />, { width: 40, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("refreshing…") && /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(frame),
      "in-flight refresh status",
    );
    const { text } = chromeRow(frame, "enter graph");
    // The status keeps its whole label; the help text is the slot that yields.
    expect(text.endsWith("refreshing…")).toBe(true);
    expect(text).not.toContain("q quit");
    expect(text.startsWith("enter graph")).toBe(true);
  } finally {
    setup.renderer.destroy();
  }
});

test("watch refresh discovers a job retried while the pipeline was terminal", async () => {
  const { scheduled } = capturePollTimers();
  // A running list row keeps the list loop on NORMAL_POLL_MS, so the only
  // source of IDLE_POLL_MS below is the graph loop's watch interval.
  listDefault = [runningRow(42, 5)];
  graphGate.resolve(
    graphFor("SUCCESS", [jobIn("build", "99", "success")]),
  );
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("build"), "terminal graph");
    await waitFor(() => pollDelays(scheduled).includes(IDLE_POLL_MS), "watch interval scheduled");
    const callsBefore = fetchGraphCalls.length;
    graphScript = [
      graphFor("RUNNING", [
        { ...jobIn("build", "99", "success"), retried: true },
        jobIn("build", "101", "running"),
      ]),
    ];
    await waitFor(() => fetchGraphCalls.length > callsBefore, "watch refetch after retry");
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("build") &&
        frame.includes(statusIcon("running")) &&
        !frame.includes(statusIcon("success")),
      "retried job collapsed to latest card",
    );
    await waitFor(
      () =>
        pollDelays(scheduled).some(
          (delay, index) =>
            delay === IDLE_POLL_MS && pollDelays(scheduled)[index + 1] === NORMAL_POLL_MS,
        ),
      "interval back to normal after discovery",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("two-stage graph renders columns of rounded job cards", async () => {
  graphGate.resolve(
    graphFor("SUCCESS", [
      { ...jobIn("lint", "1", "success"), stage: "test" },
      { ...jobIn("compile", "2", "failed"), stage: "build" },
    ]),
  );
  const setup = await testRender(<App />, { width: 90, height: 18 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (text) => text.includes("lint") && text.includes("compile"),
      "two-stage graph",
    );
    expect(frame).toMatch(/[╭╮╰╯]/);
    expect(frame).toContain("▸");
    expect(frame).toContain("lint");
    expect(frame).toContain("compile");
    expect(frame).not.toMatch(/>\[[^\]]+\] <-/);
    const lintCol = frame.indexOf("lint");
    const compileCol = frame.indexOf("compile");
    expect(lintCol).toBeGreaterThan(-1);
    expect(compileCol).toBeGreaterThan(lintCol);
  } finally {
    setup.renderer.destroy();
  }
});

test("GraphBody keeps equal card widths in a column and even gutters between stages", async () => {
  const jobs = [
    { ...jobIn("lint", "1", "success"), stage: "quality" },
    { ...jobIn("qualityspy-v2", "2", "success"), stage: "quality" },
    { ...jobIn("build", "3", "success"), stage: "build" },
    { ...jobIn("owasp-dependency-check", "4", "success"), stage: "security" },
    { ...jobIn("sast", "5", "failed"), stage: "security" },
  ];
  const graph = buildStageGraph(jobs, ["quality", "build", "security"]);
  const setup = await testRender(
    <GraphBody columns={graph.columns} edges={graph.edges} focusedId="gid://gitlab/Ci::Build/1" />,
    { width: 120, height: 20 },
  );
  try {
    await setup.renderOnce();
    const lines = setup.captureCharFrame().split("\n");
    const cardSpans = (line: string) => {
      const spans: number[] = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "╭") {
          const end = line.indexOf("╮", i);
          if (end > i) {
            spans.push(end - i + 1);
            i = end;
          }
        }
      }
      return spans;
    };
    const gutters = (line: string) => {
      const gaps: number[] = [];
      let prevEnd = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "╭" && prevEnd >= 0) {
          gaps.push(i - prevEnd - 1);
        }
        if (line[i] === "╮") {
          prevEnd = i;
        }
      }
      return gaps;
    };

    const lintBar = lines[lines.findIndex((line) => line.includes("lint")) - 1] ?? "";
    const spyBar = lines[lines.findIndex((line) => line.includes("qualityspy-v2")) - 1] ?? "";
    expect(cardSpans(lintBar)[0]).toBe(cardSpans(spyBar)[0]);

    const owaspBar = lines[lines.findIndex((line) => line.includes("owasp-dependency-check")) - 1] ?? "";
    const sastBar = lines[lines.findIndex((line) => line.includes("sast")) - 1] ?? "";
    expect(cardSpans(owaspBar).at(-1)).toBe(cardSpans(sastBar).at(-1));

    const topRow = lines.find((line) => (line.match(/╭/g) ?? []).length >= 3) ?? "";
    const gaps = gutters(topRow);
    expect(gaps.length).toBe(2);
    expect(gaps[0]).toBe(gaps[1]);
    expect(gaps[0]).toBeGreaterThan(0);
  } finally {
    setup.renderer.destroy();
  }
});

test("GraphBody draws needs arrows and does not invent them for stages-only", async () => {
  const parsed = parsePipelineGraph(fixture);
  const graph = buildStageGraph(parsed.jobs, parsed.stageNames);
  const setup = await testRender(
    <GraphBody columns={graph.columns} edges={graph.edges} focusedId={parsed.jobs[0]?.id} />,
    { width: 140, height: 36 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("sonarqube");
    expect(frame).toContain("tests");
    expect(frame).toMatch(/▶|◀/);
    const prepareCol = frame.indexOf("prepare");
    const securityCol = frame.indexOf("security");
    expect(prepareCol).toBeGreaterThan(-1);
    expect(securityCol).toBeGreaterThan(prepareCol);
  } finally {
    setup.renderer.destroy();
  }

  const stages = buildStageGraph([
    { ...jobIn("lint", "1", "success"), stage: "test" },
    { ...jobIn("compile", "2", "success"), stage: "build" },
  ]);
  const setup2 = await testRender(
    <GraphBody columns={stages.columns} edges={stages.edges} focusedId="gid://gitlab/Ci::Build/1" />,
    { width: 80, height: 16 },
  );
  try {
    await setup2.renderOnce();
    const frame = setup2.captureCharFrame();
    expect(frame).toContain("lint");
    expect(frame).toContain("compile");
    expect(frame).not.toMatch(/▶|◀|→|-->/);
  } finally {
    setup2.renderer.destroy();
  }
});

test("graph keys stay in-stage vertically, change stage horizontally, and Enter/Esc/bridge keep v1 behavior", async () => {
  graphGate.resolve(
    graphFor("SUCCESS", [
      { ...jobIn("lint", "1", "success"), stage: "test" },
      { ...jobIn("unit", "2", "success"), stage: "test" },
      { ...jobIn("compile", "3", "success"), stage: "build" },
      {
        ...jobIn("trigger-child", "50", "success"),
        kind: "BRIDGE",
        isBridge: true,
        stage: "deploy",
      },
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 22 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    const graphFrame = await waitForFrame(
      setup,
      (frame) => frame.includes("lint") && frame.includes("trigger-child"),
      "graph with bridge",
    );
    expect((graphFrame.match(/trigger-child/g) ?? []).length).toBe(1);

    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(
      setup,
      (frame) => frame.split("\n").some((line) => line.includes("▸") && line.includes("unit")),
      "down stays in test stage",
    );

    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(
      setup,
      (frame) => frame.split("\n").some((line) => line.includes("▸") && line.includes("compile")),
      "right moves to build stage",
    );

    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("log compile"), "log for focused job");
    expect(spawnCalls).toBe(1);

    setup.mockInput.pressEscape();
    await waitForFrame(
      setup,
      (frame) => frame.includes("compile") && frame.includes("pipeline 5"),
      "esc returns to graph",
    );
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "esc returns to list");
  } finally {
    setup.renderer.destroy();
  }
});

test("Enter on a retried card opens attempts, then log, and Esc returns through attempts", async () => {
  graphGate.resolve(
    graphFor("SUCCESS", [
      { ...jobIn("lint", "10", "failed"), retried: true },
      jobIn("lint", "12", "success"),
    ]),
  );
  const setup = await testRender(<App />, { width: 80, height: 16 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    const graphFrame = await waitForFrame(
      setup,
      (frame) =>
        frame.includes("pipeline 5") &&
        frame.includes("lint") &&
        (frame.match(/lint/g) ?? []).length === 1,
      "collapsed retried card",
    );
    expect(graphFrame).not.toContain("attempts lint");

    setup.mockInput.pressEnter();
    const attemptsFrame = await waitForFrame(
      setup,
      (frame) => frame.includes("attempts lint") && frame.includes("#12") && frame.includes("#10"),
      "attempts list",
    );
    expect(attemptsFrame).toContain("enter log");
    expect(spawnCalls).toBe(0);

    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("log lint"), "log for latest attempt");
    expect(spawnCalls).toBe(1);

    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("attempts lint"), "esc to attempts");
    setup.mockInput.pressEscape();
    await waitForFrame(
      setup,
      (frame) => frame.includes("pipeline 5") && frame.includes("lint"),
      "esc to graph",
    );
  } finally {
    setup.renderer.destroy();
  }
});

/**
 * Replace the OpenTUI clipboard writer with a recorder so tests can assert
 * what would have landed in the operator's clipboard without touching it.
 * `copyPlainText` stays real (its call-through spy keeps the empty-text guard
 * under test).
 */
function recordClipboardWrites() {
  const writes: string[] = [];
  spyOn(clipboardModule, "clipboardWriter").mockImplementation(
    () => (text: string) => {
      writes.push(text);
    },
  );
  const copyPlainTextSpy = spyOn(clipboardModule, "copyPlainText");
  return { writes, copyPlainTextSpy };
}

/**
 * Drive a mouse drag explicitly as down → move → up. A single motion step is
 * enough for these assertions and keeps the mock parser from losing the
 * release when React re-renders mid-drag.
 */
async function dragOver(
  setup: Awaited<ReturnType<typeof testRender>>,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await setup.mockMouse.pressDown(start.x, start.y);
  await setup.mockMouse.moveTo(end.x, end.y);
  await setup.mockMouse.release(end.x, end.y);
}

async function openLog(
  setup: Awaited<ReturnType<typeof testRender>>,
  body: string,
  visible = body.split("\n")[0] ?? "",
) {
  await openGraph(setup);
  traceStdout = new TextEncoder().encode(body);
  setup.mockInput.pressEnter();
  return waitForFrame(
    setup,
    (frame) => frame.includes("y yank") && frame.includes(visible),
    "log screen with trace body",
  );
}

function errorLine(frame: string) {
  const lines = frame.split("\n");
  const row = lines.findIndex((line) => line.includes("ERROR: boom"));
  return { row, col: (lines[row] ?? "").indexOf("ERROR") };
}

test("mouse drag on the log copies the selected trace text without chrome", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "ERROR: boom\nSECOND: line\n");
    const { row, col } = errorLine(frame);
    expect(row).toBeGreaterThan(-1);
    expect(col).toBeGreaterThan(-1);

    await dragOver(setup, { x: col, y: row }, { x: col + 4, y: row });
    await waitFor(() => writes.length > 0, "clipboard write after the drag");

    expect(writes).toHaveLength(1);
    // Exactly the dragged cells: copying the whole buffer instead would fail.
    expect(writes[0]).toBe("ERROR");
    // The copied selection is dropped instead of staying highlighted.
    expect(setup.renderer.hasSelection).toBe(false);
    await waitForFrame(setup, (frame) => frame.includes("copied to clipboard"), "copied notice");
  } finally {
    setup.renderer.destroy();
  }
});

test("mouse drag copies styled trace text as plain characters", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "\u001b[31mFAIL\u001b[0m: boom\n", "FAIL: boom");
    const lines = frame.split("\n");
    const row = lines.findIndex((line) => line.includes("FAIL: boom"));
    const col = (lines[row] ?? "").indexOf("FAIL");
    expect(row).toBeGreaterThan(-1);
    expect(col).toBeGreaterThan(-1);

    await dragOver(setup, { x: col, y: row }, { x: col + 3, y: row });
    await waitFor(() => writes.length > 0, "clipboard write after the styled drag");

    expect(writes).toEqual(["FAIL"]);
    expect(writes[0]).not.toContain("\u001b");
  } finally {
    setup.renderer.destroy();
  }
});

test("the copied notice is chrome and cannot be dragged into a copy", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "ERROR: boom\nSECOND: line\n");
    setup.mockInput.pressKey("y");
    await waitFor(() => writes.length > 0, "clipboard write after y");
    const noticeFrame = await waitForFrame(
      setup,
      (text) => text.includes("copied to clipboard"),
      "copied notice",
    );

    const lines = noticeFrame.split("\n");
    const noticeRow = lines.findIndex((line) => line.includes("copied to clipboard"));
    const noticeCol = (lines[noticeRow] ?? "").indexOf("copied to clipboard");
    const { row: bodyRow } = errorLine(noticeFrame);
    expect(noticeRow).toBeGreaterThan(bodyRow);
    expect(noticeCol).toBeGreaterThan(-1);

    // A drag that starts on the notice must not pull footer chrome into a
    // second copy while it is on screen.
    await setup.mockMouse.pressDown(noticeCol, noticeRow);
    await setup.mockMouse.moveTo(noticeCol + 2, bodyRow);
    await setup.mockMouse.release(noticeCol + 2, bodyRow);
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toHaveLength(1);
  } finally {
    setup.renderer.destroy();
  }
});

test("mouse drag on the graph does not copy log text", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    await openGraph(setup);
    await dragOver(setup, { x: 2, y: 2 }, { x: 6, y: 2 });
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("mouse drag with an empty selection leaves the clipboard alone", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "ERROR: boom\n");
    const { row, col } = errorLine(frame);
    // A single press/release on one cell selects no characters.
    await setup.mockMouse.pressDown(col, row);
    await setup.mockMouse.release(col, row);
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);
    expect(setup.captureCharFrame()).not.toContain("copied to clipboard");
  } finally {
    setup.renderer.destroy();
  }
});

test("y on the log yanks the whole retained buffer and names itself in the footer", async () => {
  const { writes, copyPlainTextSpy } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const body = "ERROR: boom\nSECOND: line\n";
    const frame = await openLog(setup, body);
    expect(frame).toContain("ended · ctrl+r retry · y yank · esc back");

    setup.mockInput.pressKey("y");
    await waitFor(() => writes.length > 0, "clipboard write after y");
    expect(copyPlainTextSpy).toHaveBeenCalledWith(body, expect.anything());
    expect(writes).toEqual([body]);
    await waitForFrame(setup, (frame) => frame.includes("copied to clipboard"), "copied notice");
  } finally {
    setup.renderer.destroy();
  }
});

test("the copied notice is pinned to the right edge, apart from the log keys", async () => {
  const { writes } = recordClipboardWrites();
  // Wide enough for the whole log key line beside the notice; the narrow-width
  // truncation of the key line has its own test.
  const setup = await testRender(<App />, { width: 80, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await openLog(setup, "ERROR: boom\nSECOND: line\n");
    setup.mockInput.pressKey("y");
    await waitFor(() => writes.length > 0, "clipboard write after y");
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("copied to clipboard"),
      "copied notice",
    );
    const help = "ended · ctrl+r retry · y yank · esc back";
    const { row, text } = chromeRow(frame, "y yank");
    // The live/ended marker and the log keys stay left, the notice sits right.
    expect(text.startsWith(help)).toBe(true);
    expect(text.endsWith("copied to clipboard")).toBe(true);
    const gap = text.length - help.length - "copied to clipboard".length;
    expect(gap).toBeGreaterThan(1);
    expect(text.slice(help.length)).toBe(" ".repeat(gap) + "copied to clipboard");
    expect(row).not.toContain(`${help}copied`);
  } finally {
    setup.renderer.destroy();
  }
});

test("y while the log is still waiting leaves the clipboard alone", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    await openGraph(setup);
    traceStaysLive = true;
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (frame) => frame.includes("waiting for glab ci trace…") && frame.includes("live · ctrl+r retry · y yank"),
      "waiting log screen",
    );
    setup.mockInput.pressKey("y");
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);
    expect(setup.captureCharFrame()).not.toContain("copied to clipboard");
  } finally {
    setup.renderer.destroy();
  }
});

test("y on the graph does not copy log text", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    await openGraph(setup);
    setup.mockInput.pressKey("y");
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);
    expect(setup.captureCharFrame()).not.toContain("copied to clipboard");
  } finally {
    setup.renderer.destroy();
  }
});

test("the copied notice clears itself without further input", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    await openLog(setup, "ERROR: boom\n");
    setup.mockInput.pressKey("y");
    await waitFor(() => writes.length > 0, "clipboard write after y");
    await waitForFrame(setup, (frame) => frame.includes("copied to clipboard"), "copied notice");

    await Bun.sleep(COPIED_NOTICE_MS + 250);
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("copied to clipboard");
    expect(frame).toContain("ended · ctrl+r retry · y yank · esc back");
  } finally {
    setup.renderer.destroy();
  }
});

test("log chrome is not selectable, so a drag starting on it copies nothing", async () => {
  const { writes } = recordClipboardWrites();
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "ERROR: boom\nSECOND: line\n");
    const lines = frame.split("\n");
    const titleRow = lines.findIndex((line) => line.includes("log build"));
    const footerRow = lines.findIndex((line) => line.includes("y yank"));
    const { row: bodyRow, col } = errorLine(frame);
    expect(titleRow).toBeGreaterThan(-1);
    expect(footerRow).toBeGreaterThan(bodyRow);

    // Title (border chrome) and keymap footer are not selectable.
    for (const chromeRow of [titleRow, footerRow]) {
      await setup.mockMouse.pressDown(col, chromeRow);
      await setup.mockMouse.moveTo(col + 2, bodyRow);
      await setup.mockMouse.release(col + 2, bodyRow);
      await setup.renderOnce();
      await Bun.sleep(20);
      expect(writes).toEqual([]);
    }
  } finally {
    setup.renderer.destroy();
  }
});

test("mouse drag on the list and attempts screens does not copy", async () => {
  const { writes } = recordClipboardWrites();
  graphGate.resolve(
    graphFor("SUCCESS", [
      { ...jobIn("lint", "10", "failed"), retried: true },
      jobIn("lint", "12", "success"),
    ]),
  );
  const setup = await mountApp();
  try {
    // Pipeline list rows are selectable text, but this requirement does not
    // add copy-on-select there.
    const listRow = setup
      .captureCharFrame()
      .split("\n")
      .findIndex((line) => line.includes("#42"));
    expect(listRow).toBeGreaterThan(-1);
    await dragOver(setup, { x: 4, y: listRow }, { x: 14, y: listRow });
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);

    // Same for attempt rows on the way into the log.
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("pipeline 5"), "graph screen");
    setup.mockInput.pressEnter();
    const attemptsFrame = await waitForFrame(
      setup,
      (frame) => frame.includes("attempts lint"),
      "attempts screen",
    );
    const attemptRow = attemptsFrame
      .split("\n")
      .findIndex((line) => line.includes("#12"));
    expect(attemptRow).toBeGreaterThan(-1);
    await dragOver(setup, { x: 4, y: attemptRow }, { x: 14, y: attemptRow });
    await setup.renderOnce();
    await Bun.sleep(20);
    expect(writes).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

/** A graph whose only job failed, so the retry key has something to restart. */
function failedGraph(name = "build", numericId = "99"): PipelineGraph {
  return graphFor("FAILED", [{ ...jobIn(name, numericId, "failed"), stage: "test" }]);
}

async function openFailedGraph(setup: Awaited<ReturnType<typeof testRender>>) {
  await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
  setup.mockInput.pressEnter();
  await waitForFrame(setup, (frame) => frame.includes("pipeline 5"), "graph screen");
}

/** Cards can share a row, so match the focus marker and its card label together. */
function focusedCard(frame: string, icon: string, name: string): boolean {
  return frame.includes(`▸ ${icon} ${name}`);
}

test("ctrl+r retries the focused failed job and keeps the graph on it", async () => {
  // `build` is the leftmost card, so `lint` is not the card a fallback would
  // land on: focus must follow the job, not the first card.
  graphGate.resolve(
    graphFor("FAILED", [
      jobIn("build", "11", "success"),
      { ...jobIn("lint", "10", "failed"), stage: "test" },
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    await waitForFrame(setup, (frame) => focusedCard(frame, statusIcon("success"), "build"), "focus on the first card");
    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(setup, (frame) => focusedCard(frame, statusIcon("failed"), "lint"), "focus on the failed job");
    const callsBefore = fetchGraphCalls.length;

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    expect(retryCalls).toEqual(["10"]);
    await waitForFrame(setup, (frame) => frame.includes("retrying…"), "in-flight retry mark");

    // The in-flight mark does not block navigation.
    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(setup, (frame) => focusedCard(frame, statusIcon("failed"), "lint"), "stayed on the job");
    setup.mockInput.pressKey("ARROW_LEFT");
    await waitForFrame(setup, (frame) => focusedCard(frame, statusIcon("success"), "build"), "moved to the left stage");
    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(setup, (frame) => focusedCard(frame, statusIcon("failed"), "lint"), "moved back to the job");

    graphScript = [
      graphFor("RUNNING", [
        jobIn("build", "11", "success"),
        { ...jobIn("lint", "10", "failed"), retried: true, stage: "test" },
        { ...jobIn("lint", "12", "running"), stage: "test" },
      ]),
    ];
    retryGate.resolve({ jobId: "12" });
    const frame = await waitForFrame(
      setup,
      (frame) => focusedCard(frame, statusIcon("running"), "lint"),
      "focus on the restarted attempt",
    );
    // The superseded attempt must not be the card in focus, and the graph was
    // refreshed once, right after the restart.
    expect(frame).not.toContain(statusIcon("failed"));
    expect(frame).not.toContain("retrying…");
    expect(fetchGraphCalls.length).toBe(callsBefore + 1);
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+r on a job that cannot be retried contacts no GitLab and explains why", async () => {
  graphGate.resolve(graphFor("SUCCESS", [jobIn("build", "99", "success")]));
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (frame) =>
        frame.includes(
          "only failed or canceled jobs can be retried, and only waiting manual jobs can be run",
        ),
      "retry refusal",
    );
    expect(retryCalls).toEqual([]);
    expect(frame).toContain("build");
    expect(frame).toContain("pipeline 5");
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+r on a trigger job refuses in its own words", async () => {
  graphGate.resolve(
    graphFor("FAILED", [
      {
        ...jobIn("trigger-child", "50", "failed"),
        kind: "BRIDGE",
        isBridge: true,
        stage: "deploy",
      },
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("this job cannot be restarted here"),
      "bridge refusal",
    );
    expect(retryCalls).toEqual([]);
    expect(frame).toContain("trigger-child");
  } finally {
    setup.renderer.destroy();
  }
});

test("a repeated ctrl+r while a retry is in flight makes one call", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "first retry");
    await waitForFrame(setup, (frame) => frame.includes("retrying…"), "in-flight retry mark");
    setup.mockInput.pressKey("r", { ctrl: true });
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(retryCalls).toEqual(["99"]);
  } finally {
    retryGate?.resolve({ jobId: null });
    setup.renderer.destroy();
  }
});

test("a refused retry keeps the graph navigable with the reason", async () => {
  graphGate.resolve(
    graphFor("FAILED", [
      { ...jobIn("lint", "10", "failed"), stage: "test" },
      jobIn("build", "11", "success"),
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    retryError = "job is not retryable";
    await askAndConfirm(setup);
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("retry failed: job is not retryable"),
      "retry failure message",
    );
    expect(retryCalls).toEqual(["10"]);
    expect(frame).toContain("lint");
    expect(frame).toContain("build");
    expect(frame).not.toContain("retrying…");

    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(
      setup,
      (frame) => focusedCard(frame, statusIcon("success"), "build"),
      "navigation after the refusal",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("the graph chrome carries the retry key with the other keys", async () => {
  graphGate.resolve(failedGraph("lint", "10"));
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    const frame = setup.captureCharFrame();
    const help = "arrows move  enter log  r refresh  ctrl+r retry/run  esc list  q quit";
    const { row, text } = chromeRow(frame, "ctrl+r retry/run");
    expect(text.startsWith(help)).toBe(true);
    expect(row).toContain(help);
    // Chrome only: the key never leaks into the graph body.
    expect(frame.split("\n").filter((line) => line.includes("ctrl+r retry/run"))).toHaveLength(1);
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+r on the log restarts the traced job and streams the new attempt", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    const oldTrace = queuedTrace();
    traceStreams.push(oldTrace);
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (frame) => frame.includes("live · ctrl+r retry"),
      "live log screen",
    );
    oldTrace.write("old attempt failed\n");
    await waitForFrame(
      setup,
      (frame) => frame.includes("old attempt failed"),
      "log of the failed attempt",
    );
    expect(spawnJobIds).toEqual(["99"]);

    const newTrace = queuedTrace();
    traceStreams.push(newTrace);
    const killsBefore = procKills;
    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    expect(retryCalls).toEqual(["99"]);
    await waitForFrame(setup, (frame) => frame.includes("retrying…"), "in-flight retry mark");

    retryGate.resolve({ jobId: "101" });
    await waitFor(() => spawnJobIds.length === 2, "trace for the new attempt");
    // Exactly the replaced tracer was killed; the new one is running.
    expect(procKills).toBe(killsBefore + 1);
    newTrace.write("restarted attempt\n");
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("restarted attempt"),
      "live trace of the new attempt",
    );
    expect(spawnJobIds).toEqual(["99", "101"]);
    expect(frame).not.toContain("old attempt failed");
    expect(frame).not.toContain("retrying…");
    expect(frame).toContain("log build");
    // The screen is following a live process again, not a finished one.
    expect(frame).toContain("live · ctrl+r retry");
  } finally {
    setup.renderer.destroy();
  }
});

test("a chunk from the replaced attempt cannot land in the restarted log", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    const oldTrace = queuedTrace();
    traceStreams.push(oldTrace);
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("live · ctrl+r retry"), "live log");
    oldTrace.write("old attempt output\n");
    await waitForFrame(setup, (frame) => frame.includes("old attempt output"), "first chunk");

    const newTrace = queuedTrace();
    traceStreams.push(newTrace);
    const killsBefore = procKills;
    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    retryGate.resolve({ jobId: "101" });
    await waitFor(() => spawnJobIds.length === 2, "trace for the new attempt");

    // The replaced tracer is dead, but a chunk already in flight must not
    // reach the buffer that was cleared for the new attempt.
    oldTrace.write("stale from the old attempt\n");
    newTrace.write("fresh output\n");
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("fresh output"),
      "new attempt output",
    );
    expect(frame).not.toContain("stale from the old attempt");
    expect(frame).not.toContain("old attempt output");
    expect(procKills).toBe(killsBefore + 1);
  } finally {
    setup.renderer.destroy();
  }
});

test("a retry from a log tracing an attempt the graph has not seen is refused", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("boom\n");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("boom"), "log screen");

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    traceStdout = new TextEncoder().encode("new attempt\n");
    // The post-retry refresh returns a graph that does not carry the new
    // attempt yet, so its status cannot be read.
    retryGate.resolve({ jobId: "101" });
    await waitFor(() => spawnJobIds.length === 2, "trace for the new attempt");
    await waitFor(() => fetchGraphCalls.length >= 2, "post-retry graph refresh");

    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("the traced attempt is not in the current job list"),
      "refusal for an attempt the graph cannot vouch for",
    );
    // The attempt that was already replaced is never restarted again.
    expect(retryCalls).toEqual(["99"]);
    expect(frame).toContain("new attempt");
    expect(frame).toContain("log build");
  } finally {
    setup.renderer.destroy();
  }
});

test("a spawn failure while replacing the trace returns to the graph", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("boom\n");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("boom"), "log screen");

    spawnFailFromCall = 2;
    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    retryGate.resolve({ jobId: "101" });

    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("spawn failed") && frame.includes("pipeline 5"),
      "graph screen carrying the spawn reason",
    );
    expect(spawnJobIds).toEqual(["99", "101"]);
    expect(frame).not.toContain("waiting for glab ci trace…");
    expect(frame).not.toContain("log build");
    expect(focusedCard(frame, statusIcon("failed"), "build")).toBe(true);
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+r on a log that cannot be retried keeps the output and explains why", async () => {
  const setup = await mountApp();
  try {
    const frame = await openLog(setup, "done\n");
    expect(frame).toContain("log build");
    setup.mockInput.pressKey("r", { ctrl: true });
    const refused = await waitForFrame(
      setup,
      (frame) => frame.includes("only failed or canceled jobs can be retried"),
      "retry refusal on the log",
    );
    expect(retryCalls).toEqual([]);
    expect(refused).toContain("done");
    expect(refused).toContain("log build");
  } finally {
    setup.renderer.destroy();
  }
});

test("a GitLab-refused retry from the log keeps the visible output", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("boom\n");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("boom"), "log screen");

    retryError = "job is not retryable";
    await askAndConfirm(setup);
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("retry failed: job is not retryable"),
      "retry failure on the log",
    );
    expect(frame).toContain("boom");
    expect(frame).toContain("log build");
    expect(spawnJobIds).toEqual(["99"]);
  } finally {
    setup.renderer.destroy();
  }
});

test("a log retry whose new id cannot be read returns to the graph with a message", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("boom\n");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("boom"), "log screen");

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    retryGate.resolve({ jobId: null });

    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("retried, but the new attempt could not be followed"),
      "unfollowable retry notice",
    );
    expect(frame).toContain("pipeline 5");
    expect(focusedCard(frame, statusIcon("failed"), "build")).toBe(true);
    // The log is gone, so no third trace was spawned.
    expect(spawnJobIds).toEqual(["99"]);
  } finally {
    setup.renderer.destroy();
  }
});

test("the log chrome carries the retry key and the trace body stays log text", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("boom\n");
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(setup, (frame) => frame.includes("boom"), "log screen");
    const help = "ended · ctrl+r retry · y yank · esc back";
    const { row, text } = chromeRow(frame, "ctrl+r retry");
    expect(text.startsWith(help)).toBe(true);
    expect(row).toContain(help);
    expect(frame.split("\n").filter((line) => line.includes("ctrl+r retry"))).toHaveLength(1);
    const bodyRow = frame.split("\n").find((line) => line.includes("boom")) ?? "";
    expect(bodyRow).not.toContain("ctrl+r");
  } finally {
    setup.renderer.destroy();
  }
});

/** Two attempts of one job, the newest one failed, so the list has a target. */
function retriedAttemptsGraph(): PipelineGraph {
  return graphFor("FAILED", [
    { ...jobIn("lint", "10", "failed"), retried: true, stage: "test" },
    { ...jobIn("lint", "12", "failed"), stage: "test" },
  ]);
}

async function openAttempts(setup: Awaited<ReturnType<typeof testRender>>) {
  await openFailedGraph(setup);
  setup.mockInput.pressEnter();
  await waitForFrame(
    setup,
    (frame) => frame.includes("attempts lint") && frame.includes("#12"),
    "attempts list",
  );
}

function focusedAttemptRow(frame: string, numericId: string): boolean {
  return frame
    .split("\n")
    .some((line) => line.includes("> ") && line.includes(`#${numericId}`));
}

test("ctrl+r on the attempts list restarts the focused attempt and follows it", async () => {
  graphGate.resolve(retriedAttemptsGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    expect(focusedAttemptRow(setup.captureCharFrame(), "12")).toBe(true);
    const callsBefore = fetchGraphCalls.length;

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    expect(retryCalls).toEqual(["12"]);
    await waitForFrame(setup, (frame) => frame.includes("retrying…"), "in-flight retry mark");

    setup.mockInput.pressKey("r", { ctrl: true });
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(retryCalls).toEqual(["12"]);

    graphScript = [
      graphFor("RUNNING", [
        { ...jobIn("lint", "10", "failed"), retried: true, stage: "test" },
        { ...jobIn("lint", "12", "failed"), retried: true, stage: "test" },
        { ...jobIn("lint", "14", "running"), stage: "test" },
      ]),
    ];
    retryGate.resolve({ jobId: "14" });
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("#14") && focusedAttemptRow(frame, "14"),
      "new attempt in focus",
    );
    expect(frame).toContain("attempts lint");
    expect(frame).toContain("#10");
    expect(frame).toContain("#12");
    expect(frame).not.toContain("retrying…");
    expect(fetchGraphCalls.length).toBe(callsBefore + 1);
  } finally {
    setup.renderer.destroy();
  }
});

test("ctrl+r on a successful attempt contacts no GitLab and explains why", async () => {
  graphGate.resolve(
    graphFor("SUCCESS", [
      { ...jobIn("lint", "10", "success"), retried: true, stage: "test" },
      { ...jobIn("lint", "12", "success"), stage: "test" },
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("only failed or canceled jobs can be retried"),
      "attempt retry refusal",
    );
    expect(retryCalls).toEqual([]);
    expect(frame).toContain("attempts lint");
    expect(frame).toContain("#12");
  } finally {
    setup.renderer.destroy();
  }
});

test("a refused attempt retry keeps the rows navigable with the reason", async () => {
  graphGate.resolve(retriedAttemptsGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    retryError = "job is not retryable";
    await askAndConfirm(setup);
    const frame = await waitForFrame(
      setup,
      (frame) => frame.includes("retry failed: job is not retryable"),
      "attempt retry failure",
    );
    expect(retryCalls).toEqual(["12"]);
    expect(frame).toContain("#12");
    expect(frame).not.toContain("retrying…");

    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(
      setup,
      (frame) => focusedAttemptRow(frame, "10"),
      "rows still navigable after the refusal",
    );
  } finally {
    setup.renderer.destroy();
  }
});

test("the attempts chrome carries the retry key with the other keys", async () => {
  graphGate.resolve(retriedAttemptsGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    const frame = setup.captureCharFrame();
    const help = "enter log  ctrl+r retry  esc graph  q quit";
    const { row, text } = chromeRow(frame, "ctrl+r retry");
    expect(text.startsWith(help)).toBe(true);
    expect(row).toContain(help);
    // Chrome only: the key never leaks into the attempt rows.
    expect(frame.split("\n").filter((line) => line.includes("ctrl+r retry"))).toHaveLength(1);
  } finally {
    setup.renderer.destroy();
  }
});

test("an older graph fetch cannot replace a newly opened pipeline", async () => {
  listDefault = [runningRow(42, 5), row(43, 6, "success")];
  const setup = await testRender(<App />, { width: 90, height: 18 });
  try {
    await waitForFrame(
      setup,
      (frame) => frame.includes("#42") && frame.includes("#43"),
      "two pipelines",
    );
    graphGate.resolve(
      graphFor("RUNNING", [{ ...jobIn("job-five", "1", "running"), stage: "build" }]),
    );
    setup.mockInput.pressEnter();
    // Hold every later fetch, including the one pipeline 5's poll starts.
    graphGate = Promise.withResolvers<PipelineGraph>();
    await waitForFrame(setup, (frame) => frame.includes("job-five"), "pipeline 5 graph");

    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("> #42"), "back on the list");
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(setup, (frame) => frame.includes("> #43"), "pipeline 6 selected");
    graphScript = [
      {
        ...graphFor("SUCCESS", [{ ...jobIn("job-six", "2", "success"), stage: "build" }]),
        iid: "6",
      },
    ];
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (frame) => frame.includes("pipeline 6") && frame.includes("job-six"),
      "pipeline 6 graph",
    );
    const callsBefore = fetchGraphCalls.length;

    // Pipeline 5's poll, started before the navigation, answers late.
    graphGate.resolve(
      graphFor("RUNNING", [{ ...jobIn("job-five", "1", "running"), stage: "build" }]),
    );
    await Bun.sleep(30);
    const frame = await waitForFrame(setup, (frame) => frame.includes("job-six"), "pipeline 6 kept");
    expect(frame).not.toContain("job-five");
    expect(frame).toContain("pipeline 6");
    expect(fetchGraphCalls.length).toBe(callsBefore);
  } finally {
    setup.renderer.destroy();
  }
});

test("a retry landing after another job's log was opened leaves it alone", async () => {
  graphGate.resolve(
    graphFor("FAILED", [
      { ...jobIn("lint", "10", "failed"), stage: "test" },
      { ...jobIn("deploy", "20", "failed"), stage: "production" },
    ]),
  );
  const setup = await testRender(<App />, { width: 90, height: 18 });
  try {
    await openFailedGraph(setup);
    const firstTrace = queuedTrace();
    traceStreams.push(firstTrace);
    await waitForFrame(setup, (frame) => frame.includes("lint"), "lint card");
    // The leftmost stage holds lint, so it is focused; open its log.
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("log lint"), "log of lint");
    firstTrace.write("lint output\n");
    await waitForFrame(setup, (frame) => frame.includes("lint output"), "lint chunk");

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");
    expect(retryCalls).toEqual(["10"]);

    // Leave for the other job's log while lint's restart is still in flight.
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("pipeline 5"), "graph screen");
    const secondTrace = queuedTrace();
    traceStreams.push(secondTrace);
    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(
      setup,
      (frame) => focusedCard(frame, statusIcon("failed"), "deploy"),
      "deploy focused",
    );
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("log deploy"), "log of deploy");
    secondTrace.write("deploy output\n");
    const before = await waitForFrame(
      setup,
      (frame) => frame.includes("deploy output"),
      "deploy chunk",
    );
    expect(before).not.toContain("lint output");
    const spawnsBefore = [...spawnJobIds];

    retryGate.resolve({ jobId: "12" });
    await Bun.sleep(40);
    const frame = await waitForFrame(setup, (frame) => frame.includes("log deploy"), "deploy log kept");
    expect(spawnJobIds).toEqual(spawnsBefore);
    expect(frame).toContain("deploy output");
    expect(frame).not.toContain("lint output");
    expect(frame).not.toContain("log lint");
  } finally {
    setup.renderer.destroy();
  }
});

function hexRgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function listRowLines(frame: string): string[] {
  return frame.split("\n").filter((line) => /#\d/.test(line));
}

function rowSpans(setup: Awaited<ReturnType<typeof testRender>>, needle: string): CapturedSpan[] {
  return setup
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .filter((span) => span.text.includes(needle));
}

test("list rows render as columns with the bucket color on the status cell alone", async () => {
  listDefault = [
    {
      id: 42,
      iid: 5,
      status: "failed",
      bucket: "failed",
      ref: "refs/merge-requests/2/head",
      source: "merge_request_event",
      createdAt: recentCreatedAt(),
    },
    row(43, 4, "success"),
  ];
  const setup = await testRender(<App />, { width: 70, height: 12 });
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("!2"), "the ref label");
    const rows = listRowLines(frame);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("> #42");
    expect(rows[0]).toContain("failed");
    expect(rows[0]).toContain("!2");
    expect(rows[0]).toContain("5m");
    expect(rows[1]).toContain("  #43");
    expect(rows[1]).toContain("success");
    expect(rows[1]).toContain("main");

    // The bucket color marks the status cell, not the id, name or age.
    expect(rowSpans(setup, "failed")[0]?.fg.toInts().slice(0, 3)).toEqual(hexRgb(BUCKET_COLOR.failed));
    expect(rowSpans(setup, "#42")[0]?.fg.toInts().slice(0, 3)).not.toEqual(hexRgb(BUCKET_COLOR.failed));
    expect(rowSpans(setup, "!2")[0]?.fg.toInts().slice(0, 3)).not.toEqual(hexRgb(BUCKET_COLOR.failed));
  } finally {
    setup.renderer.destroy();
  }
});

test("the column header names the columns and stays while the rows scroll", async () => {
  listDefault = Array.from({ length: 12 }, (_, index) => row(100 + index, index, "success"));
  const setup = await testRender(<App />, { width: 70, height: 12 });
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("PIPELINE"), "the column header");
    const header = frame.split("\n").find((line) => line.includes("PIPELINE")) ?? "";
    const firstRow = listRowLines(frame)[0] ?? "";
    expect(header).toContain("STATUS");
    expect(header).toContain("NAME");
    expect(header).toContain("STARTED");
    expect(header.indexOf("NAME")).toBe(firstRow.indexOf("main"));

    for (let press = 0; press < 10; press++) {
      setup.mockInput.pressArrow("down");
    }
    const scrolled = await waitForFrame(
      setup,
      (f) => f.includes("> #110"),
      "the list scrolled past the first rows",
    );
    expect(scrolled).not.toContain("#100");
    expect(scrolled).toContain("PIPELINE");
    expect(scrolled).toContain("STARTED");
  } finally {
    setup.renderer.destroy();
  }
});

test("a narrow panel drops the started column instead of wrapping rows", async () => {
  listDefault = [row(42, 5, "success"), row(43, 4, "failed", "failed")];
  const setup = await testRender(<App />, { width: 34, height: 12 });
  try {
    const frame = await waitForFrame(setup, (f) => f.includes("#42"), "the narrow list");
    const rows = listRowLines(frame);
    // One line per pipeline: a wrapped row would add a second line for one id.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("success");
    expect(rows[1]).toContain("failed");
    expect(frame).not.toContain("5m");
    expect(frame).not.toContain("STARTED");
    expect(frame).toContain("PIPELINE");
  } finally {
    setup.renderer.destroy();
  }
});

test("a long ref name is ellipsized in place and keeps the started column", async () => {
  listDefault = [{ ...row(42, 5, "success"), ref: "refs/heads/release/2.1-hotfix-with-a-long-tail" }];
  const setup = await testRender(<App />, { width: 50, height: 12 });
  try {
    const frame = await waitForFrame(
      setup,
      (f) => f.split("\n").some((line) => line.includes("#42") && line.includes("…")),
      "the ellipsized name",
    );
    const rows = listRowLines(frame);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("release");
    expect(rows[0]).toContain("5m");
    expect(rows[0]?.indexOf("5m")).toBeGreaterThan(rows[0]?.indexOf("…") ?? -1);
  } finally {
    setup.renderer.destroy();
  }
});

test("a retry notice and a refresh warning keep their own rows on the graph", async () => {
  capturePollTimers();
  graphGate.resolve(graphFor("RUNNING", [jobIn("build", "99", "running")]));
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    graphScript = [new Error("graphql failed"), new Error("graphql failed")];
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (f) =>
        f.includes("only failed or canceled jobs can be retried") &&
        f.includes("refresh error: graphql failed — retrying"),
      "both notice rows",
    );
    const lines = frame.split("\n");
    expect(lines.some((line) => line.includes("only failed or canceled jobs can be retried"))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes("refresh error: graphql failed — retrying"))).toBe(
      true,
    );
  } finally {
    setup.renderer.destroy();
  }
});

/** A graph whose only job waits for a manual action. */
function manualGraph(name = "deploy", numericId = "99"): PipelineGraph {
  return graphFor("MANUAL", [{ ...jobIn(name, numericId, "manual"), stage: "deploy" }]);
}

test("the confirmation prompt asks before a retry and names the job", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (f) => f.includes("enter confirm  esc cancel"),
      "confirmation prompt",
    );
    expect(frame).toContain("retry job build?");
    // The screen behind the prompt is still the graph, card and all.
    expect(frame).toContain("pipeline 5");
    // The card behind the prompt is still drawn, not just named in its question.
    expect(focusedCard(frame, statusIcon("failed"), "build")).toBe(true);
    expect(retryCalls).toEqual([]);

    // Chrome colors only: the prompt never borrows a state-carrying color.
    const question = rowSpans(setup, "retry job build?")[0];
    const keys = rowSpans(setup, "enter confirm")[0];
    const stateColors = [BUCKET_COLOR.success, BUCKET_COLOR.failed, BUCKET_COLOR["running-or-pending"]].map(
      hexRgb,
    );
    expect(question?.fg.toInts().slice(0, 3)).toEqual(hexRgb("#9ca3af"));
    expect(keys?.fg.toInts().slice(0, 3)).toEqual(hexRgb("#4b5563"));
    expect(stateColors).not.toContainEqual(question?.fg.toInts().slice(0, 3));
    expect(stateColors).not.toContainEqual(keys?.fg.toInts().slice(0, 3));

    setup.mockInput.pressEnter();
    await waitFor(() => retryCalls.length === 1, "confirmed retry");
    expect(retryCalls).toEqual(["99"]);
    const confirmed = await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm"),
      "prompt gone after the confirmation",
    );
    expect(confirmed).toContain("pipeline 5");
  } finally {
    setup.renderer.destroy();
  }
});

test("cancelling the prompt asks nothing, says nothing and stays put", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "confirmation prompt");
    setup.mockInput.pressEscape();
    const frame = await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm") && focusedCard(f, statusIcon("failed"), "build"),
      "graph without the prompt",
    );
    expect(frame).not.toContain("retry job");
    expect(frame).not.toContain("only failed or canceled");
    expect(frame).toContain("pipeline 5");
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("movement and refresh keys do nothing while the prompt is open", async () => {
  capturePollTimers();
  graphGate.resolve(
    graphFor("FAILED", [
      { ...jobIn("lint", "10", "failed"), stage: "test" },
      jobIn("build", "11", "success"),
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    await waitForFrame(setup, (f) => focusedCard(f, statusIcon("failed"), "lint"), "lint focused");
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("retry job lint?"), "confirmation prompt");
    const callsBefore = fetchGraphCalls.length;

    setup.mockInput.pressKey("ARROW_RIGHT");
    setup.mockInput.pressKey("r");
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("retry job lint?");
    expect(frame).toContain("enter confirm  esc cancel");
    expect(focusedCard(frame, statusIcon("failed"), "lint")).toBe(true);
    expect(frame).not.toContain("only failed or canceled");
    expect(fetchGraphCalls.length).toBe(callsBefore);
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("the run prompt asks before a waiting manual job is started", async () => {
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(setup, (f) => f.includes("enter confirm"), "run prompt");
    expect(frame).toContain("run job deploy?");
    expect(playCalls).toEqual([]);
    expect(retryCalls).toEqual([]);

    playGate = Promise.withResolvers();
    setup.mockInput.pressEnter();
    await waitFor(() => playCalls.length === 1, "run call");
    expect(playCalls).toEqual(["99"]);
    await waitForFrame(setup, (f) => f.includes("running…"), "in-flight run mark");

    graphScript = [graphFor("RUNNING", [{ ...jobIn("deploy", "99", "pending"), stage: "deploy" }])];
    playGate.resolve({ jobId: "99" });
    const done = await waitForFrame(
      setup,
      (f) => focusedCard(f, statusIcon("pending"), "deploy"),
      "the same card turned running-or-pending",
    );
    expect(done).not.toContain("running…");
    expect(done).not.toContain("retrying…");
  } finally {
    setup.renderer.destroy();
  }
});

test("a repeated press while a run is in flight makes one call", async () => {
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    playGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => playCalls.length === 1, "first run");
    await waitForFrame(setup, (f) => f.includes("running…"), "in-flight run mark");
    setup.mockInput.pressKey("r", { ctrl: true });
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(playCalls).toEqual(["99"]);
  } finally {
    playGate?.resolve({ jobId: null });
    setup.renderer.destroy();
  }
});

test("a rejected run keeps the graph navigable with the reason", async () => {
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    playError = "Could not trigger job with ID: 99";
    await askAndConfirm(setup);
    const frame = await waitForFrame(
      setup,
      (f) => f.includes("run failed: Could not trigger job with ID: 99"),
      "run failure message",
    );
    expect(playCalls).toEqual(["99"]);
    expect(frame).toContain("deploy");
    expect(frame).not.toContain("running…");

    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(setup, (f) => f.includes("pipeline 5"), "graph still navigable");
  } finally {
    setup.renderer.destroy();
  }
});

test("a waiting manual job is never run from its log", async () => {
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    traceStdout = new TextEncoder().encode("waiting\n");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("log deploy"), "log screen");

    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(
      setup,
      (f) => f.includes("only failed or canceled jobs can be retried"),
      "run refusal on the log",
    );
    expect(frame).not.toContain("enter confirm");
    expect(frame).not.toContain("and only waiting manual jobs can be run");
    expect(playCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("the log screen asks before it restarts the traced job", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    const trace = queuedTrace();
    traceStreams.push(trace);
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("log build"), "log screen");
    trace.write("boom\n");
    await waitForFrame(setup, (f) => f.includes("boom"), "log body");

    setup.mockInput.pressKey("r", { ctrl: true });
    const asked = await waitForFrame(setup, (f) => f.includes("enter confirm"), "log prompt");
    expect(asked).toContain("retry job build?");
    expect(asked).toContain("boom");
    expect(retryCalls).toEqual([]);

    // The trace keeps streaming while the prompt is open.
    trace.write("still streaming\n");
    await waitForFrame(
      setup,
      (f) => f.includes("still streaming") && f.includes("enter confirm"),
      "chunk while the prompt is open",
    );

    setup.mockInput.pressEscape();
    await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm") && f.includes("still streaming"),
      "log without the prompt",
    );
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("the attempts screen asks before it restarts the focused attempt", async () => {
  graphGate.resolve(retriedAttemptsGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    const frame = await waitForFrame(setup, (f) => f.includes("enter confirm"), "attempts prompt");
    expect(frame).toContain("retry job lint?");
    expect(frame).toContain("#12");
    expect(retryCalls).toEqual([]);

    setup.mockInput.pressEnter();
    await waitFor(() => retryCalls.length === 1, "attempt retry");
    expect(retryCalls).toEqual(["12"]);
  } finally {
    setup.renderer.destroy();
  }
});

test("quit still quits while a prompt is open", async () => {
  let exited = false;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exited = true;
    void code;
  }) as typeof process.exit;

  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "confirmation prompt");
    setup.mockInput.pressKey("q");
    await setup.renderOnce();
    expect(exited).toBe(true);
    expect(retryCalls).toEqual([]);
  } finally {
    process.exit = originalExit;
    setup.renderer.destroy();
  }
});

test("two confirming keys in the same frame start one action", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    retryGate = Promise.withResolvers();
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "confirmation prompt");
    // Both keys arrive before React redraws, so the second sees the same prompt.
    setup.mockInput.pressEnter();
    setup.mockInput.pressEnter();
    await waitFor(() => retryCalls.length === 1, "one retry call");
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(retryCalls).toEqual(["99"]);
  } finally {
    retryGate?.resolve({ jobId: null });
    setup.renderer.destroy();
  }
});

test("a refresh that lands under the prompt keeps the confirmed action honest", async () => {
  capturePollTimers();
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "confirmation prompt");

    // The watch poll answers with a job that no longer failed, while the prompt
    // is still open. Confirming must not start anything from the stale card.
    graphScript = [graphFor("SUCCESS", [{ ...jobIn("build", "99", "success"), stage: "test" }])];
    await waitForFrame(
      setup,
      (f) => f.includes("enter confirm") && f.includes(statusIcon("success")),
      "refreshed card behind the prompt",
    );

    setup.mockInput.pressEnter();
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(retryCalls).toEqual([]);
    const frame = setup.captureCharFrame();
    expect(frame).not.toContain("enter confirm");
    expect(frame).toContain("that job's status changed while the prompt was open");
  } finally {
    setup.renderer.destroy();
  }
});

test("a run on a terminal pipeline pulls the pending watch interval back to normal", async () => {
  const { scheduled } = capturePollTimers();
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    await waitFor(() => pollDelays(scheduled).includes(IDLE_POLL_MS), "watch interval scheduled");

    playGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => playCalls.length === 1, "run call");
    graphScript = [graphFor("RUNNING", [{ ...jobIn("deploy", "99", "running"), stage: "deploy" }])];
    playGate.resolve({ jobId: "99" });

    // The post-run refresh reports a running pipeline; the wait the loop had
    // already scheduled must not outlive that.
    await waitFor(
      () =>
        pollDelays(scheduled).some(
          (delay, index) =>
            delay === IDLE_POLL_MS && pollDelays(scheduled)[index + 1] === NORMAL_POLL_MS,
        ),
      "normal interval after the run",
    );
    const frame = await waitForFrame(
      setup,
      (f) => focusedCard(f, statusIcon("running"), "deploy"),
      "the same card now running",
    );
    expect(frame).not.toContain("enter confirm");
  } finally {
    setup.renderer.destroy();
  }
});

test("cancelling the attempts prompt keeps the same row focused", async () => {
  graphGate.resolve(retriedAttemptsGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openAttempts(setup);
    expect(focusedAttemptRow(setup.captureCharFrame(), "12")).toBe(true);
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "attempts prompt");
    setup.mockInput.pressEscape();
    const frame = await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm") && f.includes("attempts lint"),
      "attempts list without the prompt",
    );
    expect(focusedAttemptRow(frame, "12")).toBe(true);
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("the prompt is legible over the graph's refresh overlay", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    // A manual refresh whose answer never comes holds its overlay open.
    const held = Promise.withResolvers<PipelineGraph>();
    graphGate = held;
    setup.mockInput.pressKey("r");
    await waitForFrame(setup, (f) => f.includes("Refreshing…"), "manual refresh overlay");

    setup.mockInput.pressKey("r", { ctrl: true });
    const asked = await waitForFrame(
      setup,
      (f) => f.includes("enter confirm"),
      "prompt over the refresh overlay",
    );
    // The prompt's own text survives whole: the overlay underneath must not
    // composite into it.
    expect(asked).toContain("retry job build?");
    expect(asked).toContain("enter confirm  esc cancel");
    expect(asked.split("\n").filter((line) => line.includes("retry job build?"))).toHaveLength(1);
    expect(retryCalls).toEqual([]);

    // Cancelling reveals the overlay that was behind the prompt all along.
    setup.mockInput.pressEscape();
    await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm") && f.includes("Refreshing…"),
      "overlay after cancelling",
    );
    expect(retryCalls).toEqual([]);

    held.resolve(failedGraph());
    await waitForFrame(setup, (f) => !f.includes("Refreshing…"), "refresh settled");
  } finally {
    setup.renderer.destroy();
  }
});

test("an action in flight blocks a different one on another job", async () => {
  graphGate.resolve(
    graphFor("MANUAL", [
      { ...jobIn("deploy", "99", "manual"), stage: "deploy" },
      { ...jobIn("lint", "10", "failed"), stage: "test" },
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    playGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => playCalls.length === 1, "run call");
    await waitForFrame(setup, (f) => f.includes("running…"), "in-flight run mark");

    // Another job, and the other action, while the run is still unanswered.
    setup.mockInput.pressKey("ARROW_RIGHT");
    await waitForFrame(setup, (f) => focusedCard(f, statusIcon("failed"), "lint"), "lint focused");
    setup.mockInput.pressKey("r", { ctrl: true });
    await Bun.sleep(20);
    await setup.renderOnce();
    expect(retryCalls).toEqual([]);
    expect(playCalls).toEqual(["99"]);
    expect(setup.captureCharFrame()).not.toContain("enter confirm");
  } finally {
    playGate?.resolve({ jobId: null });
    setup.renderer.destroy();
  }
});

test("an action settling after another pipeline was opened leaves that pipeline alone", async () => {
  listDefault = [runningRow(42, 5), row(43, 6, "success")];
  const setup = await testRender(<App />, { width: 90, height: 18 });
  try {
    await waitForFrame(setup, (f) => f.includes("#42") && f.includes("#43"), "two pipelines");
    graphGate.resolve(graphFor("FAILED", [{ ...jobIn("job-five", "10", "failed"), stage: "build" }]));
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("job-five"), "pipeline 5 graph");

    retryGate = Promise.withResolvers();
    await askAndConfirm(setup);
    await waitFor(() => retryCalls.length === 1, "retry call");

    // Leave for another pipeline while the restart is still unanswered.
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (f) => f.includes("> #42"), "back on the list");
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(setup, (f) => f.includes("> #43"), "pipeline 6 selected");
    graphScript = [
      { ...graphFor("SUCCESS", [{ ...jobIn("job-six", "2", "success"), stage: "build" }]), iid: "6" },
    ];
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (f) => f.includes("pipeline 6") && f.includes("job-six"),
      "pipeline 6 graph",
    );

    // The restart answers now; its follow-up fetch belongs to pipeline 5.
    graphScript = [graphFor("RUNNING", [{ ...jobIn("job-five", "10", "running"), stage: "build" }])];
    retryGate.resolve({ jobId: "10" });
    await Bun.sleep(30);
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("job-six");
    expect(frame).toContain("pipeline 6");
    expect(frame).not.toContain("job-five");
  } finally {
    setup.renderer.destroy();
  }
});

test("keys pressed in the request's own frame never reach the screen behind the prompt", async () => {
  graphGate.resolve(
    graphFor("FAILED", [
      { ...jobIn("lint", "10", "failed"), stage: "test" },
      jobIn("build", "11", "success"),
    ]),
  );
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    await waitForFrame(setup, (f) => focusedCard(f, statusIcon("failed"), "lint"), "lint focused");
    const callsBefore = fetchGraphCalls.length;

    // A refresh, a movement and a back key, all before the prompt has rendered.
    setup.mockInput.pressKey("r", { ctrl: true });
    setup.mockInput.pressKey("r");
    setup.mockInput.pressKey("ARROW_RIGHT");
    setup.mockInput.pressEscape();
    const frame = await waitForFrame(
      setup,
      (f) => f.includes("enter confirm"),
      "prompt after the batched keys",
    );
    expect(frame).toContain("retry job lint?");
    expect(frame).toContain("enter confirm");
    expect(frame).not.toContain("Refreshing…");
    expect(frame).toContain("pipeline 5");
    expect(focusedCard(frame, statusIcon("failed"), "lint")).toBe(true);
    expect(fetchGraphCalls.length).toBe(callsBefore);
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("a key pressed in the request's own frame does not open the log or start anything", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 80, height: 14 });
  try {
    await openFailedGraph(setup);
    const spawnsBefore = spawnCalls;
    setup.mockInput.pressKey("r", { ctrl: true });
    setup.mockInput.pressEnter();
    const frame = await waitForFrame(
      setup,
      (f) => f.includes("enter confirm"),
      "prompt after the batched keys",
    );
    expect(frame).toContain("enter confirm");
    expect(frame).toContain("pipeline 5");
    expect(spawnCalls).toBe(spawnsBefore);
    expect(retryCalls).toEqual([]);

    // The prompt is still answerable once it has committed.
    setup.mockInput.pressEscape();
    await waitForFrame(
      setup,
      (f) => !f.includes("enter confirm") && !f.includes("log build"),
      "back to the graph",
    );
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});

test("a refresh asked for in the same frame leaves the request answerable", async () => {
  graphGate.resolve(failedGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    const callsBefore = fetchGraphCalls.length;

    // The refresh goes first, then the request, both in one frame; the refresh
    // answer is held so its overlay stays up.
    const held = Promise.withResolvers<PipelineGraph>();
    graphGate = held;
    setup.mockInput.pressKey("r");
    setup.mockInput.pressKey("r", { ctrl: true });
    const asked = await waitForFrame(
      setup,
      (f) => f.includes("enter confirm"),
      "prompt asked for after a refresh",
    );
    expect(asked).toContain("retry job build?");
    expect(retryCalls).toEqual([]);
    expect(fetchGraphCalls.length).toBeGreaterThan(callsBefore);

    // Confirming waits for that refresh, then starts the action it approved.
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (f) => f.includes("waiting for the refresh…"),
      "held confirmation",
    );
    expect(retryCalls).toEqual([]);
    held.resolve(failedGraph());
    await waitFor(() => retryCalls.length === 1, "confirmed retry");
    expect(retryCalls).toEqual(["99"]);
  } finally {
    setup.renderer.destroy();
  }
});

test("a confirmation held for a refresh never runs a job the refresh says is already started", async () => {
  graphGate.resolve(manualGraph());
  const setup = await testRender(<App />, { width: 100, height: 20 });
  try {
    await openFailedGraph(setup);
    const held = Promise.withResolvers<PipelineGraph>();
    graphGate = held;
    setup.mockInput.pressKey("r");
    setup.mockInput.pressKey("r", { ctrl: true });
    const asked = await waitForFrame(setup, (f) => f.includes("enter confirm"), "run prompt");
    expect(asked).toContain("run job deploy?");

    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (f) => f.includes("waiting for the refresh…"),
      "held confirmation",
    );
    expect(playCalls).toEqual([]);

    // The refresh reports the manual job as already enqueued: playing it would
    // be the invalid-transition case that spawns a second attempt.
    held.resolve(graphFor("RUNNING", [{ ...jobIn("deploy", "99", "pending"), stage: "deploy" }]));
    const refused = await waitForFrame(
      setup,
      (f) => f.includes("that job's status changed while the prompt was open"),
      "refusal after the refresh",
    );
    expect(refused).not.toContain("enter confirm");
    expect(playCalls).toEqual([]);
    expect(retryCalls).toEqual([]);
  } finally {
    setup.renderer.destroy();
  }
});



test("a list refresh failing never releases a graph confirmation", async () => {
  graphGate.resolve(manualGraph());
  const setup = await mountApp();
  try {
    // A manual list refresh whose answer is still outstanding.
    const listHeld = Promise.withResolvers<PipelineRow[]>();
    listGate = listHeld;
    setup.mockInput.pressKey("r");
    await waitForFrame(setup, (f) => f.includes("Refreshing…"), "list refresh overlay");

    // Open the graph while that refresh is unanswered, then start a graph
    // refresh and confirm a run against it.
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (f) => f.includes("pipeline 5"), "graph screen");
    const graphHeld = Promise.withResolvers<PipelineGraph>();
    graphGate = graphHeld;
    setup.mockInput.pressKey("r");
    setup.mockInput.pressKey("r", { ctrl: true });
    await waitForFrame(setup, (f) => f.includes("enter confirm"), "run prompt");
    setup.mockInput.pressEnter();
    await waitForFrame(
      setup,
      (f) => f.includes("waiting for the refresh…"),
      "held confirmation",
    );

    // The old list request failing must not release the hold.
    listHeld.reject(new Error("list failed"));
    await Bun.sleep(30);
    await setup.renderOnce();
    expect(playCalls).toEqual([]);
    expect(setup.captureCharFrame()).toContain("waiting for the refresh…");

    // The graph's own answer does end it, and the run starts once.
    graphHeld.resolve(manualGraph());
    await waitFor(() => playCalls.length === 1, "run after the graph answer");
    expect(playCalls).toEqual(["99"]);
  } finally {
    setup.renderer.destroy();
  }
});
