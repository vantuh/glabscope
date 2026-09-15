import type { PipelineRow } from "./glab/list.ts";
import type { JobNode, PipelineGraph } from "./glab/graph.ts";
import { isActivePipelineStatus } from "./status.ts";
import { appendLogBuffer } from "./log-text.ts";

export type Screen = "list" | "graph" | "logs";

export type Navigating =
  | { kind: "graph"; pipelineIid: string }
  | { kind: "logs"; jobId: string };

export type AppModel = {
  screen: Screen;
  error: string | null;
  errorFatal: boolean;
  booted: boolean;
  pipelines: PipelineRow[];
  selectedIndex: number;
  graph: PipelineGraph | null;
  focusedJobIndex: number;
  logJobId: string | null;
  logBuffer: string;
  logDone: boolean;
  navigating: Navigating | null;
};

export const emptyModel: AppModel = {
  screen: "list",
  error: null,
  errorFatal: false,
  booted: false,
  pipelines: [],
  selectedIndex: 0,
  graph: null,
  focusedJobIndex: 0,
  logJobId: null,
  logBuffer: "",
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
  | { type: "focusJob"; id: string }
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

function focusIndexForId(graph: PipelineGraph, id: string | undefined): number {
  const index = graph.jobs.findIndex((job) => job.id === id);
  return index === -1 ? 0 : index;
}

export function reduce(model: AppModel, action: Action): AppModel {
  switch (action.type) {
    case "error":
      return {
        ...model,
        error: action.message,
        errorFatal: action.fatal ?? false,
        booted: true,
        navigating: null,
      };
    case "pipelines":
      return {
        ...model,
        error: null,
        errorFatal: false,
        booted: true,
        pipelines: action.pipelines,
        selectedIndex: clamp(model.selectedIndex, action.pipelines.length),
      };
    case "moveList":
      return {
        ...model,
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
        focusedJobIndex: 0,
        error: null,
        errorFatal: false,
        navigating: null,
      };
    case "refreshGraph": {
      if (model.screen === "logs") {
        return { ...model, graph: action.graph };
      }
      const currentId = focusedJob(model)?.id;
      return {
        ...model,
        graph: action.graph,
        focusedJobIndex: focusIndexForId(action.graph, currentId),
      };
    }
    case "focusJob": {
      const index = model.graph?.jobs.findIndex((job) => job.id === action.id) ?? -1;
      if (index < 0) {
        return model;
      }
      return { ...model, focusedJobIndex: index };
    }
    case "openLogs": {
      const job = focusedJob(model);
      if (!job) {
        return model;
      }
      return {
        ...model,
        navigating: { kind: "logs", jobId: job.numericId },
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
        logDone: false,
        navigating: null,
      };
    }
    case "logChunk":
      return { ...model, logBuffer: appendLogBuffer(model.logBuffer, action.chunk) };
    case "logDone":
      return { ...model, logDone: true };
    case "back":
      if (model.error && !model.errorFatal) {
        return { ...model, error: null };
      }
      if (model.navigating?.kind === "logs") {
        return { ...model, navigating: null };
      }
      if (model.screen === "logs") {
        return {
          ...model,
          screen: "graph",
          logJobId: null,
          logBuffer: model.logBuffer,
          logDone: model.logDone,
        };
      }
      if (model.screen === "graph") {
        return { ...model, screen: "list" };
      }
      return model;
    default:
      return model;
  }
}

export function shouldPollGraph(model: AppModel): boolean {
  if (model.screen !== "graph" || !model.graph) {
    return false;
  }
  return isActivePipelineStatus(model.graph.status);
}

export function nextPollDelay(currentMs: number, rateLimited: boolean): number {
  if (!rateLimited) {
    return 4000;
  }
  return Math.min(currentMs * 2, 30_000);
}
