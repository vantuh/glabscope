## Context

See `proposal.md` for motivation. Today `src/app.tsx` wraps each screen in a `box` with `padding={1}` and loose `<text>` / `<scrollbox>` children—no `border`, no `title`. OpenTUI `BoxRenderable` already supports `border`, `borderStyle` (`single` | `double` | `rounded` | `heavy`), `borderColor`, `title`, `bottomTitle`, and dim footer text. GitLab I/O stays exactly as today: `glab ci list -F json`, `glab api graphql` for the needs DAG, `glab ci trace <job-id>` for logs. This change does not add subprocesses.

## Goals / Non-Goals

**Goals:**
- One reusable screen shell in `src/app.tsx` (outer padding + titled bordered panel + dim help line + flex-grown content).
- List, graph, and log bodies stay in a `scrollbox` inside that panel.
- Muted chrome tokens next to existing `BUCKET_COLOR` so status colors stay the signal.

**Non-Goals:**
- No new files unless a tiny chrome helper would be shorter than repeating five copies; prefer one helper in `app.tsx` or a sibling `chrome.tsx` only if the JSX repeats.
- No model/reducer, key, or glab changes.
- No mouse, theme file, or DAG ASCII-art upgrade.

## Decisions

### 1. OpenTUI box chrome, not ASCII strings
Use `border` + `title` + `bottomTitle` (or a dim `<text>` footer) on `box`. Titles clip natively; drawing `+--+` by hand would fight Yoga layout and scrolling.

Alternatives considered: wrapping content in markdown code fences (unreadable); a full window manager (out of scope).

### 2. Rounded, single-weight frames; one muted palette
`borderStyle="rounded"`, `borderColor` / title around `#4b5563`, help text `#9ca3af` (already used for “other” and hints). Status rows keep `BUCKET_COLOR`. Error *message* stays `#ef4444`; the frame stays muted so a failure does not paint the whole UI red.

Alternatives considered: double/heavy borders (too loud in a small terminal); coloring the frame with the pipeline bucket (competes with row colors).

### 3. Title = identity; footer = keys
| Screen | Title (approx.) | Footer |
| boot | `startup` | empty or `q quit` |
| error | `error` | `q quit` or `esc back  q quit` |
| list | `pipelines` | `enter graph  q quit` |
| graph | `pipeline <iid>` | `arrows move  enter log  esc list  q quit` |
| logs | `log <job>` | `live · esc back` / `ended · esc back` |

Drop the current first-line identity `<text>` so it is not duplicated. Truncation warning stays a line *inside* the graph panel above the job `scrollbox`.

Alternative: title-only, keys in the first scroll row — rejected because keys would scroll away.

### 4. One panel per screen, not nested frames
List, graph, and logs each get **one** content frame. Nested “list inside outer window” wastes columns in 80×24. Logs are the user’s requested “small frame around the log”; the list/graph use the same pattern so the app is one language.

### 5. Loading indicator coexistence
If `add-navigation-loading-spinner` lands first (or second), put the spinner in the **title** or a single line under the title, still inside the frame. Do not remove borders while loading.

### 6. Tests
Extend `@opentui/react/test-utils` `captureCharFrame()` assertions: list/graph/log/boot/error frames contain box-drawing / rounded corners and the title substring. Keep the existing `q` quit test. Prefer a small helper that renders `App` with a stubbed model if boot-only capture cannot show the list; if that requires model injection that does not exist, add a narrow test-only render of the shell helper with fake children rather than mocking all of glab.

## Risks / Trade-offs

- [Narrow terminals clip titles] → Keep titles short (`pipeline 42`, not a paragraph); OpenTUI will clip the rest.
- [Box-drawing vs dumb terminals] → Accept; this app already assumes a capable OpenTUI renderer.
- [Merge conflict with loading-spinner change] → Same file `src/app.tsx`; rebase and keep both frame + spinner.
- [Chrome color too close to `other` bucket] → Rows still have `>` / `#id` structure; if they blend, darken chrome to `#4b5563` only on the border and leave row `other` at `#9ca3af`.

## Migration Plan

Personal local TUI. No data migration. Rollback is git revert of the chrome commit. Operators just restart the process.

## Open Questions

None. Border style, palette, and single-panel layout are decided above.
