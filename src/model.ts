import type { PipelineRow } from "./glab/list.ts";
import { isRetryableJob } from "./glab/retry.ts";
import { isPlayableJob } from "./glab/play.ts";
import { jobAttempts, latestJobs, type JobNode, type PipelineGraph } from "./glab/graph.ts";
import { buildStageColumns } from "./layout/stage-graph.ts";
import { isActivePipelineStatus } from "./status.ts";
import { appendLogTrace, emptyLogTrace, logVisibleText, type LogTrace } from "./log-text.ts";

export type Screen = "list" | "graph" | "attempts" | "logs";

/** The two job actions the retry key can take on a focused job. */
export type JobActionKind = "retry" | "play";

export type Navigating =
  | { kind: "graph"; pipelineIid: string }
  | { kind: "logs"; jobId: string };

export type AppModel = {
  screen: Screen;
  error: string | null;
  errorFatal: boolean;
  /** Non-fatal background-refresh failure message; data stays visible. */
  refreshWarning: string | null;
  /** One-shot manual refresh in flight, per screen. */
  manualRefresh: "list" | "graph" | null;
  /** The one job action in flight, the screen it was started from, and its kind. */
  retry: { jobId: string; screen: Screen; kind: JobActionKind } | null;
  /**
   * The job action waiting for the operator's confirmation. The job's name is
   * stored so the prompt can still name it after a refresh drops it from the
   * graph, and `waiting` marks a confirmation held back until a refresh the
   * operator asked for has answered.
   */
  confirm: {
    kind: JobActionKind;
    jobId: string;
    name: string;
    waiting?: boolean;
    /**
     * The graph the prompt was confirmed against. The wait ends when a newer
     * answer replaces it, so a refresh of something else — or a failed one,
     * which leaves the same graph in place — can never release it.
     */
    graphAtWait?: PipelineGraph;
  } | null;
  /**
   * Non-fatal retry notice: a local refusal, a GitLab rejection, or the reason
   * a log screen gave up. Kept until the next navigation or retry, so a
   * background refresh cannot wipe the reason before it is read.
   */
  retryMessage: string | null;
  booted: boolean;
  pipelines: PipelineRow[];
  selectedIndex: number;
  graph: PipelineGraph | null;
  focusedJobIndex: number;
  focusedAttemptIndex: number;
  logJobId: string | null;
  logBackScreen: "graph" | "attempts";
  logBuffer: string;
  logTrace: LogTrace;
  logDone: boolean;
  navigating: Navigating | null;
};

export const emptyModel: AppModel = {
  screen: "list",
  error: null,
  errorFatal: false,
  refreshWarning: null,
  manualRefresh: null,
  retry: null,
  confirm: null,
  retryMessage: null,
  booted: false,
  pipelines: [],
  selectedIndex: 0,
  graph: null,
  focusedJobIndex: 0,
  focusedAttemptIndex: 0,
  logJobId: null,
  logBackScreen: "graph",
  logBuffer: "",
  logTrace: emptyLogTrace(),
  logDone: false,
  navigating: null,
};

export type Action =
  | { type: "error"; message: string; fatal?: boolean }
  | { type: "pipelines"; pipelines: PipelineRow[] }
  | { type: "moveList"; delta: number }
  | { type: "startNavigating"; target: NonNullable<AppModel["navigating"]> }
  | { type: "openGraph"; graph: PipelineGraph }
  | { type: "refreshGraph"; graph: PipelineGraph }
  | { type: "refreshError"; message: string; target: "list" | "graph" }
  | { type: "manualRefresh"; target: "list" | "graph" }
  | { type: "requestJobAction"; job: JobNode }
  | { type: "cancelJobAction" }
  | { type: "confirmJobAction" }
  | { type: "retrySucceeded"; jobId: string | null }
  | { type: "retryFailed"; message: string }
  | { type: "logUnavailable"; message: string }
  | { type: "openFailed"; message: string }
  | { type: "focusJob"; id: string }
  | { type: "openAttempts" }
  | { type: "openAttemptsForBrowser" }
  | { type: "focusAttempt"; id: string }
  | { type: "openLogs" }
  | { type: "logsReady" }
  | { type: "logChunk"; chunk: string }
  | { type: "logDone" }
  | { type: "back" };

