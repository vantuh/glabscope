import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { PipelineGraph } from "./glab/graph.ts";
import * as probeModule from "./glab/probe.ts";
import * as listModule from "./glab/list.ts";
import * as graphModule from "./glab/graph.ts";
import * as traceModule from "./glab/trace.ts";

const fetchGraphCalls: string[] = [];
let graphGate = Promise.withResolvers<PipelineGraph>();
let spawnCalls = 0;
let spawnShouldThrow = false;
let traceStaysLive = false;

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

function fakeProc(): ReturnType<typeof Bun.spawn> {
  return {
    stdout: traceStaysLive ? new ReadableStream<Uint8Array>({}) : closedStream(),
    stderr: traceStaysLive ? new ReadableStream<Uint8Array>({}) : closedStream(),
    exited: traceStaysLive ? new Promise(() => {}) : Promise.resolve(0),
    kill() {},
  } as ReturnType<typeof Bun.spawn>;
}

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

  spyOn(probeModule, "probeGlab").mockResolvedValue({ ok: true });
  spyOn(listModule, "listPipelines").mockResolvedValue([
    {
      id: 42,
      iid: 5,
      status: "success",
      bucket: "success",
      ref: "main",
      source: "push",
    },
  ]);
  spyOn(graphModule, "fetchPipelineGraph").mockImplementation((iid: string) => {
    fetchGraphCalls.push(iid);
    return graphGate.promise;
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
