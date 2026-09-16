import type { PipelineRow } from "./glab/list.ts";
import { isRetryableJob } from "./glab/retry.ts";
import { jobAttempts, latestJobs, type JobNode, type PipelineGraph } from "./glab/graph.ts";
import { buildStageColumns } from "./layout/stage-graph.ts";
import { isActivePipelineStatus } from "./status.ts";
import { appendLogTrace, emptyLogTrace, logVisibleText, type LogTrace } from "./log-text.ts";

export type Screen = "list" | "graph" | "attempts" | "logs";

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
  /** One restart in flight, and the screen it was started from. */
  retry: { jobId: string; screen: Screen } | null;
  /** Non-fatal retry notice: a local refusal or a GitLab rejection. */
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
  | { type: "refreshError"; message: string }
  | { type: "manualRefresh"; target: "list" | "graph" }
  | { type: "startRetry"; job: JobNode }
  | { type: "retrySucceeded"; jobId: string | null }
  | { type: "retryFailed"; message: string }
  | { type: "focusJob"; id: string }
  | { type: "openAttempts" }
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

function retryRefusalMessage(job: Pick<JobNode, "isBridge">): string {
  return job.isBridge
    ? "this job cannot be retried here"
    : "only failed or canceled jobs can be retried";
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

/** The restart happened but named no attempt, so the graph takes over. */
function unfollowedRetriedAttempt(model: AppModel): AppModel {
  const previous = tracedJob(model);
  const matched = model.graph ? visibleMatchIndex(model.graph, previous?.id, previous) : -1;
  return {
    ...model,
    retry: null,
    retryMessage: NEW_ATTEMPT_UNFOLLOWED,
    screen: "graph",
    logJobId: null,
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
      };
    case "pipelines":
      return {
        ...model,
        booted: true,
        refreshWarning: null,
        manualRefresh: null,
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
        return {
          ...model,
          graph: action.graph,
          focusedJobIndex: matched !== -1 ? matched : model.focusedJobIndex,
          refreshWarning: null,
          manualRefresh: null,
          retryMessage: null,
        };
      }
      const focusedJobIndex = visibleFocusIndex(action.graph, current?.id, current);
      const nextCard = action.graph.jobs[focusedJobIndex];
      const currentAttempt = focusedAttempt(model);
      return {
        ...model,
        graph: action.graph,
        focusedJobIndex,
        focusedAttemptIndex: attemptFocusIndex(action.graph, nextCard, currentAttempt?.id),
        refreshWarning: null,
        manualRefresh: null,
        retryMessage: null,
      };
    }
    case "refreshError":
      return { ...model, refreshWarning: action.message, manualRefresh: null };
    case "manualRefresh":
      return { ...model, manualRefresh: action.target };
    case "startRetry": {
      if (model.retry) {
        return model;
      }
      if (!isRetryableJob(action.job)) {
        return { ...model, retryMessage: retryRefusalMessage(action.job) };
      }
      return {
        ...model,
        retry: { jobId: action.job.numericId, screen: model.screen },
        retryMessage: null,
      };
    }
    case "retrySucceeded": {
      if (model.retry?.screen === "logs" && model.screen === "logs") {
        return action.jobId
          ? followRetriedAttempt(model, action.jobId)
          : unfollowedRetriedAttempt(model);
      }
      return { ...model, retry: null };
    }
    case "retryFailed":
      return { ...model, retry: null, retryMessage: action.message };
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
        };
      }
      if (model.screen === "attempts") {
        return {
          ...model,
          screen: "graph",
          manualRefresh: null,
          retryMessage: null,
        };
      }
      if (model.screen === "graph") {
        return {
          ...model,
          screen: "list",
          refreshWarning: null,
          manualRefresh: null,
          retryMessage: null,
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
