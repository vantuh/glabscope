import type { JobNode } from "../glab/graph.ts";

export type DagEdge = { fromId: string; toId: string };

export type RankedDag = {
  jobs: JobNode[];
  edges: DagEdge[];
  ranks: JobNode[][];
};

export function buildDag(jobs: JobNode[]): RankedDag {
  const byName = new Map<string, JobNode[]>();
  for (const job of jobs) {
    const list = byName.get(job.name) ?? [];
    list.push(job);
    byName.set(job.name, list);
  }

  const edges: DagEdge[] = [];
  for (const job of jobs) {
    for (const needName of job.needsNames) {
      const upstream = byName.get(needName) ?? [];
      for (const source of upstream) {
        if (source.id !== job.id) {
          edges.push({ fromId: source.id, toId: job.id });
        }
      }
    }
  }

  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const job of jobs) {
    outgoing.set(job.id, []);
    indegree.set(job.id, 0);
  }
  for (const edge of edges) {
    outgoing.get(edge.fromId)?.push(edge.toId);
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue = jobs.filter((job) => (indegree.get(job.id) ?? 0) === 0).map((job) => job.id);
  for (const id of queue) {
    rank.set(id, 0);
  }
  const remaining = new Map(indegree);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of outgoing.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const nextIn = (remaining.get(next) ?? 1) - 1;
      remaining.set(next, nextIn);
      if (nextIn === 0) {
        queue.push(next);
      }
    }
  }
  for (const job of jobs) {
    if (!rank.has(job.id)) {
      rank.set(job.id, 0);
    }
  }

  const maxRank = Math.max(0, ...[...rank.values(), 0]);
  const ranks: JobNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const job of jobs) {
    const column = ranks[rank.get(job.id) ?? 0];
    column?.push(job);
  }

  return { jobs, edges, ranks };
}

export function renderDagAscii(
  dag: RankedDag,
  focusedId: string | undefined,
  viewport: { width: number; height: number; scrollX?: number; scrollY?: number },
): string[] {
  const colGap = " --> ";
  const columns = dag.ranks.map((column) =>
    column.map((job) => {
      const mark = job.id === focusedId ? ">" : " ";
      return `${mark}[${job.name}]`;
    }),
  );
  const colWidths = columns.map((column) =>
    column.reduce((max, line) => Math.max(max, line.length), 2),
  );
  const rowCount = Math.max(1, ...columns.map((column) => column.length));
  const full: string[] = [];
  for (let row = 0; row < rowCount; row++) {
    const parts: string[] = [];
    for (let col = 0; col < columns.length; col++) {
      const cell = columns[col]?.[row] ?? "";
      parts.push(cell.padEnd(colWidths[col] ?? 0));
      if (col < columns.length - 1) {
        const connect =
          row === 0 && (dag.ranks[col + 1]?.length ?? 0) > 0 ? colGap : " ".repeat(colGap.length);
        parts.push(connect);
      }
    }
    full.push(parts.join(""));
  }

  const scrollX = viewport.scrollX ?? 0;
  const scrollY = viewport.scrollY ?? 0;
  return full
    .slice(scrollY, scrollY + viewport.height)
    .map((line) => line.slice(scrollX, scrollX + viewport.width));
}
