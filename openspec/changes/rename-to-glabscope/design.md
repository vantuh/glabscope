# Design: rename to glabscope

## Context

See proposal.md - Why for the motivation. What shapes the approach:

- The project identity lives in exactly three places: the `name` field in `package.json`, the root workspace `name` in `bun.lock`, and `README.md`. No source file, import path, or runtime string carries the old name, so the rename needs no code changes.
- Nothing in the app is path- or name-dependent: the entrypoint is `package.json`'s `module: src/index.tsx`, and every GitLab read resolves from the launch working directory (`src/glab/run.ts:16-17` passes `process.cwd()` as the `glab` subprocess cwd; `src/glab/trace.ts:11-12` does the same for the log tracer).
- The GitLab surface stays exactly as it is: `glab ci list -F json`, `glab api graphql` (jobs, statuses, `needs`, stage order), `glab ci trace <job-id>`, `glab ci retry <job-id>`, `glab ci trigger <job-id>` for a waiting manual job. The rename touches none of these argv builders.
- `README.md` is the only public-facing document. The published screens are specified in `openspec/specs/` (pipeline-list, job-graph, job-logs, screen-chrome), so the README describes the product and points at behavior rather than restating requirement text.

## Goals / Non-Goals

**Goals:**

- Give the project one public identity — `glabscope` — used by the package metadata and the README.
- Keep the package's existing shape: same scripts, same dependencies, same entrypoint, still `private: true`.
- Make the README state only what the current build does, with each documented command and key traceable to source.

**Non-Goals:**

- No npm publication, no `bin` entry, no global executable, and no new install method: the documented launch path stays `bun /path/to/glabscope/src/index.tsx` from the target GitLab project.
- No rename of the repository directory, module paths, or exports inside `src/`.
- No change to any `glab` command, keybinding, or screen behavior — the TUI specs are not updated by this change.
- No README coverage of features that exist only as unwritten plans (`open-in-browser`, `install-as-command`).

## Decisions

**1. Edit the two `name` fields by hand instead of running `bun install` to regenerate `bun.lock`.**
Alternatives: (a) `bun install` and let Bun rewrite the lockfile — rejected because it rewrites entries this change does not own, and it would fold in pre-existing drift (`package.json` declares `typescript: ^5` while `bun.lock` records `^7`); (b) leave `bun.lock` alone — rejected because the lockfile names the root workspace.
Chosen: change `workspaces[""].name` in `bun.lock` and the `name` in `package.json`, then parse both files to confirm the new name, `private: true`, and unchanged scripts.

**2. Use the checkout path as a placeholder in the launch instructions rather than promising a fixed directory.**
Alternatives: (a) instruct users to clone into a directory literally named `glabscope` — rejected as an unenforceable constraint on the operator's filesystem; (b) point at a `glabscope` command — not implemented and explicitly out of scope here.
Chosen: `cd /path/to/your-gitlab-project && bun /path/to/glabscope/src/index.tsx`, with the requirement that glabscope runs from the project it should inspect spelled out. This keeps the README honest about why `bun start` only works inside the glabscope checkout.

**3. Verify documented keys and commands against source, not against the specs.**
The README's controls table is derived from the `keyHelp` strings rendered by each screen in `src/app.tsx` and from `src/keys.ts`, and the "How it works" table from the argv builders in `src/glab/`. Alternatives: paraphrase the specs — rejected because the README must describe the shipped build and the specs are written as requirements, not user documentation.

**4. Keep `private: true` and the existing scripts.**
The rename is an identity change, not a distribution change. Publishing would need a version, license, and entrypoint decision this change explicitly excludes.

**5. Document only implemented behavior, and classify the rest as "Not included".**
Alternatives: describe planned work — rejected because an unreleased plan is not a feature and would make the landing page wrong on arrival. Canceling a job, artifacts, merge-request and YAML views, and bridge child-pipeline drill-down are stated as absent.

**6. Leave OpenSpec history alone.**
Renaming archived change directories would rewrite the audit trail, which the proposal lists as a non-goal. Only the current change's own task list records the rename.

## Risks / Trade-offs

- [The README instructs a path the user must translate to their own checkout] → The placeholder path is explicit, and the prerequisite ("start it from the GitLab project you want to inspect") explains why the working directory matters.
- [Hand-edited `bun.lock` could drift from `package.json` further] → Only the workspace name line changes; a parse check confirms the new name, and `bun test` plus `tsc --noEmit` still pass. The pre-existing `typescript` peer drift is reported, not fixed here.
- [`bun start` is easy to reach for and can silently inspect the wrong project] → The README states that `bun start` only resolves inside the glabscope checkout and names the absolute entrypoint as the way to inspect another project.
- [Documentation drifts as the TUI changes] → Every documented key and command was checked against source in this change; the same check belongs to any later change that alters screens or `glab` usage.
- [A later `install-as-command` change replaces the Run section] → Accepted: that change owns its README update, and superseding a documented launch route is the improvement it exists to make.

## Migration Plan

Single-commit-scoped, repo-local change: package name and lockfile entry, then the README. Rollback is `git revert`; there is no deployed artifact, published package, or stored data to migrate.

## Open Questions

- The public repository URL is unknown until the repository is published, so the README carries no clone URL yet; adding one is a one-line change that alters no requirement or approach.
