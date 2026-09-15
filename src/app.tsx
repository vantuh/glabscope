import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import {
  emptyModel,
  focusedJob,
  reduce,
  selectedPipeline,
  shouldPollGraph,
  shouldPollList,
  tracedJob,
} from "./model.ts";
import { NORMAL_POLL_MS, nextPollDelay } from "./polling.ts";
import { isQuitKey } from "./keys.ts";
import { probeGlab } from "./glab/probe.ts";
import { listPipelines } from "./glab/list.ts";
import { fetchPipelineGraph, NeedsUnavailableError } from "./glab/graph.ts";
import { RateLimitedError } from "./glab/ratelimit.ts";
import { spawnTrace } from "./glab/trace.ts";
import { BUCKET_COLOR, isActivePipelineStatus } from "./status.ts";
import { buildDag, formatJobLine, visualJobs } from "./layout/dag.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CHROME_COLOR = "#4b5563";
const HELP_COLOR = "#9ca3af";

export function ScreenPanel({
  title,
  footer,
  loadingLabel,
  children,
}: {
  title: string;
  footer: string;
  loadingLabel?: string;
  children: ReactNode;
}) {
  return (
    <box padding={1} flexDirection="column" flexGrow={1}>
      <box
        border
        borderStyle="rounded"
        borderColor={CHROME_COLOR}
        title={title}
        titleColor={CHROME_COLOR}
        flexDirection="column"
        flexGrow={1}
      >
        <box position="relative" flexDirection="column" flexGrow={1}>
          {children}
          {loadingLabel ? <LoadingOverlay label={loadingLabel} /> : null}
        </box>
        {footer ? <text fg={HELP_COLOR}>{footer}</text> : null}
      </box>
    </box>
  );
}

function LoadingOverlay({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={100}
      backgroundColor="#111827cc"
      alignItems="center"
      justifyContent="center"
    >
      <text fg="#60a5fa">
        {SPINNER_FRAMES[frame]} {label}
      </text>
    </box>
  );
}

