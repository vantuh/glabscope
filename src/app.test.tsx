import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { PipelineGraph } from "./glab/graph.ts";
import * as probeModule from "./glab/probe.ts";
import * as listModule from "./glab/list.ts";
import * as graphModule from "./glab/graph.ts";
import * as traceModule from "./glab/trace.ts";
import { RateLimitedError } from "./glab/ratelimit.ts";
import type { PipelineRow } from "./glab/list.ts";

const fetchGraphCalls: string[] = [];
let graphGate = Promise.withResolvers<PipelineGraph>();
let spawnCalls = 0;
let spawnShouldThrow = false;
let traceStaysLive = false;
let traceStdout: Uint8Array | null = null;
let listCalls = 0;
let listScript: (PipelineRow[] | Error)[] = [];
let listDefault: PipelineRow[] = [];
let graphScript: (PipelineGraph | Error)[] = [];

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
      },
    ],
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
  const stdout = traceStdout
    ? bytesStream(traceStdout)
    : traceStaysLive
      ? new ReadableStream<Uint8Array>({})
      : closedStream();
  return {
    stdout,
    stderr: traceStaysLive ? new ReadableStream<Uint8Array>({}) : closedStream(),
    exited: traceStaysLive ? new Promise(() => {}) : Promise.resolve(0),
    kill() {},
  } as ReturnType<typeof Bun.spawn>;
}

import type { CapturedSpan } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { App, ScreenPanel } from "./app.tsx";

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
  const bottom = lines.findIndex((line) => line.includes("╰"));
  const leftCol = lines[top]?.indexOf("╭") ?? -1;
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
  const frame = await waitForFrame(setup, (frame) => frame.includes("[build]"), "graph screen");
  expect(frame).toContain("pipeline 5");
  expect(frame).toMatch(/[╭╮╰╯]/);
}

beforeEach(() => {
  fetchGraphCalls.length = 0;
  graphGate = Promise.withResolvers();
  spawnCalls = 0;
  spawnShouldThrow = false;
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
    },
  ];
  graphScript = [];

  spyOn(probeModule, "probeGlab").mockResolvedValue({ ok: true });
  spyOn(listModule, "listPipelines").mockImplementation(() => {
    listCalls += 1;
    // The boot load always uses the default rows; scripted responses apply
    // to background refreshes only.
    const next = listCalls > 1 ? listScript.shift() : undefined;
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next ?? listDefault);
  });
  spyOn(graphModule, "fetchPipelineGraph").mockImplementation((iid: string) => {
    fetchGraphCalls.push(iid);
    const next = graphScript.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return next ? Promise.resolve(next) : graphGate.promise;
  });
  spyOn(traceModule, "spawnTrace").mockImplementation(() => {
    spawnCalls += 1;
    if (spawnShouldThrow) {
      throw new Error("spawn failed");
    }
    return fakeProc();
  });
});

afterEach(() => {
  mock.restore();
});

test("screen panel renders rounded chrome with its title", async () => {
  const setup = await testRender(
    <ScreenPanel title="startup" footer="q quit">
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
    expect(frame).not.toContain("[build]");

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
    await waitForFrame(setup, (text) => text.includes("[build]"), "graph screen");
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
    await waitForFrame(setup, (text) => text.includes("[build]"), "graph screen");
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
      (text) => text.includes("live · esc back"),
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
    expect(frame).toContain("ended · esc back");
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
        expect(frame).toContain("[build]");
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
      (text) => text.includes("ended · esc back"),
      "ended log screen",
    );
    expect(endedFrame).toContain("log build");
    expect(endedFrame).toContain("ended · esc back");
    expect(endedFrame).toContain("waiting for glab ci trace…");
    expect(endedFrame).toMatch(/[╭╮╰╯]/);
  } finally {
    setup.renderer.destroy();
  }
});


function row(id: number, iid: number, bucket: PipelineRow["bucket"], status = "success"): PipelineRow {
  return { id, iid, status, bucket, ref: "main", source: "push" };
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
  };
}

