import type { PipelineRow } from "./glab/list.ts";
import { refLabel } from "./pipeline-ref.ts";
import { relativeTime } from "./relative-time.ts";
import { statusIcon } from "./status.ts";

/** Selection marker plus the space that separates it from the id column. */
export const MARKER_WIDTH = 2;
const GAP = 1;
/** Narrowest name column worth keeping; a tighter panel drops the name instead. */
export const MIN_NAME_WIDTH = 8;

/** A row's cell text before column widths are known. */
export type RowCells = {
  id: string;
  status: string;
  name: string;
  started: string;
};

export type ListColumns = {
  id: number;
  status: number;
  /** null when the panel left no readable room for a name column. */
  name: number | null;
  /** null when the started column was dropped to keep the name. */
  started: number | null;
};

export const COLUMN_LABELS: RowCells = {
  id: "PIPELINE",
  status: "STATUS",
  name: "NAME",
  started: "STARTED",
};

/** The cells a pipeline row renders. */
export function pipelineCells(row: PipelineRow, now: number): RowCells {
  return {
    id: `#${row.id}`,
    status: `${statusIcon(row.status)} ${row.status}`,
    name: refLabel(row.ref),
    started: relativeTime(row.createdAt, now),
  };
}

function widest(cells: RowCells[], pick: (cells: RowCells) => string): number {
  return cells.reduce((width, row) => Math.max(width, pick(row).length), 0);
}

/**
 * Column widths for the rows at hand: the id and status columns fit their
 * content, the name column takes what is left, and a panel too narrow for that
 * gives up the started column before the name column, keeping the id and status.
 * Every column is at least as wide as its header label, so the header is never
 * the thing that gets ellipsized.
 */
export function listColumns(cells: RowCells[], width: number): ListColumns {
  const id = Math.max(COLUMN_LABELS.id.length, widest(cells, (row) => row.id));
  const status = Math.max(COLUMN_LABELS.status.length, widest(cells, (row) => row.status));
  const started = Math.max(COLUMN_LABELS.started.length, widest(cells, (row) => row.started));
  const name = Math.max(COLUMN_LABELS.name.length, widest(cells, (row) => row.name));
  const fixed = MARKER_WIDTH + id + GAP + status + GAP;
  // A name shorter than the minimum only needs the room it actually uses.
  const keepName = Math.min(name, MIN_NAME_WIDTH);

  if (fixed + GAP + started + keepName <= width) {
    return { id, status, name: Math.min(name, width - fixed - GAP - started), started };
  }
  if (fixed + keepName <= width) {
    return { id, status, name: Math.min(name, width - fixed), started: null };
  }
  return { id, status, name: null, started: null };
}

/** Text padded or ellipsized to exactly `width` cells. */
export function fit(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (text.length <= width) {
    return text.padEnd(width);
  }
  return width === 1 ? "…" : `${text.slice(0, width - 1)}…`;
}

export type ListCell = {
  role: "id" | "status" | "name" | "started";
  /** Padded to its column, with the gap that separates it from the previous. */
  text: string;
};

/** A row's cells in render order, gaps included; an absent column is omitted. */
export function listCells(cells: RowCells, columns: ListColumns): ListCell[] {
  const out: ListCell[] = [];
  const add = (role: ListCell["role"], text: string, width: number) => {
    out.push({ role, text: `${out.length === 0 ? "" : " "}${fit(text, width)}` });
  };
  add("id", cells.id, columns.id);
  add("status", cells.status, columns.status);
  if (columns.name !== null) {
    add("name", cells.name, columns.name);
  }
  if (columns.started !== null) {
    add("started", cells.started, columns.started);
  }
  return out;
}

/** A full row line without the selection marker, gaps included. */
export function listRowText(cells: RowCells, columns: ListColumns): string {
  return listCells(cells, columns)
    .map((cell) => cell.text)
    .join("");
}

/** The column header line: same gaps, so it cannot drift from the rows. */
export function headerLine(columns: ListColumns): string {
  return `${" ".repeat(MARKER_WIDTH)}${listRowText(COLUMN_LABELS, columns)}`;
}