export function selectedPipeline(model: AppModel): PipelineRow | undefined {
  return model.pipelines[model.selectedIndex];
}

export function focusedJob(model: AppModel): JobNode | undefined {
  return model.graph?.jobs[model.focusedJobIndex];
}

export function focusedAttempt(model: AppModel): JobNode | undefined {
  const card = focusedJob(model);
  if (!card || !model.graph) {
    return undefined;
  }
  const attempts = jobAttempts(model.graph.jobs, card);
  return attempts[clamp(model.focusedAttemptIndex, attempts.length)];
}

export function tracedJob(model: AppModel): JobNode | undefined {
  if (!model.logJobId || !model.graph) {
    return focusedJob(model);
  }
  return (
    model.graph.jobs.find((job) => job.numericId === model.logJobId) ??
    focusedJob(model)
  );
}

function clamp(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Index in `graph.jobs` of the visible (latest-attempt) card matching `id`,
 * falling back to the previous job's name+stage when a retry replaced its id.
 * -1 when neither matches.
 */
function visibleMatchIndex(
  graph: PipelineGraph,
  id: string | undefined,
  previous?: JobNode,
): number {
  const visible = latestJobs(graph.jobs);
  const match =
    visible.find((job) => job.id === id) ??
    (previous
      ? visible.find((job) => job.name === previous.name && job.stage === previous.stage)
      : undefined);
  return match ? graph.jobs.findIndex((job) => job.id === match.id) : -1;
}

function visibleFocusIndex(
  graph: PipelineGraph,
  id: string | undefined,
  previous?: JobNode,
): number {
  const matched = visibleMatchIndex(graph, id, previous);
  if (matched !== -1) {
    return matched;
  }
  const visible = latestJobs(graph.jobs);
  const columns = buildStageColumns(visible, graph.stageNames);
  const preferred = columns[0]?.jobs[0];
  if (!preferred) {
    return 0;
  }
  const index = graph.jobs.findIndex((job) => job.id === preferred.id);
  return index === -1 ? 0 : index;
}

function attemptFocusIndex(graph: PipelineGraph, card: JobNode | undefined, id: string | undefined): number {
  if (!card) {
    return 0;
  }
  const attempts = jobAttempts(graph.jobs, card);
  const index = attempts.findIndex((job) => job.id === id);
  return index === -1 ? 0 : index;
}

const NEW_ATTEMPT_UNFOLLOWED = "retried, but the new attempt could not be followed";
const JOB_GONE_MESSAGE = "that job is no longer in this pipeline";
const JOB_CHANGED_MESSAGE = "that job's status changed while the prompt was open";
/**
 * The open key cannot tell which attempt of a retried job was meant, so it
 * asks for a pick through the attempts screen instead of opening anything.
 */
const ATTEMPTS_PICK_NOTICE =
  "this job has several attempts — pick one and press o again to open it";

/**
 * Which job actions each screen offers. Retry is checked first, so a job that
 * could be both is retried; only the graph runs a waiting manual job.
 */
const SCREEN_ACTIONS: Record<Screen, readonly JobActionKind[]> = {
  list: [],
  graph: ["retry", "play"],
  attempts: ["retry"],
  logs: ["retry"],
};

function offersRun(screen: Screen): boolean {
  return SCREEN_ACTIONS[screen].includes("play");
}

/** The action this key would take on `job` from `screen`, or null when it has none. */
export function jobActionKind(
  job: Pick<JobNode, "status" | "isBridge">,
  screen: Screen,
): JobActionKind | null {
  const allowed = SCREEN_ACTIONS[screen];
  if (allowed.includes("retry") && isRetryableJob(job)) {
    return "retry";
  }
  if (allowed.includes("play") && isPlayableJob(job)) {
    return "play";
  }
  return null;
}

function graphJobById(model: AppModel, id: string): JobNode | undefined {
  return model.graph?.jobs.find((job) => job.numericId === id);
}

/**
 * The job the open confirmation would act on, re-checked against the current
 * graph: a job that left the pipeline, a job whose status now calls for the
 * other action, and a job the confirmed action no longer applies to must all
 * stay unstarted.
 */
export function pendingJobAction(
  model: AppModel,
): { job: JobNode; kind: JobActionKind } | null {
  const pending = model.confirm;
  if (!pending) {
    return null;
  }
  const job = graphJobById(model, pending.jobId);
  if (!job) {
    return null;
  }
  const kind = jobActionKind(job, model.screen);
  return kind === pending.kind ? { job, kind } : null;
}

/**
 * A confirmation held back for a graph refresh settles once a newer graph
 * answer has replaced the one it was confirmed against. Failures leave the same
 * graph in place, and an answer to another screen's refresh never touches it, so
 * neither can release the hold against state the wait was meant to replace.
 */
function settleHeldConfirmation(model: AppModel): AppModel {
  const held = model.confirm;
  if (!held?.waiting || model.graph === held.graphAtWait) {
    return model;
  }
  return settleConfirmation(model);
}

/**
 * Apply the open confirmation against the graph as it stands now: either the
 * action is recorded in flight, or the prompt is replaced by the reason it
 * cannot be honoured.
 */
function settleConfirmation(model: AppModel): AppModel {
  const resolved = pendingJobAction(model);
  if (!resolved) {
    return { ...model, confirm: null, retryMessage: confirmRefusalMessage(model) };
  }
  return {
    ...model,
    confirm: null,
    retry: {
      jobId: resolved.job.numericId,
      screen: model.screen,
      kind: resolved.kind,
    },
    retryMessage: null,
  };
}

/**
 * Why the open prompt can no longer be honoured. The prompt only ever opened for
 * a job that qualified, so a job that is still in the graph but no longer
 * matches the confirmed action changed underneath it.
 */
function confirmRefusalMessage(model: AppModel): string {
  const pending = model.confirm;
  return pending && graphJobById(model, pending.jobId)
    ? JOB_CHANGED_MESSAGE
    : JOB_GONE_MESSAGE;
}

function jobActionRefusalMessage(job: Pick<JobNode, "isBridge">, screen: Screen): string {
  if (job.isBridge) {
    return "this job cannot be restarted here";
  }
  return offersRun(screen)
    ? "only failed or canceled jobs can be retried, and only waiting manual jobs can be run"
    : "only failed or canceled jobs can be retried";
}

/**
 * The log screen cannot carry on for the job it was tracing (no traceable
 * attempt, or no process to trace with), so the graph takes over with the
 * reason as a non-fatal message.
 */
function leaveLogScreen(model: AppModel, message: string): AppModel {
  const previous = tracedJob(model);
  const matched = model.graph ? visibleMatchIndex(model.graph, previous?.id, previous) : -1;
  return {
    ...model,
    retry: null,
    confirm: null,
    retryMessage: message,
    screen: "graph",
    logJobId: null,
    focusedJobIndex: matched === -1 ? model.focusedJobIndex : matched,
  };
}

/** Point the log at the new attempt; the trace effect respawns for that id. */
function followRetriedAttempt(model: AppModel, jobId: string): AppModel {
  const previous = tracedJob(model);
  const matched = model.graph ? visibleMatchIndex(model.graph, jobId, previous) : -1;
  return {
    ...model,
    retry: null,
    retryMessage: null,
    logJobId: jobId,
    logBuffer: "",
    logTrace: emptyLogTrace(),
    logDone: false,
    focusedJobIndex: matched === -1 ? model.focusedJobIndex : matched,
  };
}

/**
 * Keep the selection on the same pipeline across refreshed rows: first by
 * stable pipeline id, falling back to the nearest valid row when the selected
 * pipeline no longer exists.
 */
function reconcileSelectedIndex(model: AppModel, rows: PipelineRow[]): number {
  if (rows.length === 0) {
    return 0;
  }
  const previous = model.pipelines[model.selectedIndex];
  const byId = previous ? rows.findIndex((row) => row.id === previous.id) : -1;
  if (byId !== -1) {
    return byId;
  }
  return clamp(model.selectedIndex, rows.length);
}

export function reduce(model: AppModel, action: Action): AppModel {
  switch (action.type) {
    case "error":
      return {
        ...model,
        error: action.message,
        errorFatal: action.fatal ?? false,
        manualRefresh: null,
        booted: true,
        navigating: null,
        // The error screen draws no prompt, so none may be left waiting.
        confirm: null,
      };
    case "pipelines":
      return {
        ...model,
        booted: true,
        refreshWarning: null,
        // A list answer ends only the list's refresh: the graph's own refresh
        // must stay marked so a confirmation still waits for it.
        manualRefresh: model.manualRefresh === "list" ? null : model.manualRefresh,
        pipelines: action.pipelines,
        selectedIndex: reconcileSelectedIndex(model, action.pipelines),
      };
    case "moveList":
      return {
        ...model,
        retryMessage: null,
        selectedIndex: clamp(
          model.selectedIndex + action.delta,
          model.pipelines.length,
        ),
      };
    case "startNavigating":
      return { ...model, navigating: action.target };
    case "openGraph":
      return {
        ...model,
        screen: "graph",
        graph: action.graph,
        focusedJobIndex: visibleFocusIndex(action.graph, undefined),
        focusedAttemptIndex: 0,
        error: null,
        errorFatal: false,
        refreshWarning: null,
        manualRefresh: null,
        confirm: null,
        retryMessage: null,
        navigating: null,
      };
    case "refreshGraph": {
      const current = focusedJob(model);
      // Logs keep tracing a job that may have dropped off the refreshed
      // graph; focus still follows the same job to its new attempt, but never
      // clamps onto a different card.
      if (model.screen === "logs") {
        const matched = visibleMatchIndex(action.graph, current?.id, current);
        return settleHeldConfirmation({
          ...model,
          graph: action.graph,
          focusedJobIndex: matched !== -1 ? matched : model.focusedJobIndex,
          refreshWarning: null,
          manualRefresh: model.manualRefresh === "graph" ? null : model.manualRefresh,
        });
      }
      const focusedJobIndex = visibleFocusIndex(action.graph, current?.id, current);
      const nextCard = action.graph.jobs[focusedJobIndex];
      const currentAttempt = focusedAttempt(model);
      // A restart replaces the job's latest attempt, so when that was the
      // focused row there is no id left to hold on to: the newest row is the
      // attempt that replaced it.
      const keepAttemptId =
        currentAttempt && currentAttempt.id === current?.id ? undefined : currentAttempt?.id;
      return settleHeldConfirmation({
        ...model,
        graph: action.graph,
        focusedJobIndex,
        focusedAttemptIndex: attemptFocusIndex(action.graph, nextCard, keepAttemptId),
        refreshWarning: null,
        manualRefresh: model.manualRefresh === "graph" ? null : model.manualRefresh,
      });
    }
    case "refreshError":
      // A failure leaves the graph in place, so a held confirmation keeps
      // waiting for a newer answer: the graph and the attempts list keep
      // polling, so it ends there, and on the log screen, which does not poll,
      // cancelling or leaving the screen ends it. Only the failing refresh's own
      // marker clears.
      return settleHeldConfirmation({
        ...model,
        refreshWarning: action.message,
        manualRefresh: model.manualRefresh === action.target ? null : model.manualRefresh,
      });
    case "manualRefresh":
      return { ...model, manualRefresh: action.target };
    case "requestJobAction": {
      // One job action at a time, and one prompt at a time. A refresh in flight
      // does not block the prompt: it is drawn opaquely above that overlay.
      if (model.retry || model.confirm) {
        return model;
      }
      const kind = jobActionKind(action.job, model.screen);
      if (!kind) {
        return {
          ...model,
          retryMessage: jobActionRefusalMessage(action.job, model.screen),
        };
      }
      return {
        ...model,
        confirm: { kind, jobId: action.job.numericId, name: action.job.name },
        retryMessage: null,
      };
    }
    case "cancelJobAction":
      return model.confirm ? { ...model, confirm: null } : model;
    case "confirmJobAction": {
      if (!model.confirm || model.confirm.waiting) {
        return model;
      }
      // A graph refresh the operator asked for is a newer answer than the graph
      // this prompt was opened against, so hold the confirmation until an answer
      // lands: the re-check must see it rather than the state it replaces.
      if (model.manualRefresh === "graph") {
        return {
          ...model,
          confirm: {
            ...model.confirm,
            waiting: true,
            graphAtWait: model.graph ?? undefined,
          },
        };
      }
      return settleConfirmation(model);
    }
    case "retrySucceeded": {
      // Only the log this restart was started from may be re-attached: the
      // operator can navigate to another job's log while it is in flight.
      if (
        model.retry?.screen === "logs" &&
        model.screen === "logs" &&
        model.logJobId === model.retry.jobId
      ) {
        return action.jobId
          ? followRetriedAttempt(model, action.jobId)
          : leaveLogScreen(model, NEW_ATTEMPT_UNFOLLOWED);
      }
      return { ...model, retry: null };
    }
    case "retryFailed":
      return { ...model, retry: null, confirm: null, retryMessage: action.message };
    case "logUnavailable":
      return leaveLogScreen(model, action.message);
    case "openFailed":
      // Opening mutates nothing, so a failure is only ever the non-fatal notice
      // in the content area of whichever screen asked for it.
      return { ...model, retryMessage: action.message };
    case "focusJob": {
      const index = model.graph?.jobs.findIndex((job) => job.id === action.id) ?? -1;
      if (index < 0) {
        return model;
      }
      return { ...model, focusedJobIndex: index, retryMessage: null };
    }
    case "openAttempts": {
      const job = focusedJob(model);
      if (!job || !model.graph || jobAttempts(model.graph.jobs, job).length < 2) {
        return model;
      }
      return { ...model, screen: "attempts", focusedAttemptIndex: 0, retryMessage: null };
    }
    case "openAttemptsForBrowser": {
      const job = focusedJob(model);
      if (!job || !model.graph || jobAttempts(model.graph.jobs, job).length < 2) {
        return model;
      }
      return {
        ...model,
        screen: "attempts",
        focusedAttemptIndex: 0,
        retryMessage: ATTEMPTS_PICK_NOTICE,
      };
    }
    case "focusAttempt": {
      const card = focusedJob(model);
      if (!card || !model.graph) {
        return model;
      }
      const index = jobAttempts(model.graph.jobs, card).findIndex((job) => job.id === action.id);
      if (index < 0) {
        return model;
      }
      return { ...model, focusedAttemptIndex: index, retryMessage: null };
    }
    case "openLogs": {
      const job = model.screen === "attempts" ? focusedAttempt(model) : focusedJob(model);
      if (!job) {
        return model;
      }
      return {
        ...model,
        navigating: { kind: "logs", jobId: job.numericId },
        logBackScreen: model.screen === "attempts" ? "attempts" : "graph",
        retryMessage: null,
      };
    }
    case "logsReady": {
      if (model.navigating?.kind !== "logs") {
        return model;
      }
      return {
        ...model,
        screen: "logs",
        logJobId: model.navigating.jobId,
        logBuffer: "",
        logTrace: emptyLogTrace(),
        logDone: false,
        navigating: null,
        retryMessage: null,
      };
    }
    case "logChunk": {
      const logTrace = appendLogTrace(model.logTrace, action.chunk);
      return { ...model, logTrace, logBuffer: logVisibleText(logTrace) };
    }
    case "logDone":
      return { ...model, logDone: true };
    case "back":
      if (model.error && !model.errorFatal) {
        return { ...model, error: null, manualRefresh: null };
      }
      if (model.navigating?.kind === "logs") {
        return { ...model, navigating: null, manualRefresh: null };
      }
      if (model.screen === "logs") {
        return {
          ...model,
          screen: model.logBackScreen,
          logJobId: null,
          logBuffer: model.logBuffer,
          logTrace: model.logTrace,
          logDone: model.logDone,
          manualRefresh: null,
          retryMessage: null,
          confirm: null,
        };
      }
      if (model.screen === "attempts") {
        return {
          ...model,
          screen: "graph",
          manualRefresh: null,
          retryMessage: null,
          confirm: null,
        };
      }
      if (model.screen === "graph") {
        return {
          ...model,
          screen: "list",
          refreshWarning: null,
          manualRefresh: null,
          retryMessage: null,
          confirm: null,
        };
      }
      return model;
    default:
      return model;
  }
}

export function shouldPollGraph(model: AppModel): boolean {
  return (model.screen === "graph" || model.screen === "attempts") && model.graph !== null;
}

export function shouldPollList(model: AppModel): boolean {
  return model.screen === "list" && model.pipelines.length > 0;
}
