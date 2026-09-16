import { expect, test } from "bun:test";
import {
  COLUMN_LABELS,
  MARKER_WIDTH,
  MIN_NAME_WIDTH,
  fit,
  headerLine,
  listColumns,
  listRowText,
  pipelineCells,
} from "./list-layout.ts";
import type { PipelineRow } from "./glab/list.ts";
import { statusIcon } from "./status.ts";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");

function pipeline(overrides: Partial<PipelineRow> = {}): PipelineRow {
  return {
    id: 1458696,
    iid: 1,
    status: "success",
    bucket: "success",
    ref: "main",
    source: "push",
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

/** Where a row's nth cell starts inside a row line (which has no marker). */
function cellOffset(columns: ReturnType<typeof listColumns>, index: number): number {
  const widths = [columns.id, columns.status, columns.name, columns.started];
  let offset = 0;
  for (let i = 0; i < index; i++) {
    const width = widths[i];
    if (width === null || width === undefined) {
      break;
    }
    offset += width + 1;
  }
  return offset;
}

test("fit pads short text and ellipsizes long text", () => {
  expect(fit("main", 6)).toBe("main  ");
  expect(fit("release/2.1-hotfix", 8)).toBe("release…");
  expect(fit("main", 4)).toBe("main");
  expect(fit("main", 0)).toBe("");
  expect(fit("main", 1)).toBe("…");
});

test("cells carry the id, glyph, ref label and age", () => {
  const cells = pipelineCells(
    pipeline({ ref: "refs/merge-requests/2/head", status: "failed", bucket: "failed" }),
    NOW,
  );
  expect(cells.id).toBe("#1458696");
  expect(cells.status).toBe(`${statusIcon("failed")} failed`);
  expect(cells.name).toBe("!2");
  expect(cells.started).toBe("5m");
});

test("columns fit their content and the name takes the remainder", () => {
  const cells = [
    pipelineCells(pipeline({ id: 1458696, status: "success" }), NOW),
    pipelineCells(pipeline({ id: 1458685, status: "waiting_for_resource" }), NOW),
  ];
  const columns = listColumns(cells, 120);
  expect(columns.id).toBe("#1458696".length);
  expect(columns.status).toBe(`${statusIcon("waiting_for_resource")} waiting_for_resource`.length);
  expect(columns.started).toBe(COLUMN_LABELS.started.length);
  const rows = cells.map((row) => listRowText(row, columns));
  expect(rows[0]).toHaveLength(rows[1]!.length);
  expect(rows[0]!).toHaveLength(
    columns.id + 1 + columns.status + 1 + columns.name! + 1 + columns.started!,
  );
});

test("differing status lengths cannot shift the later columns", () => {
  const cells = [
    pipelineCells(pipeline({ status: "success", ref: "refs/merge-requests/2/head" }), NOW),
    pipelineCells(pipeline({ status: "waiting_for_resource", ref: "main" }), NOW),
  ];
  const columns = listColumns(cells, 120);
  const rows = cells.map((row) => listRowText(row, columns));
  expect(rows[0]!.indexOf(cells[0]!.name)).toBe(cellOffset(columns, 2));
  expect(rows[1]!.indexOf(cells[1]!.name)).toBe(cellOffset(columns, 2));
  expect(rows[0]!.indexOf(cells[0]!.started)).toBe(cellOffset(columns, 3));
  expect(rows[1]!.indexOf(cells[1]!.started)).toBe(cellOffset(columns, 3));
});

test("an over-long name is ellipsized into one row line", () => {
  const cells = [pipelineCells(pipeline({ ref: "refs/heads/release/2.1-hotfix-with-a-long-tail" }), NOW)];
  const columns = listColumns(cells, 40);
  const line = listRowText(cells[0]!, columns);
  expect(columns.name).toBeLessThan("release/2.1-hotfix-with-a-long-tail".length);
  expect(line).toContain("…");
  expect(MARKER_WIDTH + line.length).toBe(40);
  expect(line).not.toContain("\n");
});

test("a narrowing panel shrinks the name, then drops the started column, then the name", () => {
  const cells = [
    pipelineCells(pipeline({ id: 1458696, status: "success", ref: "refs/heads/release/2.1-hotfix" }), NOW),
    pipelineCells(pipeline({ id: 1458685, status: "failed", ref: "refs/merge-requests/2/head" }), NOW),
  ];
  const fixed =
    MARKER_WIDTH +
    COLUMN_LABELS.id.length +
    1 +
    `${statusIcon("success")} success`.length +
    1;
  const started =
    COLUMN_LABELS.started.length > "5m".length ? COLUMN_LABELS.started.length : "5m".length;

  const wide = listColumns(cells, 60);
  expect(wide.started).toBe(started);
  expect(wide.name).toBe("release/2.1-hotfix".length);

  const shrunk = listColumns(cells, fixed + 1 + started + MIN_NAME_WIDTH + 1);
  expect(shrunk.name).toBe(MIN_NAME_WIDTH + 1);
  expect(shrunk.started).toBe(started);

  const withoutStarted = listColumns(cells, fixed + 1 + started + MIN_NAME_WIDTH - 1);
  expect(withoutStarted.name).toBe("release/2.1-hotfix".length - 3);
  expect(withoutStarted.started).toBeNull();

  const withoutName = listColumns(cells, fixed + MIN_NAME_WIDTH - 1);
  expect(withoutName.name).toBeNull();
  expect(withoutName.started).toBeNull();
  expect(listRowText(cells[1]!, withoutName)).toBe(
    `${fit(cells[1]!.id, withoutName.id)} ${fit(cells[1]!.status, withoutName.status)}`,
  );
});

test("the header shares the rows' columns and survives the started column being dropped", () => {
  const cells = [pipelineCells(pipeline({ status: "failed", ref: "refs/heads/release/2.1-hotfix" }), NOW)];
  const columns = listColumns(cells, 60);
  const header = headerLine(columns);
  expect(header).toHaveLength(listRowText(cells[0]!, columns).length + MARKER_WIDTH);
  expect(header.indexOf(COLUMN_LABELS.id)).toBe(MARKER_WIDTH);
  expect(header.indexOf(COLUMN_LABELS.status)).toBe(MARKER_WIDTH + cellOffset(columns, 1));
  expect(header.indexOf(COLUMN_LABELS.name)).toBe(MARKER_WIDTH + cellOffset(columns, 2));
  expect(header.indexOf(COLUMN_LABELS.started)).toBe(MARKER_WIDTH + cellOffset(columns, 3));

  const withoutStarted = listColumns(cells, cellOffset(columns, 2) + MIN_NAME_WIDTH);
  expect(withoutStarted.started).toBeNull();
  expect(headerLine(withoutStarted)).not.toContain(COLUMN_LABELS.started);
});
