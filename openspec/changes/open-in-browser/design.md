## Context

See `proposal.md` — Why. The constraints that shape this design:

- One keyboard handler in `src/app.tsx` drives four screens (`list`, `graph`, `attempts`, `logs`); navigation and job actions are committed through the reducer in `src/model.ts`, while process side effects are spawned from either the handler or an effect watching committed state.
- The app already resolves the project once per working tree: `projectFullPath()` in `src/glab/graph.ts` runs `glab repo view -F json` and caches `path_with_namespace`. That same call's payload already carries the project web URL, which nothing reads yet.
- Facts verified against the operator's instance (`gitlab.foodtech.team`, glab 1.117.0, 2026-09-16):
  - `glab ci list -F json` rows carry `web_url` in the shape `<project web_url>/-/pipelines/<pipeline id>` (pipeline id, not iid: `…/-/pipelines/1457442` for iid 85).
  - `glab api projects/:id/jobs/<job-id>` returns `web_url` in the shape `<project web_url>/-/jobs/<job-id>`.
  - `glab api graphql` on that instance exposes neither `webUrl` nor `webPath` on `Pipeline` or `CiJob` (`undefinedField` for both, and the same for `project.pipeline.jobs.nodes[].webUrl`), so the existing graph query cannot supply a URL.
  - The URLs built from the project web URL plus those two paths were byte-identical to the `web_url` values glab reported for the same pipeline and job.
- OpenTUI's raw key parser maps a printable character to a lowercase `name`, setting `shift: true` for uppercase. `o` and `Shift+O` therefore arrive as `name: "o"` and differ only in the shift flag.

## Goals / Non-Goals

**Goals:**

- One key and one mechanism for all four screens, so the list, graph, attempts and log behave the same way.
- No new GitLab read on any refresh path and no API call per key press.
- Pure, unit-testable URL and opener helpers, so the platform-specific part is a single small module.
- Honest failure reporting: the operator learns when the browser could not be launched, and never reads a successful open as guaranteed.

**Non-Goals:**

- Honoring `BROWSER`, browser profiles, or per-OS openers beyond the platform default.
- Copying the URL, showing it on screen, or adding it as a list column.
- Opening anything without a focused object (merge requests, branches, artifacts, bridge child pipelines).
- Delegating pipeline opens to `glab ci view --web` while hand-rolling job opens.
- Touching the list/graph refresh cadence, retry/run, or log tracing.

## Decisions

### 1. Build URLs from the project web URL instead of reading a URL per press

`src/gitlab-url.ts` gets two pure builders, `pipelineWebUrl(base, pipelineId)` and `jobWebUrl(base, jobId)`, both rejecting non-numeric ids and normalizing a trailing slash on the base.

Alternatives considered:

- `glab api projects/:id/jobs/<job-id>` on each press — authoritative, but puts a subprocess and a new failure mode on the press path (the key fails exactly when a URL could still be built), and needs the same builders' input anyway.
- `glab ci view -p <pipeline-id> --web` for pipelines — glab-native, but covers pipelines only, so jobs would use a second mechanism with different error handling and `BROWSER` semantics.

The evidence above shows the built URLs match glab's own `web_url` for both object kinds on the operator's instance, and the base still comes from glab.

### 2. The project web URL rides the existing cached project read

Extend the cache in `src/glab/graph.ts` to hold `{ fullPath, webUrl }` and expose it (for example `projectInfo()`), leaving `fetchPipelineGraph` behavior unchanged and adding no subprocess: the same `glab repo view -F json` call already returns `web_url`. `webUrl` is optional in that record — only `path_with_namespace` stays required, exactly as today — so an account or instance whose `glab repo view` omits `web_url` cannot break the graph fetch; the open path is the one that reports the missing address.

### 3. Our own opener, one argv shape per platform

`src/browser.ts` holds a pure `browserArgv(platform)` returning `["open", url]`, `["xdg-open", url]`, or `["cmd", "/c", "start", "", url]`, and an `openInBrowser(url)` that spawns it with stdio ignored and the process released, returning whether the launch was started. `BROWSER` is deliberately ignored (see Non-Goals): honoring it means parsing an environment value that may carry arguments, which glab's own browser package does at some length.

### 4. Each screen opens the object it is showing

- pipeline list → the selected row's pipeline id
- job graph → the focused card's latest attempt id, unless that card has more than one attempt
- attempts list → the focused attempt's id
- job log → the id being traced (`logJobId`), never the graph's focused card, so an older attempt opens as that older attempt and a traced job that dropped out of a refresh still opens.

### 5. The multi-attempt card reuses the attempts chooser plus a notice

The operator's choice: no new popup overlay. A new reducer action (for example `openAttemptsForBrowser`) enters the existing attempts screen with the newest attempt focused and puts a notice in the model's existing non-fatal notice slot, which that screen already renders: the job has several attempts, pick one and press the open key again. The confirm key's path stays silent, so the notice marks only the browser route. Reusing the slot avoids a second message channel; the cost is that this notice shares `retryMessage`'s lifetime (cleared by moving the attempt focus, going back, or a new action), which is the behavior the operator asked for.

### 6. The open is a handler side effect, not committed model state

Retry and run are spawned from committed reducer state because they mutate GitLab and pass through a confirmation. Opening a browser mutates nothing, so the key handler resolves the project web URL and spawns the opener directly, behind a single-in-flight guard (one open at a time). Driving it from model state would add a state slot, an effect, and a dedup key for no behavioral gain.

### 7. A failed open reports through the existing notice slot

The failure paths are: the project web URL cannot be resolved, and the opener cannot be spawned. Both set the same non-fatal notice used elsewhere, in the content area, for the four screens. The list screen currently renders only refresh warnings, so it gains the notice line as well; without it a failed open there would be silent.

### 8. Key help names the browser key

The four help strings gain the browser key, and `keys.ts` gains one predicate (`name === "o"`, no ctrl/meta/option/super; shift allowed so `O` works) beside the existing quit and retry predicates.

## Risks / Trade-offs

- [Constructed URL shape could 404 on a GitLab instance with different routes] → The base URL comes from glab, and the two paths were verified against the operator's instance to match glab's own `web_url` values exactly. If an instance ever disagrees, the fix is localized to `src/gitlab-url.ts`.
- [The first press from the list waits on `glab repo view`] → It is one subprocess per session (cached per working directory), and the one-open-in-flight guard keeps repeated presses from queueing more.
- [We can detect only a failed launch, not a browser that opened nothing] → Stated as such in the specs and in the module doc comment; no success notice is shown that could be read as proof.
- [A new process surface (platform opener)] → `browserArgv` is pure and unit-tested per platform; spawn failures are reported rather than swallowed.
- [Two ways to reach the attempts screen with different chrome] → Both routes share one screen and one keyboard path; only the notice differs, and a scenario pins that the confirm route shows none.

## Migration Plan

None: no stored state, configuration, or data changes. The work lands as ordinary commits on `main`; rolling back means reverting them.

## Open Questions

None. The one user-facing ambiguity — how a card with several attempts should ask which one to open — was settled by the operator in favour of the existing attempts screen plus a notice.
