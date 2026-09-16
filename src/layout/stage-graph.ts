import { latestJobs, type JobNode } from "../glab/graph.ts";
import { buildDag, type DagEdge } from "./dag.ts";

export const EMPTY_STAGE = "(no stage)";
export const CARD_HEIGHT = 3;
export const STAGE_HEADER_HEIGHT = 1;
export const STRIP_WIDTH = 6;

export type StageColumn = {
  name: string;
  jobs: JobNode[];
};

export type StageGraph = {
  columns: StageColumn[];
  edges: DagEdge[];
};

export type MoveDir = "up" | "down" | "left" | "right";

export function buildStageColumns(jobs: JobNode[], stageNames: string[] = []): StageColumn[] {
  const byStage = new Map<string, JobNode[]>();
  const leftover: string[] = [];
  const empty: JobNode[] = [];
  for (const job of jobs) {
    const stage = job.stage.trim();
    if (!stage) {
      empty.push(job);
      continue;
    }
    const list = byStage.get(stage);
    if (!list) {
      leftover.push(stage);
      byStage.set(stage, [job]);
    } else {
      list.push(job);
    }
  }
  const seen = new Set<string>();
  const columns: StageColumn[] = [];
  for (const name of stageNames) {
    const jobsInStage = byStage.get(name);
    if (!jobsInStage || seen.has(name)) {
      continue;
    }
    seen.add(name);
    columns.push({ name, jobs: jobsInStage });
  }
  for (const name of leftover) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    columns.push({ name, jobs: byStage.get(name) ?? [] });
  }
  if (empty.length > 0) {
    columns.push({ name: EMPTY_STAGE, jobs: empty });
  }
  return columns;
}

export function buildStageGraph(jobs: JobNode[], stageNames: string[] = []): StageGraph {
  const visible = latestJobs(jobs);
  return {
    columns: buildStageColumns(visible, stageNames),
    edges: buildDag(visible).edges,
  };
}

export function jobAnchorRow(jobIndex: number): number {
  return STAGE_HEADER_HEIGHT + jobIndex * CARD_HEIGHT + 1;
}

function locate(
  columns: StageColumn[],
  focusedId: string | undefined,
): { col: number; row: number } | null {
  if (!focusedId) {
    return null;
  }
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col]?.jobs.findIndex((job) => job.id === focusedId) ?? -1;
    if (row >= 0) {
      return { col, row };
    }
  }
  return null;
}

export function moveFocus(
  columns: StageColumn[],
  focusedId: string | undefined,
  dir: MoveDir,
): string | undefined {
  if (columns.length === 0) {
    return focusedId;
  }
  const at = locate(columns, focusedId) ?? { col: 0, row: 0 };
  const current = columns[at.col]?.jobs[at.row];
  if (dir === "up") {
    return columns[at.col]?.jobs[at.row - 1]?.id ?? current?.id ?? focusedId;
  }
  if (dir === "down") {
    return columns[at.col]?.jobs[at.row + 1]?.id ?? current?.id ?? focusedId;
  }
  const nextCol = dir === "left" ? at.col - 1 : at.col + 1;
  const neighbor = columns[nextCol]?.jobs;
  if (!neighbor || neighbor.length === 0) {
    return current?.id ?? focusedId;
  }
  const row = Math.min(at.row, neighbor.length - 1);
  return neighbor[row]?.id ?? focusedId;
}

function jobIndex(columns: StageColumn[]): Map<string, { col: number; row: number }> {
  const map = new Map<string, { col: number; row: number }>();
  for (let col = 0; col < columns.length; col++) {
    const jobs = columns[col]?.jobs ?? [];
    for (let row = 0; row < jobs.length; row++) {
      const job = jobs[row];
      if (job) {
        map.set(job.id, { col, row });
      }
    }
  }
  return map;
}

const H = 1;
const V = 2;
const ARROW_E = 4;
const ARROW_W = 8;

function mergeMask(current: number, next: number): number {
  const arrows = (current | next) & (ARROW_E | ARROW_W);
  const lines = (current | next) & (H | V);
  return lines | arrows;
}

function glyph(mask: number): string {
  if (mask & ARROW_E) {
    return "▶";
  }
  if (mask & ARROW_W) {
    return "◀";
  }
  const lines = mask & (H | V);
  if (lines === (H | V)) {
    return "┼";
  }
  if (lines === H) {
    return "─";
  }
  if (lines === V) {
    return "│";
  }
  return " ";
}

