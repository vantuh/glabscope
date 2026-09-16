import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/react";
import {
  emptyModel,
  focusedAttempt,
  focusedJob,
  jobActionKind,
  reduce,
  selectedPipeline,
  shouldPollGraph,
  shouldPollList,
  tracedJob,
  type AppModel,
  type JobActionKind,
  type Screen,
} from "./model.ts";
import { IDLE_POLL_MS, NORMAL_POLL_MS, nextPollDelay } from "./polling.ts";
import { isQuitKey, isRetryKey } from "./keys.ts";
import { probeGlab } from "./glab/probe.ts";
import { listPipelines } from "./glab/list.ts";
import { fetchPipelineGraph, jobAttempts, NeedsUnavailableError, type JobNode } from "./glab/graph.ts";
import { RateLimitedError } from "./glab/ratelimit.ts";
import { spawnTrace } from "./glab/trace.ts";
import { retryJob } from "./glab/retry.ts";
import { playJob } from "./glab/play.ts";
import { clipboardWriter, copyPlainText } from "./clipboard.ts";
import { BUCKET_COLOR, isActivePipelineStatus, statusIcon } from "./status.ts";
import { headerLine, listCells, listColumns, pipelineCells } from "./list-layout.ts";
import type { PipelineRow as PipelineRowType } from "./glab/list.ts";
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
/** Id and started cells: muted, but brighter than the frame, and no bucket color. */
const MUTED_TEXT = "#6b7280";
/**
 * ScreenPanel's padding (1) plus border (1) on each side of the column content,
 * plus the column the rows' scrollbar draws over at the right edge once the
 * list overflows.
 */
const PANEL_CHROME_WIDTH = 5;
/** How long the `copied to clipboard` footer notice stays up. */
export const COPIED_NOTICE_MS = 1500;

