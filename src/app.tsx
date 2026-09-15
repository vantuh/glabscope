import { useEffect, useMemo, useReducer, useRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import {
  emptyModel,
  focusedJob,
  nextPollDelay,
  reduce,
  selectedPipeline,
  shouldPollGraph,
  tracedJob,
} from "./model.ts";
import { isQuitKey } from "./keys.ts";
import { glabBin, probeGlab } from "./glab/probe.ts";
import { listPipelines } from "./glab/list.ts";
import { fetchPipelineGraph, NeedsUnavailableError } from "./glab/graph.ts";
import { traceArgv } from "./glab/trace.ts";
import { BUCKET_COLOR } from "./status.ts";
import { buildDag, formatJobLine, visualJobs } from "./layout/dag.ts";

export function App() {
  const renderer = useRenderer();
  const [model, dispatch] = useReducer(reduce, emptyModel);
  const logProc = useRef<ReturnType<typeof Bun.spawn> | null>(null);

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
    if (!shouldPollGraph(model)) {
      return;
    }
    const iid = selectedPipeline(model)?.iid;
    if (iid === undefined) {
      return;
    }
    let delay = 4000;
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
        if (!shouldPollGraph({ ...model, graph, screen: "graph" })) {
          return;
        }
      } catch (error) {
        if (stopped) {
          return;
        }
        const rateLimited = error instanceof Error && error.name === "RateLimitedError";
        if (!rateLimited) {
          dispatch({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
            fatal: false,
          });
          return;
        }
        delay = nextPollDelay(delay, true);
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
  }, [model.screen, model.graph?.status, model.selectedIndex]);

  useEffect(() => {
    if (model.screen !== "logs" || !model.logJobId) {
      logProc.current?.kill();
      logProc.current = null;
      return;
    }
    const jobId = model.logJobId;
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([glabBin(), ...traceArgv(jobId)], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
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
    return () => {
      cancelled = true;
      proc.kill();
      logProc.current = null;
    };
  }, [model.screen, model.logJobId]);

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
      if (key.name === "up") {
        dispatch({ type: "moveList", delta: -1 });
      }
      if (key.name === "down") {
        dispatch({ type: "moveList", delta: 1 });
      }
      if (key.name === "return") {
        const row = selectedPipeline(model);
        if (!row) {
          return;
        }
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
        dispatch({ type: "openLogs" });
      }
    }
  });

  if (!model.booted) {
    return (
      <box padding={1}>
        <text>Checking glab…</text>
      </box>
    );
  }

  if (model.error) {
    return (
      <box padding={1}>
        <text fg="#ef4444">{model.errorFatal ? "Cannot start" : "Error"}</text>
        <text>{model.error}</text>
        <text fg="#9ca3af">{model.errorFatal ? "q quit" : "esc back  q quit"}</text>
      </box>
    );
  }

  if (model.screen === "logs") {
    const job = tracedJob(model);
    return (
      <box padding={1} flexDirection="column" flexGrow={1}>
        <text>
          log {job?.name} {model.logDone ? "(ended, esc back)" : "(live, esc back)"}
        </text>
        <scrollbox focused flexGrow={1} stickyScroll stickyStart="bottom">
          <text>{model.logBuffer || "waiting for glab ci trace…"}</text>
        </scrollbox>
      </box>
    );
  }

  if (model.screen === "graph") {
    const focusedId = focusedJob(model)?.id;
    return (
      <box padding={1} flexDirection="column" flexGrow={1}>
        <text>
          pipeline iid {selectedPipeline(model)?.iid}  status {model.graph?.status}
        </text>
        {model.graph?.truncated ? (
          <text fg="#eab308">job list truncated at 100</text>
        ) : null}
        <text fg="#9ca3af">arrows move  enter log  esc list  q quit</text>
        <scrollbox focused flexGrow={1}>
          {dag
            ? visualJobs(dag).map((job) => (
                <text key={job.id} fg={BUCKET_COLOR[job.bucket]}>
                  {formatJobLine(job, focusedId)}
                </text>
              ))
            : null}
        </scrollbox>
      </box>
    );
  }

  return (
    <box padding={1} flexDirection="column" flexGrow={1}>
      <text>pipelines  enter graph  q quit</text>
      <scrollbox focused flexGrow={1}>
        {model.pipelines.map((row, index) => (
          <text key={row.id} fg={BUCKET_COLOR[row.bucket]}>
            {index === model.selectedIndex ? ">" : " "} #{row.id}  {row.status}  {row.ref}
          </text>
        ))}
      </scrollbox>
    </box>
  );
}