type Grid = number[][];

function makeGrid(height: number): Grid {
  return Array.from({ length: height }, () => Array.from({ length: STRIP_WIDTH }, () => 0));
}

function stamp(grid: Grid, x: number, y: number, mask: number) {
  const row = grid[y];
  if (!row || x < 0 || x >= STRIP_WIDTH) {
    return;
  }
  row[x] = mergeMask(row[x] ?? 0, mask);
}

function paintH(grid: Grid, y: number, x0: number, x1: number, endMask?: number) {
  const min = Math.min(x0, x1);
  const max = Math.max(x0, x1);
  for (let x = min; x <= max; x++) {
    stamp(grid, x, y, H);
  }
  if (endMask !== undefined) {
    stamp(grid, x1, y, endMask);
  }
}

function paintV(grid: Grid, x: number, y0: number, y1: number) {
  const min = Math.min(y0, y1);
  const max = Math.max(y0, y1);
  for (let y = min; y <= max; y++) {
    stamp(grid, x, y, V);
  }
}

function renderGrid(grid: Grid): string[] {
  return grid.map((row) => row.map((cell) => glyph(cell)).join(""));
}

function columnHeight(columns: StageColumn[]): number {
  const tallest = Math.max(0, ...columns.map((col) => col.jobs.length));
  return STAGE_HEADER_HEIGHT + tallest * CARD_HEIGHT;
}

/**
 * One box-drawing strip to the right of each stage column.
 * Same-stage needs loop in that strip; cross-stage needs route through
 * strips between the two columns (highway on the header row).
 */
export function paintConnectorStrips(columns: StageColumn[], edges: DagEdge[]): string[][] {
  const height = columnHeight(columns);
  const strips = columns.map(() => makeGrid(Math.max(height, 1)));
  const index = jobIndex(columns);
  const elbow = STRIP_WIDTH - 2;

  for (const edge of edges) {
    const from = index.get(edge.fromId);
    const to = index.get(edge.toId);
    if (!from || !to) {
      continue;
    }
    const y0 = jobAnchorRow(from.row);
    const y1 = jobAnchorRow(to.row);
    if (from.col === to.col) {
      const grid = strips[from.col];
      if (!grid) {
        continue;
      }
      paintH(grid, y0, 0, elbow);
      paintV(grid, elbow, y0, y1);
      paintH(grid, y1, elbow, 0, ARROW_W);
      continue;
    }
    if (from.col + 1 === to.col) {
      const grid = strips[from.col];
      if (!grid) {
        continue;
      }
      if (y0 === y1) {
        paintH(grid, y0, 0, STRIP_WIDTH - 1, ARROW_E);
      } else {
        paintH(grid, y0, 0, elbow);
        paintV(grid, elbow, y0, y1);
        paintH(grid, y1, elbow, STRIP_WIDTH - 1, ARROW_E);
      }
      continue;
    }
    if (to.col + 1 === from.col) {
      const grid = strips[to.col];
      if (!grid) {
        continue;
      }
      if (y0 === y1) {
        paintH(grid, y0, STRIP_WIDTH - 1, 0, ARROW_W);
      } else {
        paintH(grid, y0, STRIP_WIDTH - 1, elbow);
        paintV(grid, elbow, y0, y1);
        paintH(grid, y1, elbow, 0, ARROW_W);
      }
      continue;
    }
    const left = Math.min(from.col, to.col);
    const right = Math.max(from.col, to.col);
    const forward = from.col < to.col;
    const startY = forward ? y0 : y1;
    const endY = forward ? y1 : y0;
    const startGrid = strips[left];
    const endGrid = strips[right - 1];
    if (!startGrid || !endGrid) {
      continue;
    }
    const highway = 0;
    paintH(startGrid, startY, 0, elbow);
    paintV(startGrid, elbow, startY, highway);
    paintH(startGrid, highway, elbow, STRIP_WIDTH - 1);
    for (let col = left + 1; col < right - 1; col++) {
      const mid = strips[col];
      if (mid) {
        paintH(mid, highway, 0, STRIP_WIDTH - 1);
      }
    }
    paintH(endGrid, highway, 0, elbow);
    paintV(endGrid, elbow, highway, endY);
    paintH(endGrid, endY, elbow, STRIP_WIDTH - 1, forward ? ARROW_E : ARROW_W);
  }

  return strips.map(renderGrid);
}