function graphFor(status: string, jobs: PipelineGraph["jobs"]): PipelineGraph {
  return {
    pipelineGid: "gid://gitlab/Ci::Pipeline/1",
    iid: "5",
    status,
    jobs,
    truncated: false,
  };
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
    return realSetTimeout(handler, Math.min(timeout ?? 0, 20), ...args);
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
    await waitForFrame(setup, (frame) => frame.includes("[build]"), "graph screen");
    const afterLeave = listCalls;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(listCalls).toBe(afterLeave);
  } finally {
    setup.renderer.destroy();
  }
});

test("list refresh stops once every visible row is terminal", async () => {
  listDefault = [runningRow(42, 5)];
  listScript = [[row(43, 4, "success"), row(44, 3, "success")]];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    await waitFor(() => listCalls >= 2, "refresh with terminal results");
    const stopped = listCalls;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(listCalls).toBe(stopped);
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
  listDefault = [runningRow(42, 5)];
  listScript = [new Error("list failed"), new Error("list failed")];
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    // The warning renders inline while the last successful rows stay usable.
    await waitForFrame(
      setup,
      (frame) => frame.includes("#42") && frame.includes("list failed"),
      "warning beside the retained list",
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
    await waitForFrame(setup, (frame) => frame.includes("[build]"), "running graph");
    expect(fetchGraphCalls.length).toBeGreaterThanOrEqual(2);

    graphScript = [new Error("graphql failed"), new Error("graphql failed")];
    await waitForFrame(
      setup,
      (frame) => frame.includes("graphql failed") && frame.includes("[build]"),
      "non-fatal refresh warning beside the retained graph",
    );

    graphScript = [graphFor("RUNNING", [jobIn("build", "99", "success")])];
    await waitForFrame(setup, (frame) => !frame.includes("graphql failed"), "recovered graph");
    const buildSpan = setup
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("[build]"));
    expect(buildSpan?.fg.toInts()).toEqual([34, 197, 94, 255]);
    expect(fetchGraphCalls.length).toBeGreaterThanOrEqual(4);
  } finally {
    setup.renderer.destroy();
  }
});

test("graph polling pauses during logs, resumes on return, and stops at a terminal refresh", async () => {
  capturePollTimers();
  listDefault = [runningRow(42, 5)];
  graphGate.resolve(graphFor("RUNNING", [jobIn("build", "99", "running")]));
  const setup = await testRender(<App />, { width: 60, height: 12 });
  try {
    await waitForFrame(setup, (frame) => frame.includes("pipelines"), "pipelines list");
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("[build]"), "running graph");
    await waitFor(() => fetchGraphCalls.length >= 2, "graph polling started");

    traceStaysLive = true;
    setup.mockInput.pressEnter();
    await waitForFrame(setup, (frame) => frame.includes("live · esc back"), "log screen");
    const paused = fetchGraphCalls.length;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(fetchGraphCalls.length).toBe(paused);

    graphScript = [
      graphFor("RUNNING", [jobIn("build", "99", "running")]),
      graphFor("SUCCESS", [jobIn("build", "99", "success")]),
    ];
    setup.mockInput.pressEscape();
    await waitForFrame(setup, (frame) => frame.includes("[build]"), "graph after return");
    await waitFor(() => fetchGraphCalls.length >= paused + 2, "resumed polling");
    const stopped = fetchGraphCalls.length;
    await Bun.sleep(80);
    await setup.renderOnce();
    expect(fetchGraphCalls.length).toBe(stopped);
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
    await waitForFrame(setup, (frame) => frame.includes("[a]"), "running graph");
    setup.mockInput.pressKey("ARROW_DOWN");
    await waitForFrame(setup, (frame) => frame.includes(">[b]"), "focused job b");

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
        const bLine = lines.findIndex((line) => line.includes(">[b]"));
        const aLine = lines.findIndex((line) => line.includes("[a]"));
        return bLine > -1 && aLine > -1 && bLine < aLine;
      },
      "reordered jobs with preserved focus",
    );
  } finally {
    setup.renderer.destroy();
  }
});