export function ScreenPanel({
  title,
  keyHelp,
  status,
  loadingLabel,
  prompt,
  children,
}: {
  title: string;
  keyHelp: string;
  status?: ReactNode;
  loadingLabel?: string;
  /** The question of an open confirmation, over the panel's own content. */
  prompt?: string;
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
          {prompt ? <ConfirmPrompt question={prompt} /> : null}
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

/**
 * A body notice line. Two bare `<text>` siblings in one column paint into the
 * same row, so the later one lands on top of the earlier and can hide it; each
 * notice claims its own fixed-height line instead.
 */
function NoticeLine({ children }: { children: ReactNode }) {
  return (
    <box height={1} flexShrink={0}>
      <text fg="#eab308">{children}</text>
    </box>
  );
}

/**
 * The wording of the in-flight status area, per job action, and the prefix a
 * failed action reports with.
 */
const ACTION_LABEL: Record<JobActionKind, string> = {
  retry: "retrying…",
  play: "running…",
};

function jobActionFailureMessage(kind: JobActionKind, error: unknown): string {
  const action = kind === "play" ? "run" : "retry";
  return `${action} failed: ${error instanceof Error ? error.message : String(error)}`;
}

/** `retry job lint?` / `run job lint?`: what the operator is about to do. */
function confirmQuestion(model: AppModel): string {
  const action = model.confirm?.kind === "play" ? "run" : "retry";
  return `${action} job ${model.confirm?.name}?`;
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

export function PipelineRow({
  cells,
  columns,
  bucket,
  focused,
}: {
  cells: ReturnType<typeof pipelineCells>;
  columns: ReturnType<typeof listColumns>;
  bucket: PipelineRowType["bucket"];
  focused: boolean;
}) {
  // Only the status cell carries the bucket color; the rest of the row is muted
  // chrome, brightening as a whole when the row is the selected one.
  const dataColor = focused ? FOCUS_BORDER : MUTED_TEXT;
  return (
    <text>
      <span fg={dataColor}>{focused ? "> " : "  "}</span>
      {listCells(cells, columns).map((cell) => (
        <span key={cell.role} fg={cell.role === "status" ? BUCKET_COLOR[bucket] : dataColor}>
          {cell.text}
        </span>
      ))}
    </text>
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

/**
 * A job action is confirmed before anything reaches GitLab. The prompt sits in
 * the framed content area, over the screen that asked, in chrome colors only so
 * the status-bucket colors keep their meaning, and above the log-loading
 * overlay so it can never be covered while it owns the keyboard.
 */
function ConfirmPrompt({ question }: { question: string }) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={200}
      backgroundColor="#111827cc"
      alignItems="center"
      justifyContent="center"
    >
      <box
        border
        borderStyle="rounded"
        borderColor={CHROME_COLOR}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={HELP_COLOR} selectable={false}>
          {question}
        </text>
        <text fg={CHROME_COLOR} selectable={false}>
          enter confirm  esc cancel
        </text>
      </box>
    </box>
  );
}

export function App() {
  const renderer = useRenderer();
  const { width: terminalWidth } = useTerminalDimensions();
  const [model, dispatch] = useReducer(reduce, emptyModel);
  const [refreshing, setRefreshing] = useState<"list" | "graph" | null>(null);
  const logProc = useRef<ReturnType<typeof Bun.spawn> | null>(null);
  const graphScrollRef = useRef<ScrollBoxRenderable>(null);
  const navigatingRef = useRef(model.navigating);
  navigatingRef.current = model.navigating;
  /**
   * The graph loop's pending timer, so a refresh from outside the loop (a run
   * or a retry) can pull a slowed watch interval back to the normal one
   * without restarting the loop or fetching a second time.
   */
  const graphWatchRef = useRef<{ isSlow: () => boolean; wake: () => void } | null>(null);
  /**
   * A prompt this frame's keys asked for, before the reducer's answer has
   * rendered. Without it, two keys in one frame both read a model with no
   * prompt and the second one acts on the screen behind it.
   */
  const promptAskedRef = useRef(false);
  // Cleared by every render, so the latch only ever covers the frame that set
  // it (the same shape as the navigating mirror above).
  promptAskedRef.current = false;
  /** The pipeline on screen now, read when a job action settles. */
  const graphIidRef = useRef(model.graph?.iid);
  graphIidRef.current = model.graph?.iid;
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

  /** Whether the committed graph is on a running or pending pipeline. */
  const graphActive = isActivePipelineStatus(model.graph?.status ?? "");
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
        const graph = await fetchGraphNow(String(iid), () => stopped);
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
    graphWatchRef.current = {
      isSlow: () => delay > NORMAL_POLL_MS,
      wake: () => {
        if (stopped) {
          return;
        }
        if (timer) {
          clearTimeout(timer);
        }
        delay = NORMAL_POLL_MS;
        timer = setTimeout(() => void tick(), delay);
      },
    };
    if (isActivePipelineStatus(graph.status)) {
      void tick();
    } else {
      timer = setTimeout(() => void tick(), delay);
    }
    return () => {
      stopped = true;
      graphWatchRef.current = null;
      if (timer) {
        clearTimeout(timer);
      }
      setRefreshing(null);
    };
  }, [model.screen, model.graph?.iid]);

  /**
   * A refresh that lands outside the loop can find an active pipeline while the
   * loop still waits out a watch interval: a run on a terminal pipeline, for
   * example. The wait must not outlive that discovery.
   */
  useEffect(() => {
    const watch = graphWatchRef.current;
    if (graphActive && watch?.isSlow()) {
      watch.wake();
    }
  }, [graphActive]);

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
   * result may land: a poll that started before a restart, or before another
   * pipeline was opened, must not put its graph back. `isObsolete` lets a
   * canceled polling loop drop its own result before it dispatches.
   */
  const graphRequestRef = useRef(0);
  const fetchGraphNow = (iid: string, isObsolete?: () => boolean) => {
    const request = (graphRequestRef.current += 1);
    return fetchPipelineGraph(iid).then((graph) => {
      if (request === graphRequestRef.current && !isObsolete?.()) {
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

  /**
   * Settle a finished action. A log screen that cannot follow the new attempt
   * returns to the graph itself, so only an action that produced an attempt
   * needs the extra fetch.
   */
  const settleJobAction =
    (screen: Screen) =>
    ({ jobId }: { jobId: string | null }) => {
      dispatch({ type: "retrySucceeded", jobId });
      const iid = model.graph?.iid;
      // Only the pipeline this action belongs to may be refreshed: the operator
      // can leave for another one while the action is unanswered, and that
      // screen's graph must not be replaced by a late answer.
      if (iid && graphIidRef.current === iid && (screen !== "logs" || jobId)) {
        refreshGraphAfterRetry(iid);
      }
    };

  /**
   * Ask the reducer for a job action's prompt. The synchronous latch keeps this
   * frame's remaining keys out, and the preconditions mirror the reducer's so a
   * request that opens nothing cannot leave the latch set.
   */
  const askJobAction = (job: JobNode) => {
    if (model.retry || model.confirm || model.manualRefresh) {
      return;
    }
    if (jobActionKind(job, model.screen)) {
      promptAskedRef.current = true;
    }
    dispatch({ type: "requestJobAction", job });
  };

  /**
   * The one place a job action reaches GitLab, driven by the reducer's
   * committed in-flight action rather than by a key handler: the process and
   * the state can never disagree, a refresh that lands before the confirmation
   * is accounted for, and two confirming keys in the same frame cannot spawn
   * two commands.
   */
  const spawnedActionRef = useRef<string | null>(null);
  useEffect(() => {
    const action = model.retry;
    if (!action) {
      spawnedActionRef.current = null;
      return;
    }
    const key = `${action.kind}:${action.jobId}:${action.screen}`;
    if (spawnedActionRef.current === key) {
      return;
    }
    spawnedActionRef.current = key;
    const request = action.kind === "play" ? playJob(action.jobId) : retryJob(action.jobId);
    void request.then(settleJobAction(action.screen)).catch((error: unknown) =>
      dispatch({ type: "retryFailed", message: jobActionFailureMessage(action.kind, error) }),
    );
  }, [model.retry]);

  useKeyboard((key) => {
    if (isQuitKey(key.name)) {
      logProc.current?.kill();
      renderer.destroy();
      process.exit(0);
    }
    // An open confirmation owns the keyboard: nothing behind it may move, and
    // escape answers the prompt instead of going back a screen. Whether the
    // confirmation still holds is the reducer's call. A prompt asked for in
    // this very frame counts as open, so its own frame's keys cannot slip past
    // it and start a refresh, a log, a move or a back action.
    if (model.confirm || promptAskedRef.current) {
      if (model.confirm) {
        if (key.name === "return") {
          dispatch({ type: "confirmJobAction" });
        } else if (key.name === "escape") {
          dispatch({ type: "cancelJobAction" });
        }
      }
      return;
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
        // Any fetch still in flight belongs to the pipeline being left.
        graphRequestRef.current += 1;
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
      if (isRetryKey(key) && navigatingRef.current === null) {
        const job = focusedJob(model);
        if (job) {
          askJobAction(job);
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
      navigatingRef.current === null
    ) {
      const traced = tracedJob(model);
      // The traced attempt is the only job this key may restart; falling back
      // to whatever the stale graph still focuses would retry the attempt that
      // was just replaced.
      if (traced && traced.numericId === model.logJobId) {
        askJobAction(traced);
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
      if (isRetryKey(key) && navigatingRef.current === null) {
        const attempt = focusedAttempt(model);
        if (attempt) {
          askJobAction(attempt);
        }
      }
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
        prompt={model.confirm ? confirmQuestion(model) : undefined}
        status={
          model.retry ? (
            <RefreshStatus label={ACTION_LABEL[model.retry.kind]} />
          ) : copiedNotice ? (
            <CopiedNotice />
          ) : undefined
        }
      >
        {model.retryMessage ? <NoticeLine>{model.retryMessage}</NoticeLine> : null}
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
        keyHelp="enter log  ctrl+r retry  esc graph  q quit"
        prompt={model.confirm ? confirmQuestion(model) : undefined}
        status={
          model.retry ? (
            <RefreshStatus label={ACTION_LABEL[model.retry.kind]} />
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
        {model.retryMessage ? <NoticeLine>{model.retryMessage}</NoticeLine> : null}
        {model.refreshWarning ? (
          <NoticeLine>refresh error: {model.refreshWarning} — retrying</NoticeLine>
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
        keyHelp="arrows move  enter log  r refresh  ctrl+r retry/run  esc list  q quit"
        prompt={model.confirm ? confirmQuestion(model) : undefined}
        status={
          model.retry ? (
            <RefreshStatus label={ACTION_LABEL[model.retry.kind]} />
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
        {model.retryMessage ? <NoticeLine>{model.retryMessage}</NoticeLine> : null}
        {model.refreshWarning ? (
          <NoticeLine>refresh error: {model.refreshWarning} — retrying</NoticeLine>
        ) : null}
        {model.graph?.truncated ? (
          <NoticeLine>job list truncated at 100</NoticeLine>
        ) : null}
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

  const now = Date.now();
  const rows = model.pipelines.map((row) => pipelineCells(row, now));
  const columns = listColumns(rows, terminalWidth - PANEL_CHROME_WIDTH);

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
        <NoticeLine>refresh error: {model.refreshWarning} — retrying</NoticeLine>
      ) : null}
      {model.pipelines.length > 0 ? (
        <box height={1} flexShrink={0}>
          <text fg={CHROME_COLOR} selectable={false}>
            {headerLine(columns)}
          </text>
        </box>
      ) : null}
      <scrollbox focused flexGrow={1}>
        {model.pipelines.map((row, index) => (
          <PipelineRow
            key={row.id}
            cells={rows[index] ?? pipelineCells(row, now)}
            columns={columns}
            bucket={row.bucket}
            focused={index === model.selectedIndex}
          />
        ))}
      </scrollbox>
    </ScreenPanel>
  );
}
