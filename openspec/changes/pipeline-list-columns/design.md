## Context

See proposal.md — Why for motivation. What shapes the approach:

- The list row is one `<text>` at `src/app.tsx` (pipeline row render) reading `{"> "|" "} #{row.id}  {row.status}  {row.ref}` with `fg={BUCKET_COLOR[row.bucket]}` on the whole line. Nothing pads or truncates, and `<text>` wraps by default (`TextBufferRenderable`, `truncate: false`).
- Data comes from `glab ci list -F json -P 50 -p <page>` through `src/glab/list.ts`. `glab ci list` prints the raw `[]*gitlab.Pipeline`, whose struct already carries `created_at`, `updated_at`, `started_at`, `duration`, `name`, `sha`, `source`, `user`, and `web_url`; `src/glab/list.ts` currently maps only `id`, `iid`, `status`, `ref`, `source`.
- Precedents to reuse instead of inventing: `statusIcon()` and `BUCKET_COLOR` in `src/status.ts`; per-column width from content in `columnInnerWidth()` plus `padEnd` in the job graph; `<span fg=…>` runs in the log screen; a `useRenderer`-driven layout reading nothing but props.
- OpenTUI React 0.5.11 exposes `<text>`, `<span>`, `<box>`, `<scrollbox>` as JSX intrinsics. `TextTableRenderable` exists in `@opentui/core` but has no JSX intrinsic; registering it needs `extend()`.
- The list screen re-renders on every poll (`shouldPollList` keeps a 4s/5s cycle running for as long as the list is visible), so any render-time-derived value refreshes without extra work.

## Goals / Non-Goals

**Goals:**

- A row is one line, columns align across rows, and column boundaries are computed once per render and shared by the header and the rows.
- The status bucket is the only saturated color in a row; the rest of the row is muted chrome / default foreground.
- The name and the started cells come from data already in the list response — no new GitLab call, no change to polling, pagination, or rate-limit handling.

**Non-Goals:**

- Any second GitLab read path for the list (GraphQL, REST via `glab api`, per-row commit lookups).
- A shared table abstraction for the graph/attempts/log screens; this layout lives with the list.
- Column configurability, sorting, or persistence of column state.

## Decisions

**1. Keep `glab ci list -F json` and extend the mapping.** Add `created_at?: string` to `GlabPipelineJson` and `createdAt: string` to `PipelineRow`, defaulting to `""`. The field stays optional in the JSON shape so an older `glab` or a fixture without it still parses.
*Alternative considered:* a GraphQL `project.pipelines { commit { title } }` query to get commit titles and a richer row. Rejected — it replaces the list read path, its pagination, and its rate-limit/error handling, and `created_at` already arrives from `glab ci list`.

**2. Do not use GitLab's pipeline `name` field.** It is empty unless a project sets `workflow:name`, so the name column is derived from the ref instead (see specs — Human-readable pipeline names). `name` stays unused in the JSON shape.
*Alternative considered:* show `name` when present and fall back to the ref label. Rejected as extra branching for a field that is empty in practice.

**3. Color and glyph go on the status cell only.** Each row becomes one `<text>` whose children are `<span>`s: marker, id, status, name, started. The status cell renders `${statusIcon(row.status)} ${row.status}` in `BUCKET_COLOR[row.bucket]`; id and started render in the muted chrome color, name in the default foreground.
*Alternative considered:* keep the whole row tinted and only align columns. Rejected — the row-wide tint is what makes the list read as a color wall, and `screen-chrome` reserves saturated color for status signals.

**4. Column widths are computed from the visible rows, not fixed.** A pure helper module (`src/list-layout.ts`) computes, from the rows of the current render and the available inner width:

```
  marker(2) + id(# + digits, from rows) + status(icon + longest status word) + name(flex) + started(max age text)
```

It exposes `fit(text, width)` = truncate with `…` then `padEnd`. Both the header and every row call it with the same widths, so they cannot drift. The name column takes the remainder, shrinks to a minimum, and the started column is dropped last-resort-first as the specs require.
*Alternative considered:* fixed minimum widths per column, letting Yoga overflow. Rejected — the point of the change is that columns line up at any width.

**5. Started column is relative time computed at render.** A pure `src/relative-time.ts` takes `(iso: string, now: number)` and returns `4m` / `3h` / `2d` (compact units, largest single unit: seconds under a minute, then minutes, hours, days, weeks, months, years); `now` is a parameter so tests are deterministic, and the component passes `Date.now()`. No timer: the poll already re-renders the list on a 4-5s cycle. An empty or unparsable timestamp yields `—`.
*Alternative considered:* an absolute clock/date, and a "relative under 24h, date after" hybrid. Rejected by the operator in favour of relative-only.

**6. Header is a sibling of the scrollbox, not a row inside it.** It sits in the same column box as the scrollbox, above it, in the muted chrome color, using the same computed widths. This keeps it pinned while rows scroll and keeps it out of the scrollable content, matching how `ScreenPanel` already separates body from chrome.
*Alternative considered:* a first row inside the scrollbox. Rejected — it scrolls away.

**7. `src/pipeline-ref.ts` owns the ref label.** `refLabel(ref)` maps MR, branch, and tag shapes, returning unknown shapes unchanged. Pure and unit-tested, like `keys.ts` / `status.ts`.

## Risks / Trade-offs

- [Dynamic status width: a rare `waiting_for_resource` (20 chars) widens the status column and shifts the name column for that refresh] → Accepted for now; aliasing status words would invent vocabulary the rest of the app does not use. Revisit only if it is seen in practice.
- [`fit()` measures with `String.length`, like `jobLabelWidth()` in the graph, so a Nerd Font glyph is assumed to occupy one cell] → Consistent with the existing app-wide assumption (README already requires a Nerd Font); no new exposure.
- [A visible vertical scrollbar inside the scrollbox could shrink row content while the header keeps its full width, misaligning the right edge] → Verify in a frame test that the header and the first row place the started cell in the same column; if the scrollbar overlaps, reserve one right-edge cell in the computed widths.
- [Long name truncation can hide the distinguishing part of `release/2.1-hotfix-a` vs `release/2.1-hotfix-b`] → Accepted; the id column and Enter still identify the pipeline unambiguously.

## Open Questions

- Whether `waiting_for_resource` and `preparing` should get short display aliases later.
- Whether the selected row should eventually get a background highlight instead of the `>` marker; the marker stays for now to keep the existing frame tests and selection semantics.

## Migration Plan

No stored state or external contract changes; this is a render and mapping change in one app. Rollback is reverting the render, the `createdAt` mapping, and the new helper modules. Existing tests that assert `> #42` remain valid because the marker keeps its position at the start of the row.
