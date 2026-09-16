## Why

The only way to start this tool today is to `cd` into a GitLab project and type `bun /path/to/glab-pipeline-viewer/src/index.tsx`. The path is long and machine-specific, the clone has to keep its name and location for that command to keep working, and Bun plus `node_modules` must stay installed forever. The tool is something the operator has to remember how to invoke instead of something the system knows how to run.

## What Changes

- New `scripts/install.sh`: builds the app into a standalone native binary at `<repo>/dist/glabscope` with `bun build --compile`, then symlinks it into a bin directory on `PATH` (`PREFIX`, default `~/.local/bin`). Idempotent, no `sudo`, and it writes nothing outside the project and that bin directory.
- New `scripts/uninstall.sh`: removes that symlink, and only when it points at this project's build. A regular file, a symlink into somewhere else, or a missing entry never gets deleted; `dist/` stays in place.
- New `scripts/install.test.ts`: exercises both scripts against a temporary `PREFIX`, including the refusals.
- `package.json` gains `build`, `install:local`, and `uninstall:local` scripts. `start` and `test` are unchanged, and nothing is named `install`, because npm and Bun treat that key as a lifecycle hook.
- `README.md` gains an install section stating the update recipe (`git pull && bun run build`) and the known failure mode: move the project and the symlink dangles until the installer is re-run from the new location.
- The installed command keeps today's binding rule: the project comes from the working tree that `glab` resolves, and `glab` must be on `PATH`. No project argument, cached project, or token prompt is added.

## Capabilities

### New Capabilities

- `local-install`: how the command `glabscope` gets installed, updated, and removed on this machine, and the run-time guarantees that installation must preserve.

### Modified Capabilities

None. `pipeline-list`'s "Project comes from the working tree" keeps holding for the installed command rather than changing.

## Impact

- `package.json`, new `scripts/install.sh`, `scripts/uninstall.sh`, `scripts/install.test.ts`, `README.md`.
- New build output `dist/glabscope` (~71 MB, already ignored by `.gitignore`). No `src/` change, no new dependency, no change to any `glab` invocation.
- The binary carries both the Bun runtime and OpenTUI's native library, so the installed command needs neither Bun nor `node_modules` — only `glab`. Verified by a spike on Bun 1.4.2: the build took 0.15 s and the result ran from an unrelated working directory with its native library embedded.
- macOS arm64 for now: the installer builds for the host platform and does not cross-compile.

## Non-goals

- npm publishing, GitHub/GitLab releases, a Homebrew tap, code signing, and cross-compilation for other platforms or architectures.
- A versioned install directory, atomic upgrades, or rollback. A moved project leaving a dangling symlink is accepted, not prevented.
- Any change to how the app finds its GitLab project, or to its screens, keys, or polling.
