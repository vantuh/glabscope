import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer, useSelectionHandler } from "@opentui/react";
import {
  emptyModel,
  focusedAttempt,
  focusedJob,
  reduce,
  selectedPipeline,
  shouldPollGraph,
  shouldPollList,
  tracedJob,
} from "./model.ts";
import { IDLE_POLL_MS, NORMAL_POLL_MS, nextPollDelay } from "./polling.ts";
import { isQuitKey, isRetryKey } from "./keys.ts";
import { probeGlab } from "./glab/probe.ts";
import { listPipelines } from "./glab/list.ts";
import { fetchPipelineGraph, jobAttempts, NeedsUnavailableError, type JobNode } from "./glab/graph.ts";
import { RateLimitedError } from "./glab/ratelimit.ts";
import { spawnTrace } from "./glab/trace.ts";
import { isRetryableJob, retryJob } from "./glab/retry.ts";
import { clipboardWriter, copyPlainText } from "./clipboard.ts";
import { BUCKET_COLOR, isActivePipelineStatus, statusIcon } from "./status.ts";
import {
  STRIP_WIDTH,
  buildStageGraph,
  moveFocus,
  paintConnectorStrips,
  type StageColumn,
} from "./layout/stage-graph.ts";
import type { DagEdge } from "./layout/dag.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CHROME_COLOR = "#4b5563";
const HELP_COLOR = "#9ca3af";
/** How long the `copied to clipboard` footer notice stays up. */
export const COPIED_NOTICE_MS = 1500;

export function ScreenPanel({
  title,
  keyHelp,
  status,
  loadingLabel,
  children,
}: {
  title: string;
  keyHelp: string;
  status?: ReactNode;
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
        {keyHelp ? (
          <box flexDirection="row" justifyContent="space-between">
            <text fg={HELP_COLOR} selectable={false}>
              {keyHelp}
            </text>
            {status ? <box flexShrink={0}>{status}</box> : null}
          </box>
        ) : null}
      </box>
    </box>
  );
}

function useSpinnerFrame(): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return frame;
}

function RefreshStatus({ label }: { label: string }) {
  const frame = useSpinnerFrame();
  return (
    <text fg="#60a5fa">
      {SPINNER_FRAMES[frame]} {label}
    </text>
  );
}

function CopiedNotice() {
  return (
    <text fg={BUCKET_COLOR.success} selectable={false}>
      copied to clipboard
    </text>
  );
}

function retryFailureMessage(error: unknown): string {
  return `retry failed: ${error instanceof Error ? error.message : String(error)}`;
}

const FOCUS_BORDER = "#e5e7eb";
const MIN_CARD_INNER = 16;
const CARD_LABEL_PREFIX = 2;

function jobLabelWidth(job: JobNode): number {
  return CARD_LABEL_PREFIX + statusIcon(job.status).length + 1 + job.name.length;
}

function columnInnerWidth(col: StageColumn): number {
  return Math.max(MIN_CARD_INNER, col.name.length, ...col.jobs.map(jobLabelWidth));
}

function JobCard({
  job,
  focused,
  innerWidth,
}: {
  job: JobNode;
  focused: boolean;
  innerWidth: number;
}) {
  const label = `${focused ? "▸ " : "  "}${statusIcon(job.status)} ${job.name}`;
  return (
    <box
      id={job.id}
      border
      borderStyle="rounded"
      borderColor={focused ? FOCUS_BORDER : CHROME_COLOR}
      padding={0}
      flexShrink={0}
      width={innerWidth + 2}
    >
      <text fg={BUCKET_COLOR[job.bucket]}>{label.padEnd(innerWidth)}</text>
    </box>
  );
}

