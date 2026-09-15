import type { PipelineRow } from "./glab/list.ts";
import type { JobNode, PipelineGraph } from "./glab/graph.ts";
import { isActivePipelineStatus } from "./status.ts";

export type Screen = "list" | "graph" | "logs";

export type AppModel = {
  screen: Screen;
  error: string | null;
  booted: boolean;
  pipelines: PipelineRow[];
  selectedIndex: number;
  graph: PipelineGraph | null;
  focusedJobIndex: number;
  logBuffer: string;
  logDone: boolean;
};

export const emptyModel: AppModel = {
  screen: "list",
  error: null,
  booted: false,
  pipelines: [],
  selectedIndex: 0,
  graph: null,
  focusedJobIndex: 0,
  logBuffer: "",
  logDone: false,
};

export type Action =
  | { type: "error"; message: string }
  | { type: "pipelines"; pipelines: PipelineRow[] }
  | { type: "moveList"; delta: number }
  | { type: "openGraph"; graph: PipelineGraph }
  | { type: "refreshGraph"; graph: PipelineGraph }
  | { type: "moveJob"; delta: number }
  | { type: "openLogs" }
  | { type: "logChunk"; chunk: string }
  | { type: "logDone" }
  | { type: "back" };

export function selectedPipeline(model: AppModel): PipelineRow | undefined {
  return model.pipelines[model.selectedIndex];
}

export function focusedJob(model: AppModel): JobNode | undefined {
  return model.graph?.jobs[model.focusedJobIndex];
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
      return { ...model, error: action.message, booted: true };
    case "pipelines":
      return {
        ...model,
        error: null,
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
    case "openGraph":
      return {
        ...model,
        screen: "graph",
        graph: action.graph,
        focusedJobIndex: 0,
        error: null,
      };
    case "refreshGraph": {
      const currentId = focusedJob(model)?.id;
      return {
        ...model,
        graph: action.graph,
        focusedJobIndex: focusIndexForId(action.graph, currentId),
      };
    }
    case "moveJob":
      return {
        ...model,
        focusedJobIndex: clamp(
          model.focusedJobIndex + action.delta,
          model.graph?.jobs.length ?? 0,
        ),
      };
    case "openLogs":
      if (!focusedJob(model)) {
        return model;
      }
      return {
        ...model,
        screen: "logs",
        logBuffer: "",
        logDone: false,
      };
    case "logChunk":
      return { ...model, logBuffer: model.logBuffer + action.chunk };
    case "logDone":
      return { ...model, logDone: true };
    case "back":
      if (model.screen === "logs") {
        return { ...model, screen: "graph", logBuffer: model.logBuffer, logDone: model.logDone };
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
