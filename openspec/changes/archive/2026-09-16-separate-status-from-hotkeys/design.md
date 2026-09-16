## Context

See proposal.md - Why. Current state that shapes this change:

- `ScreenPanel` (`src/app.tsx:37`) owns the chrome for every screen. Its footer is a single flex row: `<box flexDirection="row"><text fg={HELP_COLOR}>{footer}</text>{status}</box>`. The `status` node is simply the next child, so it renders immediately after the help text with no justification.
- Two transient statuses exist, both caller-built React nodes: `RefreshStatus` (`"  " + spinner + " refreshing…"`, `#60a5fa`) and `CopiedNotice` (`"  " + "copied to clipboard"`, `BUCKET_COLOR.success`). Both bake in a two-space prefix that stands in for the missing separation.
- `refreshing: "list" | "graph" | null` (`src/app.tsx:216`) is set at the start of every poll tick and every manual refresh, and cleared when it settles. The list, graph, and attempts screens pass `refreshing === "list" | "graph"` into `status`; the log screen passes the copy notice instead.
- `model.refreshWarning` renders as a yellow body row (`refresh error: … — retrying`) on the list, graph, and attempts screens, and `model.graph.truncated` as `job list truncated at 100`; the `LoadingOverlay` dims the body during navigation. None of these go through the `status` prop.
- Help strings are one literal per call site, longest `"arrows move  enter log  r refresh  esc list  q quit"` (51 columns, job graph). The log's `${logDone ? "ended" : "live"} · y yank · esc back` marker is not a key but is required by the existing `screen-chrome` log-help scenario.
- `@opentui/core` exposes `justifyContent` (including `"space-between"`) and `flexShrink` as box props (`Renderable.d.ts:31,35`; `yoga.options.d.ts:10`). The footer row is already a flex row, so justification needs no new node type.
- Measured against the real renderer (`testRender` from `@opentui/react/test-utils`, 56-column inner row, 51-column help, 13-column spinner): the current layout shows `…esc list  ⠋` - the status loses `refreshing…`. Adding `justifyContent="space-between"` with the status in a `flexShrink={0}` box shows the full `⠋ refreshing…` and truncates the help text instead. Without the `flexShrink={0}` wrapper, the status is truncated the same way it is today. At widths where both fit (70+), `space-between` puts the status flush right, while today's stacked layout leaves it left-packed next to the keys.
- Tests read the chrome by substring: `hasDimmedPanelBody` locates the footer row via `"enter graph"` / `"arrows move"`, the spinner test matches `refreshing…`, the copy tests match `copied to clipboard`, and one test asserts the log's footer row contains `y yank` and sits below the log body. `ScreenPanel` is also rendered directly in a test with `title`/`footer` props (`src/app.test.tsx:251`).
- The pending `retry-failed-job` change also modifies `screen-chrome`'s keymap requirement and the same help strings (adding `ctrl+r`), and is not applied yet.

## Goals / Non-Goals

**Goals:**

- One chrome row per screen with two independent slots: key help flush left, transient status flush right, no shared text and no placeholder when empty.
- Make the separation structural, so a future caller cannot silently append status text to the help string.
- Keep existing chrome colors, dimming, and every existing key help string exactly as they are.

**Non-Goals:**

- Changing which statuses exist, when the spinner appears, or how polling schedules work.
- Moving `refresh error: … — retrying`, `job list truncated at 100`, or the dim loading overlay.
- Moving the log's `live`/`ended` marker out of the help line.
- Rebuilding the frame, title, or overlay rendering.

## Decisions

**1. Two slots in the same justified row, not two rows.**
The row keeps `flexDirection="row"` and gains `justifyContent="space-between"`, with the help text as the first child and the status box as the second. The operator asked for the status pinned to the right of the screen on the hotkey row; a dedicated status row would also cost a body line on every screen. Rejected: absolute positioning of the status (it would need the row height and right-edge clipping handled by hand for the same result).

**2. Rename the `footer` prop to `keyHelp`; keep `status` as a node.**
After this change `footer` means "keys only", which the name no longer conveys, and the old name is what invites appending status to it. Renaming makes the invariant visible at all six call sites and in the direct `ScreenPanel` test. Rejected: keeping `footer` (smaller diff, but leaves the mixed-purpose name in place) and replacing the `status` node with a discriminated status kind (pushes presentation back into the model and complicates the copy-notice state, which lives in component state).

**3. Drop the `"  "` prefix from `RefreshStatus` and `CopiedNotice`.**
That prefix existed only to fake a gap that justification now provides. Their colors (`#60a5fa`, `BUCKET_COLOR.success`) stay, which is what the spec's color clause pins.

**4. Guard the help line as "status-independent text", not "keys only".**
The log help already carries the required `live`/`ended` marker, so a literal "keys only" rule would contradict the existing log-help scenario. The spec instead requires the help line's text to be identical with and without a status, which is both the user's intent and directly testable. Rejected: moving `live`/`ended` into the status area - a behavior change nobody asked for, and the existing spec expects it in the chrome with the log keys.

**5. Wrap the status in a `flexShrink={0}` box.**
Without the wrapper the status text is itself shrinkable, and the measurement above shows it getting truncated exactly as it does today at narrow widths. The wrapper is what makes the status area keep its own width and the help text yield instead. The wrapper lives inside `ScreenPanel`, so call sites only pass the node and cannot opt out of the placement.

**6. Let the help text be the slot that loses space on a narrow row.**
Measured behavior of the chosen layout: when both slots fit, the status sits flush right; when they do not, the help text is truncated at the right edge and the status stays legible. This is a deliberate trade - the operator asked for status to be visible, and the longest help line (51 columns on the job graph) only collides with a status below roughly 64 columns of row width. Rejected: `flexShrink` on the status or clipping it first (that is today's behavior, and it hides the message the operator asked to see) and wrapping the row (changes every screen's body height).

**7. Verify the split through the captured frame, not new scaffolding.**
Extend `src/app.test.tsx`: on a screen with a status, assert the help substring and the status substring are on the same row with the help column to the left and the status at the row's right edge; on a screen without a status, assert the help text is unchanged and no status word appears. The existing substring assertions (`refreshing…`, `copied to clipboard`, `y yank`) stay as they are so today's chrome guarantees keep being checked.

## Risks / Trade-offs

- [Pending `retry-failed-job` modifies the same `screen-chrome` requirement and the same help strings] → whichever change lands second folds the other's clause into the requirement text and re-adds `ctrl+r` to the help strings; nothing here depends on the retry clause.
- [Renaming `footer` → `keyHelp` touches six call sites plus one direct `ScreenPanel` test] → mechanical, caught by the compiler through a required prop, and no other module imports `ScreenPanel`.
- [On a narrow row the help text - including key hints - is truncated before the status] → measured onset is around 64 columns of row width for the longest help line, which is still inside the frame on the widths the test suite renders at. The status message is what the operator needs while polling, so it keeps its space; recorded as decision 6 rather than mitigated away.
- [Column-position assertions can be brittle against padding changes] → assert ordering (help column < status column, status ends at the row's last content column) rather than exact offsets.
- [A future screen adds a status but concatenates it into the help string instead of using the prop] → the spec's "status does not extend the help line" scenario fails the moment someone does that.
