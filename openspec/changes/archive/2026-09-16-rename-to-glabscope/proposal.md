## Why

The project still presents itself as the personal, narrowly named `glab-pipeline-viewer`, even though it now supports interactive job actions in addition to viewing. Before publishing the repository, it needs a concise public identity and documentation that explains its value and use clearly.

## What Changes

- Rename the package and public project identity to `glabscope`.
- Replace the personal README with public-facing documentation covering the product pitch, features, prerequisites, setup, launch flow, controls, and `glab`-based architecture.
- State clearly that glabscope is an unofficial project built on the official `glab` CLI.
- Keep the package private because npm publication is not part of this change.

## Capabilities

### New Capabilities

None. This is a documentation and package-metadata change.

### Modified Capabilities

None. Runtime behavior and existing TUI requirements do not change.

## Impact

- `README.md`: rewritten for the `glabscope` public repository.
- `package.json`: package name changed to `glabscope`; other package settings remain unchanged.
- `bun.lock`: updated only if it records the root package name.
- No source code, dependencies, commands, keybindings, or GitLab interactions change.

## Non-goals

- Publishing an npm package or release artifact.
- Adding a global executable or installation method.
- Creating the remote repository or pushing commits.
- Renaming historical OpenSpec artifacts.
- Changing TUI behavior or visual design.