export function App() {
  const renderer = useRenderer();
  const [model, dispatch] = useReducer(reduce, emptyModel);
  const logProc = useRef<ReturnType<typeof Bun.spawn> | null>(null);
  const navigatingRef = useRef(model.navigating);
  navigatingRef.current = model.navigating;

  useEffect(() => {
    void (async () => {
      const probe = await probeGlab();
      if (!probe.ok) {
        dispatch({ type: "error", message: probe.message, fatal: true });
        return;
      }
      try {
        dispatch({ type: "pipelines", pipelines: await listPipelines() });
      } catch (error) {
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          fatal: true,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!shouldPollList(model)) {
      return;
    }
    let delay = NORMAL_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const rows = await listPipelines();
        if (stopped) {
          return;
        }
        dispatch({ type: "pipelines", pipelines: rows });
        delay = nextPollDelay(delay, false);
        if (!rows.some((row) => row.bucket === "running-or-pending")) {
          return;
        }
      } catch (error) {
        if (stopped) {
          return;
        }
        if (error instanceof RateLimitedError) {
          delay = nextPollDelay(delay, true);
        } else {
          dispatch({
            type: "refreshError",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void tick(), delay);
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
    // The second dependency is a boolean: the loop keeps its own schedule
    // while active rows remain, and restarts only when eligibility flips.
  }, [model.screen, shouldPollList(model)]);

  useEffect(() => {
    if (!shouldPollGraph(model)) {
      return;
    }
    const graph = model.graph;
    if (!graph) {
      return;
    }
    const iid = graph.iid;
    let delay = NORMAL_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const graph = await fetchPipelineGraph(String(iid));
        if (stopped) {
          return;
        }
        dispatch({ type: "refreshGraph", graph });
        delay = nextPollDelay(delay, false);
        if (!isActivePipelineStatus(graph.status)) {
          return;
        }
      } catch (error) {
        if (stopped) {
          return;
        }
        if (error instanceof RateLimitedError) {
          delay = nextPollDelay(delay, true);
        } else {
          dispatch({
            type: "refreshError",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void tick(), delay);
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [model.screen, model.graph?.status, model.graph?.iid]);

  const traceJobId =
    model.navigating?.kind === "logs"
      ? model.navigating.jobId
      : model.screen === "logs"
        ? model.logJobId
        : null;

  useEffect(() => {
    if (!traceJobId) {
      logProc.current?.kill();
      logProc.current = null;
      return;
    }
    const jobId = traceJobId;
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = spawnTrace(jobId);
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        fatal: false,
      });
      return;
    }
    logProc.current = proc;
    let cancelled = false;
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          dispatch({ type: "logChunk", chunk: decoder.decode(value) });
        }
      }
    };
    // Let the graph paint its loading state before switching screens.
    const readyTimer = setTimeout(() => {
      dispatch({ type: "logsReady" });
      void (async () => {
        await Promise.all([
          read(proc.stdout as ReadableStream<Uint8Array>),
          read(proc.stderr as ReadableStream<Uint8Array>),
        ]);
        await proc.exited;
        if (!cancelled) {
          dispatch({ type: "logDone" });
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      proc.kill();
      logProc.current = null;
    };
  }, [traceJobId]);

  const dag = useMemo(
    () => (model.graph ? buildDag(model.graph.jobs) : null),
    [model.graph],
  );

  useKeyboard((key) => {
    if (isQuitKey(key.name)) {
      logProc.current?.kill();
      renderer.destroy();
      process.exit(0);
    }
    if (key.name === "escape") {
      dispatch({ type: "back" });
      return;
    }
    if (model.error) {
      return;
    }
    if (model.screen === "list") {
      if (key.name === "r" && navigatingRef.current === null && !model.manualRefresh) {
        dispatch({ type: "manualRefresh", target: "list" });
        void listPipelines()
          .then((rows) => dispatch({ type: "pipelines", pipelines: rows }))
          .catch((error: unknown) =>
            dispatch({
              type: "refreshError",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
      }
      if (key.name === "up") {
        dispatch({ type: "moveList", delta: -1 });
      }
      if (key.name === "down") {
        dispatch({ type: "moveList", delta: 1 });
      }
      if (key.name === "return") {
        if (navigatingRef.current !== null) {
          return;
        }
        const row = selectedPipeline(model);
        if (!row) {
          return;
        }
        const target = { kind: "graph" as const, pipelineIid: String(row.iid) };
        navigatingRef.current = target;
        dispatch({ type: "startNavigating", target });
        void fetchPipelineGraph(String(row.iid))
          .then((graph) => dispatch({ type: "openGraph", graph }))
          .catch((error: unknown) =>
            dispatch({
              type: "error",
              message:
                error instanceof NeedsUnavailableError
                  ? error.message
                  : error instanceof Error
                    ? error.message
                    : String(error),
              fatal: false,
            }),
          );
      }
    }
    if (model.screen === "graph" && dag) {
      if (model.graph && key.name === "r" && navigatingRef.current === null && !model.manualRefresh) {
        dispatch({ type: "manualRefresh", target: "graph" });
        void fetchPipelineGraph(model.graph.iid)
          .then((graph) => dispatch({ type: "refreshGraph", graph }))
          .catch((error: unknown) =>
            dispatch({
              type: "refreshError",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
      }
      const order = visualJobs(dag);
      const currentId = focusedJob(model)?.id;
      const index = Math.max(0, order.findIndex((job) => job.id === currentId));
      if (key.name === "up" || key.name === "left") {
        const next = order[index - 1];
        if (next) {
          dispatch({ type: "focusJob", id: next.id });
        }
      }
      if (key.name === "down" || key.name === "right") {
        const next = order[index + 1];
        if (next) {
          dispatch({ type: "focusJob", id: next.id });
        }
      }
      if (key.name === "return") {
        if (navigatingRef.current !== null) {
          return;
        }
        const job = focusedJob(model);
        if (!job) {
          return;
        }
        navigatingRef.current = { kind: "logs", jobId: job.numericId };
        dispatch({ type: "openLogs" });
      }
    }
  });

  if (!model.booted) {
    return (
      <ScreenPanel title="startup" footer="q quit">
        <text>Checking glab…</text>
      </ScreenPanel>
    );
  }

  if (model.error) {
    return (
      <ScreenPanel title="error" footer={model.errorFatal ? "q quit" : "esc back  q quit"}>
        <text fg="#ef4444">{model.error}</text>
      </ScreenPanel>
    );
  }

  if (model.screen === "logs") {
    const job = tracedJob(model);
    return (
      <ScreenPanel
        title={`log ${job?.name ?? "job"}`}
        footer={`${model.logDone ? "ended" : "live"} · esc back`}
      >
        <scrollbox focused flexGrow={1} stickyScroll>
          <text>
            {model.logTrace.runs.length === 0
              ? "waiting for glab ci trace…"
              : model.logTrace.runs.map((run, index) => (
                  <span
                    key={index}
                    fg={run.fg}
                    bg={run.bg}
                    attributes={run.bold ? TextAttributes.BOLD : TextAttributes.NONE}
                  >
                    {run.text}
                  </span>
                ))}
          </text>
        </scrollbox>
      </ScreenPanel>
    );
  }

  if (model.screen === "graph") {
    const focusedId = focusedJob(model)?.id;
    return (
      <ScreenPanel
        title={`pipeline ${model.graph?.iid ?? ""}`}
        footer="arrows move  enter log  r refresh  esc list  q quit"
        loadingLabel={
          model.navigating?.kind === "logs"
            ? "Loading log…"
            : model.manualRefresh === "graph"
              ? "Refreshing…"
              : undefined
        }
      >
        {model.refreshWarning ? (
          <text fg="#eab308">refresh error: {model.refreshWarning} — retrying</text>
        ) : null}
        {model.graph?.truncated ? <text fg="#eab308">job list truncated at 100</text> : null}
        <scrollbox focused flexGrow={1}>
          {dag
            ? visualJobs(dag).map((job) => (
                <text key={job.id} fg={BUCKET_COLOR[job.bucket]}>
                  {formatJobLine(job, focusedId)}
                </text>
              ))
            : null}
        </scrollbox>
      </ScreenPanel>
    );
  }

  return (
    <ScreenPanel
      title="pipelines"
      footer="enter graph  r refresh  q quit"
      loadingLabel={
        model.navigating?.kind === "graph"
          ? "Loading pipeline…"
          : model.manualRefresh === "list"
            ? "Refreshing…"
            : undefined
      }
    >
      {model.refreshWarning ? (
        <text fg="#eab308">refresh error: {model.refreshWarning} — retrying</text>
      ) : null}
      <scrollbox focused flexGrow={1}>
        {model.pipelines.map((row, index) => (
          <text key={row.id} fg={BUCKET_COLOR[row.bucket]}>
            {index === model.selectedIndex ? ">" : " "} #{row.id}  {row.status}  {row.ref}
          </text>
        ))}
      </scrollbox>
    </ScreenPanel>
  );
}