export function GraphBody({
  columns,
  edges,
  focusedId,
}: {
  columns: StageColumn[];
  edges: DagEdge[];
  focusedId: string | undefined;
}) {
  const strips = paintConnectorStrips(columns, edges);
  return (
    <box flexDirection="row" flexShrink={0}>
      {columns.map((col, index) => {
        const strip = strips[index] ?? [];
        const stripUsed = strip.some((line) => line.trim().length > 0);
        const last = index === columns.length - 1;
        const showStrip = stripUsed || !last;
        const innerWidth = columnInnerWidth(col);
        return (
          <box key={`${col.name}-${index}`} flexDirection="row" flexShrink={0}>
            <box flexDirection="column" flexShrink={0} width={innerWidth + 2}>
              <text fg={HELP_COLOR}>{col.name}</text>
              {col.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  focused={job.id === focusedId}
                  innerWidth={innerWidth}
                />
              ))}
            </box>
            {showStrip ? (
              <box flexDirection="column" flexShrink={0} width={STRIP_WIDTH}>
                {strip.map((line, row) => (
                  <text key={row} fg={CHROME_COLOR}>
                    {line}
                  </text>
                ))}
              </box>
            ) : null}
          </box>
        );
      })}
    </box>
  );
}

function LoadingOverlay({ label }: { label: string }) {
  const frame = useSpinnerFrame();

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
  const [refreshing, setRefreshing] = useState<"list" | "graph" | null>(null);
  const logProc = useRef<ReturnType<typeof Bun.spawn> | null>(null);
  const graphScrollRef = useRef<ScrollBoxRenderable>(null);
  const navigatingRef = useRef(model.navigating);
  navigatingRef.current = model.navigating;
  const retryRef = useRef(model.retry);
  retryRef.current = model.retry;
  const focusedId = focusedJob(model)?.id;
  const writeClipboard = useMemo(() => clipboardWriter(renderer), [renderer]);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announceCopy = () => {
    setCopiedNotice(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopiedNotice(false), COPIED_NOTICE_MS);
  };

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  // Only the log body is copy-on-select; every other screen stays as before.
  useSelectionHandler((selection) => {
    if (model.screen !== "logs") {
      return;
    }
    if (copyPlainText(selection.getSelectedText(), writeClipboard)) {
      renderer.clearSelection();
      announceCopy();
    }
  });

  useEffect(() => {
    if (model.screen !== "graph" || !focusedId) {
      return;
    }
    graphScrollRef.current?.scrollChildIntoView(focusedId);
  }, [model.screen, focusedId]);

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
    const activeAtEntry = model.pipelines.some(
      (row) => row.bucket === "running-or-pending",
    );
    let delay = activeAtEntry ? NORMAL_POLL_MS : IDLE_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) {
        return;
      }
      setRefreshing("list");
      try {
        const rows = await listPipelines();
        if (stopped) {
          return;
        }
        setRefreshing(null);
        dispatch({ type: "pipelines", pipelines: rows });
        delay = rows.some((row) => row.bucket === "running-or-pending")
          ? nextPollDelay(delay, false)
          : IDLE_POLL_MS;
      } catch (error) {
        if (stopped) {
          return;
        }
        setRefreshing(null);
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
    if (activeAtEntry) {
      void tick();
    } else {
      timer = setTimeout(() => void tick(), delay);
    }
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      setRefreshing(null);
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
    let delay = isActivePipelineStatus(graph.status) ? NORMAL_POLL_MS : IDLE_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) {
        return;
      }
      setRefreshing("graph");
      try {
        const graph = await fetchGraphNow(String(iid));
        if (stopped) {
          return;
        }
        setRefreshing(null);
        delay = isActivePipelineStatus(graph.status)
          ? nextPollDelay(delay, false)
          : IDLE_POLL_MS;
      } catch (error) {
        if (stopped) {
          return;
        }
        setRefreshing(null);
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
    if (isActivePipelineStatus(graph.status)) {
      void tick();
    } else {
      timer = setTimeout(() => void tick(), delay);
    }
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      setRefreshing(null);
    };
  }, [model.screen, model.graph?.iid]);

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
      const message = error instanceof Error ? error.message : String(error);
      // A log screen that is already open has no navigation left to fail:
      // send the operator back to the graph instead of leaving it inert.
      dispatch(
        model.screen === "logs"
          ? { type: "logUnavailable", message }
          : { type: "error", message, fatal: false },
      );
      return;
    }
    logProc.current = proc;
    let cancelled = false;
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (!cancelled) {
        const { done, value } = await reader.read();
        // A read that was already in flight when this trace was replaced must
        // not spill into the buffer of the attempt that replaced it.
        if (done || cancelled) {
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

  const stageGraph = useMemo(
    () => (model.graph ? buildStageGraph(model.graph.jobs, model.graph.stageNames) : null),
    [model.graph],
  );

  /**
   * Graph fetches overlap (poll, manual refresh, a restart), so only the newest
   * result may land: a poll that started before a restart must not put the
   * superseded node back.
   */
  const graphRequestRef = useRef(0);
  const fetchGraphNow = (iid: string) => {
    const request = (graphRequestRef.current += 1);
    return fetchPipelineGraph(iid).then((graph) => {
      if (request === graphRequestRef.current) {
        dispatch({ type: "refreshGraph", graph });
      }
      return graph;
    });
  };

  const refreshGraphAfterRetry = (iid: string) => {
    void fetchGraphNow(iid).catch((error: unknown) =>
      dispatch({
        type: "refreshError",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  /** Run the retry gate, then restart through glab only if the gate allows it. */
  const startRetry = (
    job: JobNode,
    onSuccess: (result: { jobId: string | null }) => void,
  ) => {
    dispatch({ type: "startRetry", job });
    if (!isRetryableJob(job)) {
      return;
    }
    retryRef.current = { jobId: job.numericId, screen: model.screen };
    void retryJob(job.numericId)
      .then(onSuccess)
      .catch((error: unknown) =>
        dispatch({ type: "retryFailed", message: retryFailureMessage(error) }),
      );
  };

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
      if (key.name === "r" && !key.ctrl && navigatingRef.current === null && !model.manualRefresh) {
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
    if (model.screen === "graph" && stageGraph && model.graph) {
      if (isRetryKey(key) && navigatingRef.current === null && retryRef.current === null) {
        const job = focusedJob(model);
        const iid = model.graph.iid;
        if (job) {
          startRetry(job, ({ jobId }) => {
            dispatch({ type: "retrySucceeded", jobId });
            refreshGraphAfterRetry(iid);
          });
        }
      }
      if (model.graph && key.name === "r" && !key.ctrl && navigatingRef.current === null && !model.manualRefresh) {
        dispatch({ type: "manualRefresh", target: "graph" });
        void fetchGraphNow(model.graph.iid).catch((error: unknown) =>
          dispatch({
            type: "refreshError",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      const currentId = focusedJob(model)?.id;
      if (
        key.name === "up" ||
        key.name === "down" ||
        key.name === "left" ||
        key.name === "right"
      ) {
        key.preventDefault();
        key.stopPropagation();
        const next = moveFocus(stageGraph.columns, currentId, key.name);
        if (next && next !== currentId) {
          dispatch({ type: "focusJob", id: next });
        }
      }
      if (key.name === "return") {
        if (navigatingRef.current !== null) {
          return;
        }
        const job = focusedJob(model);
        if (!job || !model.graph) {
          return;
        }
        if (jobAttempts(model.graph.jobs, job).length > 1) {
          dispatch({ type: "openAttempts" });
          return;
        }
        navigatingRef.current = { kind: "logs", jobId: job.numericId };
        dispatch({ type: "openLogs" });
      }
    }
    if (model.screen === "logs" && key.name === "y") {
      if (copyPlainText(model.logBuffer, writeClipboard)) {
        announceCopy();
      }
    }
    if (
      model.screen === "logs" &&
      model.graph &&
      isRetryKey(key) &&
      navigatingRef.current === null &&
      retryRef.current === null
    ) {
      const traced = tracedJob(model);
      // The traced attempt is the only job this key may restart; falling back
      // to whatever the stale graph still focuses would retry the attempt that
      // was just replaced.
      if (traced && traced.numericId === model.logJobId) {
        const iid = model.graph.iid;
        startRetry(traced, ({ jobId }) => {
          dispatch({ type: "retrySucceeded", jobId });
          if (jobId) {
            // Learn the new attempt's status, so the next press is gated on it
            // rather than on the attempt it replaced.
            refreshGraphAfterRetry(iid);
          }
        });
      } else {
        dispatch({
          type: "retryFailed",
          message: "the traced attempt is not in the current job list",
        });
      }
    }
    if (model.screen === "attempts" && model.graph) {
      const card = focusedJob(model);
      const attempts = card ? jobAttempts(model.graph.jobs, card) : [];
      if (key.name === "up") {
        const index = attempts.findIndex((job) => job.id === focusedAttempt(model)?.id);
        const next = attempts[index - 1];
        if (next) {
          dispatch({ type: "focusAttempt", id: next.id });
        }
      }
      if (key.name === "down") {
        const index = attempts.findIndex((job) => job.id === focusedAttempt(model)?.id);
        const next = attempts[index + 1];
        if (next) {
          dispatch({ type: "focusAttempt", id: next.id });
        }
      }
      if (key.name === "return") {
        if (navigatingRef.current !== null) {
          return;
        }
        const job = focusedAttempt(model);
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
      <ScreenPanel title="startup" keyHelp="q quit">
        <text>Checking glab…</text>
      </ScreenPanel>
    );
  }

  if (model.error) {
    return (
      <ScreenPanel title="error" keyHelp={model.errorFatal ? "q quit" : "esc back  q quit"}>
        <text fg="#ef4444">{model.error}</text>
      </ScreenPanel>
    );
  }

  if (model.screen === "logs") {
    const job = tracedJob(model);
    return (
      <ScreenPanel
        title={`log ${job?.name ?? "job"}`}
        keyHelp={`${model.logDone ? "ended" : "live"} · ctrl+r retry · y yank · esc back`}
        status={
          model.retry ? (
            <RefreshStatus label="retrying…" />
          ) : copiedNotice ? (
            <CopiedNotice />
          ) : undefined
        }
      >
        {model.retryMessage ? <text fg="#eab308">{model.retryMessage}</text> : null}
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

  if (model.screen === "attempts") {
    const card = focusedJob(model);
    const attempts =
      card && model.graph ? jobAttempts(model.graph.jobs, card) : [];
    return (
      <ScreenPanel
        title={`attempts ${card?.name ?? "job"}`}
        keyHelp="enter log  esc graph  q quit"
        status={refreshing === "graph" ? <RefreshStatus label="refreshing…" /> : undefined}
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
        <scrollbox focused flexGrow={1}>
          {attempts.map((job, index) => (
            <text key={job.id} fg={BUCKET_COLOR[job.bucket]}>
              {index === model.focusedAttemptIndex ? ">" : " "} {statusIcon(job.status)} #{job.numericId}  {job.status}
            </text>
          ))}
        </scrollbox>
      </ScreenPanel>
    );
  }

  if (model.screen === "graph") {
    return (
      <ScreenPanel
        title={`pipeline ${model.graph?.iid ?? ""}`}
        keyHelp="arrows move  enter log  r refresh  ctrl+r retry  esc list  q quit"
        status={
          model.retry ? (
            <RefreshStatus label="retrying…" />
          ) : refreshing === "graph" ? (
            <RefreshStatus label="refreshing…" />
          ) : undefined
        }
        loadingLabel={
          model.navigating?.kind === "logs"
            ? "Loading log…"
            : model.manualRefresh === "graph"
              ? "Refreshing…"
              : undefined
        }
      >
        {model.retryMessage ? <text fg="#eab308">{model.retryMessage}</text> : null}
        {model.refreshWarning ? (
          <text fg="#eab308">refresh error: {model.refreshWarning} — retrying</text>
        ) : null}
        {model.graph?.truncated ? <text fg="#eab308">job list truncated at 100</text> : null}
        <scrollbox ref={graphScrollRef} flexGrow={1}>
          {stageGraph ? (
            <GraphBody
              columns={stageGraph.columns}
              edges={stageGraph.edges}
              focusedId={focusedId}
            />
          ) : null}
        </scrollbox>
      </ScreenPanel>
    );
  }

  return (
    <ScreenPanel
      title="pipelines"
      keyHelp="enter graph  r refresh  q quit"
      status={refreshing === "list" ? <RefreshStatus label="refreshing…" /> : undefined}
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
