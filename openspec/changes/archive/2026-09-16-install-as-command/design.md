## Context

See `proposal.md` - Why. The viewer is started today as `bun src/index.tsx` (`package.json` `start`), so the "install" surface is a long absolute path that the operator types from inside whichever GitLab project they want to inspect.

Facts this design leans on, all verified against this checkout:

- The entry point is `src/index.tsx`: `createCliRenderer()` plus `createRoot(renderer).render(<App />)`. Nothing in `src/` reads a file from the project tree at run time; every GitLab read goes through `Bun.spawn(["glab", ...], { cwd: process.cwd() })` (`src/glab/run.ts`, `src/glab/probe.ts`, `src/glab/trace.ts`). `src/fixtures/*.json` is imported by tests only.
- The native dependency is `@opentui/core-darwin-arm64/libopentui.dylib` (5.3 MB), loaded through `bun:ffi` `dlopen`. On the Bun path, `@opentui/core-darwin-arm64/index.bun.js` resolves it as `import("./libopentui.dylib", { with: { type: "file" } })`, and `chunk-bun-*.js` handles the resulting `$bunfs` path (`isBunfsPath`, `resolveNativeLibraryPath`).
- OpenTUI documents `bun build --compile` as a supported format and states that `OTUI_ASSET_ROOT` is not needed for it ([standalone-executables](https://opentui.com/docs/reference/standalone-executables/)).
- Spike on this machine (Bun 1.4.2, macOS 27 arm64): `bun build --compile src/index.tsx --no-compile-autoload-dotenv --outfile <out>` succeeded in 150 ms total (`[42ms] bundle 57 modules`, `[90ms] compile`), produced 71 MB, `otool -L` showed only system libraries, and the binary rendered its frames and reached the spec'd error screen when started from `/tmp`. So the embedded-dylib `dlopen` from `$bunfs` works on this Bun version; the open regression reports around `bun:ffi` + `--compile` (#30717, #30962) did not reproduce here.
- The operator's machine already keeps commands as symlinks in `~/.local/bin` (including symlinks into a dotfiles repo) and `~/.local/bin` is on `PATH`. `glabscope`, `glab-scope`, `gpv`, and `pipelines` are all free.
- `openspec/specs/pipeline-list` fixes "Project comes from the working tree", and the config context fixes `glab` on `PATH` as the only GitLab I/O. This change adds no GitLab read at all: it names no new `glab` command and leaves `glab ci list`, `glab api graphql`, `glab ci trace`, `glab ci retry`, and `glab ci play` untouched.

## Goals / Non-Goals

**Goals:**

- One command, `glabscope`, that starts the viewer in the working tree it is launched from.
- An installed command that outlives the project's `node_modules`, the operator's Bun install, and any future rebuild of the viewer.
- An uninstall path that cannot damage a file the operator did not create through this installer.
- Two small scripts and one test, with no change to `src/`.

**Non-Goals:**

- Distributing the binary to other machines, or building for a platform other than the host.
- Making the installer idempotent against a *moved* project: moving the clone breaks the entry by design, and re-running the installer is the repair.
- Adding an argument surface to the viewer (a project flag, a `--version` flag, flags forwarded to `glab`).
- Replacing `bun start` as the development path.

## Decisions

### Ship a compiled standalone binary, not a link to the source

`bun build --compile src/index.tsx --outfile dist/glabscope` produces one file that contains the app, the Bun runtime, and the native OpenTUI library. The installed command is worth more than a launcher because it survives `rm -rf node_modules` and does not depend on which Bun version is installed later.

Alternatives:

- **`"bin": { "glabscope": "src/index.tsx" }` plus `bun link`** — a shim in `~/.bun/bin` that resolves the repo and runs it with Bun. Live-linked, so `git pull` alone updates it, and no 71 MB artifact. Rejected because it keeps Bun and `node_modules` as run-time requirements and couples the command to Bun's global-link layout, buying nothing the symlink does not already give.
- **A `#!/bin/sh` wrapper that `exec`s `bun <repo>/src/index.tsx`** — same coupling, plus one more indirection to read.
- **Copying the binary instead of linking to it** — see the next decision.

### Install by symlink into the build output, and accept the dangling link

The entry is `ln -sf <repo>/dist/glabscope <PREFIX>/glabscope`, so a rebuild is picked up with no reinstall, and a dead entry is one visible `ls -l` away. The operator explicitly accepted that moving the clone leaves a dangling link; the alternative — a versioned `~/.local/share/<name>/<version>/` plus a stable symlink — buys atomic upgrades and rollback for a single-user personal tool that has no CI, no releases, and no second machine.

Consequence to keep in plain sight: with this layout the project directory is a run-time dependency of the command, because the symlink resolves through it. That is the price of "rebuild and it just runs", and it is why the specs require the failure to be loud and the repair to be an installer run from the new location.

### The build command lives in `package.json`, the installer calls it

`package.json` gains `"build": "bun build --compile src/index.tsx --no-compile-autoload-dotenv --outfile dist/glabscope"`, and `scripts/install.sh` runs `bun run build` instead of repeating the flags. One place defines the artifact; `bun run build` alone is a usable command for the rebuild-only update path.

`--no-compile-autoload-dotenv` is not decoration: `bun build --compile` enables `.env` autoloading in the produced binary by default, so without the flag `glabscope`, launched inside a GitLab project that happens to have a `.env`, would import that project's variables into the viewer's process. The other compile defaults are already the ones we want — `--compile-autoload-tsconfig` and `--compile-autoload-package-json` are off, so the installed command does not read the launch directory's `tsconfig.json` or `package.json`.

Note that `--compile` implies `--production`, so the compiled binary runs React in production mode and prints no development warnings. `bun start` keeps the development behavior; the difference is documented rather than removed, since the operator only sees it if they debug the installed command.

### Two independent scripts, in shell

`scripts/install.sh` installs and `scripts/uninstall.sh` removes. They share no code: the install path is "build, then link", the uninstall path is "verify the link, then remove it", and the only logic worth sharing is the link verification, which exists in exactly one of them.

Kept in shell rather than TypeScript run by Bun because the scripts consist of `PREFIX` defaulting, a capability probe for `glab`, `bun run build`, `mkdir -p`, `ln -sf`, `readlink`, and `rm` — all of which are already single shell commands, so a TypeScript rewrite would add indirection and a `spawnSync` wrapper around each one. The config context's "not shell scripts" line governs the TUI's implementation, not build tooling; the app itself stays TypeScript. `PREFIX=${PREFIX:-$HOME/.local/bin}` is the one piece of configuration, and it is what makes both scripts testable without root.

Neither script is named `install` in `package.json`: `install:local` and `uninstall:local` avoid npm's and Bun's `install` lifecycle hook, which would otherwise run during `bun install`.

### Uninstall decides from the link's target text, and refuses everything else

`scripts/uninstall.sh` reads the entry with `readlink` and compares it to the absolute path `<repo>/dist/glabscope`; it removes the entry only when the two match. Comparing the target *text* rather than resolving it is deliberate: it keeps a link whose build output was deleted (`rm -rf dist`) inside the removable case, while a link into another project, a regular file, or a directory all fail the comparison and are refused with a non-zero exit. A missing entry is not an error — the script reports it and exits zero, so the uninstaller is as idempotent as the installer.

Alternatives:

- **`rm -f <PREFIX>/glabscope` unconditionally** — the shortest possible script, and it deletes someone else's `glabscope` without asking. Rejected: the guard is five lines and the damage is unrecoverable.
- **Resolve with `readlink -f` / `-e` and compare resolved paths** — treats a dangling link as un-removable, so `rm -rf dist && uninstall` would leave the operator stuck with a manual `rm`. Rejected after the spec's "link target already missing" scenario.
- **One script with `--uninstall`** — fewer files, but it puts the destructive branch in the script the operator runs most often, for a savings of one small file.

### Name the command `glabscope`

It reads as a GitLab scope/viewer, it is short enough to type, and it is free on this machine. `glab-scope` was rejected: the dash form reads as a `glab` plugin, and every future GitLab CLI that adopts or re-acquires external `glab-*` subcommands would give the two names different meanings. The build output follows: `dist/glabscope`.

### Cover the scripts with one spawned test

`scripts/install.test.ts` runs both scripts through `Bun.spawn` with `PREFIX` set to a fresh temporary directory, and never with the default target: the test must not be able to touch the operator's real `~/.local/bin`. It covers the link creation, the second run leaving one entry, the custom `PREFIX`, the uninstall guard against a regular file and against a foreign link, the clean removal, and the empty case. The install cases compile the real binary into the repo's `dist/` — the same 71 MB artifact a manual build produces, at the measured ~0.15 s, so the added test time is dominated by the link checks, not by the build.

No network and no GitLab access is involved: the scripts only probe `glab --version`.

Alternative: **manual verification only**, matching the "record what the operator observed" style the polling change used for its timing claims. Rejected because the uninstall guard is the one branch whose failure is destructive, and it is exactly the branch that is cheap to test with a temp directory.

## Risks / Trade-offs

- [`bun:ffi` `dlopen` of an embedded library regresses in a future Bun, and `bun build --compile` starts producing a binary that cannot load OpenTUI] -> The failure is immediate and loud at launch, not silent. The recovery is documented in this change's notes: keep the binary and place the library beside it, pointing `OTUI_ASSET_ROOT` at a directory laid out as `@opentui/core-darwin-arm64/libopentui.dylib`; OpenTUI supports that root for exactly this case. Not implemented pre-emptively, because the spike shows it is unnecessary on the current Bun.
- [71 MB per build in `dist/`, rewritten on every `bun run build`] -> `dist/` is already in `.gitignore`, and the cost is disk on the operator's machine only. The rebuild is ~0.15 s, so re-running it is cheaper than caching anything.
- [The installed command needs the project directory to keep existing] -> Accepted by the operator, and covered by the spec's moved/deleted scenarios: the failure is a broken or missing command, never a different program running in its place.
- [`.env` autoloading silently pulled from the launch directory] -> Disabled at build time with `--no-compile-autoload-dotenv`, since the build command is the single definition of the artifact.
- [A test that builds an artifact can fail on a machine with a read-only or full `dist/`, taking the whole suite red for a packaging reason] -> The test reports the build failure with the script's own output, and the failure mode (cannot write the project's build output) is the same one the installer would hit, so it is a real signal rather than a false alarm.
- [The uninstaller's "this project's link" comparison hardcodes the artifact's path, so renaming `dist/glabscope` silently turns a valid entry into a refused one] -> The name appears once in `package.json`'s `build` script, once in each shell script, and once in the test; the test asserts a successful round-trip, so a rename that updates the build command alone fails the suite.

## Migration Plan

- **Rollout**: run `bash scripts/install.sh` (or `bun run install:local`) once from the clone. Nothing else changes: `bun start` and `bun test` keep working, and no shell configuration is rewritten — if `~/.local/bin` is not on `PATH`, the installer prints the line to add.
- **Update**: `git pull && bun run build`. The symlink already points at the artifact, so no reinstall is needed.
- **Rollback**: run `bash scripts/uninstall.sh`; the viewer remains usable as before via `bun start`, and `dist/` can be deleted freely. Pinning the older behavior means checking out the previous commit and rebuilding — no state is stored outside the project and the target directory.

## Open Questions

- Whether to build for Linux/x64 as well, and whether to publish the artifact (release asset, package registry) instead of keeping it on this machine. Deferrable: the specs describe the command's behavior, not its distribution channel, and cross-compilation would only add a target flag plus a second native-package install.
