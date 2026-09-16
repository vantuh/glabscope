# glabscope

A terminal UI for GitLab CI pipelines, built on the official [`glab`](https://gitlab.com/gitlab-org/cli) CLI.

Pick a pipeline from the repository you are standing in, walk its job dependency graph, stream a job's log live, and retry a failed job or run a waiting manual job — without opening the GitLab web UI. Every GitLab call goes through `glab`, so glabscope reuses the login and the git remote you already have. There is no token prompt and no second API client.

## Features

- **Pipeline list** for the current working tree: id, status, name, and age, with human names for branches, tags, and merge requests. Status color falls into four buckets — success, failed, running-or-pending, other — and each row shows a status icon beside the status word.
- **Job dependency graph**: one card per job, grouped into stage columns, with arrows drawn from the `needs` GitLab actually reports (never invented from stage order). A retried job keeps a single card showing its latest attempt. Trigger and bridge jobs appear as ordinary cards.
- **Attempts list** for a job that was retried, so you can open the log of any earlier attempt.
- **Live job logs**: glabscope runs `glab ci trace` for the job, so you watch the same live trace glab prints, with GitLab's ANSI colors (standard, bright, and 256-color) intact. When the job or the trace process ends, the captured buffer stays on screen until you leave.
- **Job actions**: retry a failed or canceled job from the graph, the attempts list, or a job's log, and run a waiting manual job from the graph. Each action asks for confirmation and re-checks the job's status before it reaches GitLab.
- **Automatic refresh** that polls every few seconds while a pipeline is active and slows to a quiet watch interval once it is finished, backing off when GitLab rate-limits it. `r` forces a one-shot refresh on the list and the graph.

## Prerequisites

- [Bun](https://bun.com) — the runtime and package manager.
- [`glab`](https://gitlab.com/gitlab-org/cli) on `PATH`, already authenticated (`glab auth login`, `glab auth status`).
- A git working tree whose remote `glab` resolves to a GitLab project.
- A terminal with a [Nerd Font](https://www.nerdfonts.com/): the status icons are Nerd Font glyphs, and a plain font renders them as boxes.

Missing `glab`, a missing login, or a directory with no GitLab remote is an error shown on screen, not an empty pipeline list.

## Setup

```bash
bun install
```

## Run

Start glabscope **from the GitLab project you want to inspect**, so `glab` resolves that project:

```bash
cd /path/to/your-gitlab-project
bun /path/to/glabscope/src/index.tsx
```

`bun start` works only inside the glabscope checkout, because that is where the script lives; it then inspects whatever GitLab project the checkout itself points at. Use the absolute entrypoint above when the project you want to inspect is somewhere else.

Set `GLAB_BIN` if `glab` is not the binary on `PATH` that you want to use.

## Install as a command

Building glabscope into a standalone binary makes it a command you can start from any GitLab project, without typing this checkout's path:

```bash
bash scripts/install.sh      # or: bun run install:local
```

The script builds `dist/glabscope` and symlinks it into `PREFIX`, which defaults to `~/.local/bin`. Set `PREFIX` to install somewhere else:

```bash
PREFIX=~/bin bash scripts/install.sh
```

If the target directory is not on `PATH`, the installer still succeeds and prints the line that adds it:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add that line to your shell profile to keep it. `bun` must be installed to build the binary. `glab` is needed only at run time, so a missing `glab` is a warning rather than a failure. Running the installer twice is safe: it leaves exactly one entry pointing at the current build.

The installed command carries the Bun runtime and OpenTUI's native library, so it needs neither Bun nor this project's `node_modules` — only `glab` on `PATH` and a GitLab-bound working tree. It keeps the binding rule above: the project comes from the directory you launch it in, and no project is carried from one run to the next. Because the compiled binary runs in production mode, the React development warnings you may see under `bun start` are not printed by it.

Update it after a `git pull` by rebuilding. The installed entry points at the build output rather than a copy of it, so no reinstall is needed:

```bash
git pull && bun run build
```

When a build fails, the installer removes its own entry instead of leaving the command running a binary that build did not produce. Fix the build and run the installer again to restore the command.

Remove it with:

```bash
bash scripts/uninstall.sh    # or: bun run uninstall:local
```

The uninstaller removes the entry only when it is a symlink to this project's build output. A regular file, a directory, or a link that points somewhere else is refused with a non-zero exit and left untouched, and nothing inside the project — `dist/` included — is deleted.

Installing is macOS arm64 only for now: the installer builds for the host platform and does not cross-compile.

### When the project moves or is deleted

The installed entry resolves through this directory, so moving the clone leaves `glabscope` a dangling link: the command fails loudly and never runs a different program in its place. Repair it by running the installer from the new location:

```bash
bash scripts/install.sh
```

If you delete the clone outright, the installer goes with it and removing the leftover link is a manual step:

```bash
rm ~/.local/bin/glabscope
```

## Controls

| Screen | Keys |
| --- | --- |
| Pipeline list | `↑`/`↓` move · `enter` open the job graph · `r` refresh · `o` open in the browser |
| Job graph | `←`/`↑`/`↓`/`→` move focus (`↑`/`↓` inside a stage, `←`/`→` across stages) · `enter` open the log, or the attempts list when the job has earlier attempts · `r` refresh · `ctrl+r` retry/run the focused job · `o` open in the browser · `esc` back to the list |
| Attempts | `↑`/`↓` move · `enter` open that attempt's log · `ctrl+r` retry the focused attempt · `o` open in the browser · `esc` back to the graph |
| Job log | drag with the mouse to copy the selection · `y` copy the whole captured log · `ctrl+r` retry the traced job · `o` open in the browser · `esc` back (the chrome marks the trace `live` or `ended`) |
| Confirmation prompt | `enter` confirm · `esc` cancel — every other key is ignored while it is open, except `q`, which still quits |
| Any screen | `q` quit |

`ctrl+r` acts only where it can: failed and canceled jobs can be retried, a waiting manual job can be run (from the graph), and trigger or bridge jobs are left alone. The reason is shown on screen when the focused job does not qualify.

## How it works

glabscope is a thin TUI over `glab`, one process per call:

| What | glabscope runs |
| --- | --- |
| Pipeline list | `glab ci list -F json` |
| Jobs, statuses, `needs`, stages | `glab api graphql` (REST pipeline jobs carry no `needs`, and `.gitlab-ci.yml` is never parsed) |
| Job log | `glab ci trace <job-id>` |
| Retry a job | `glab ci retry <job-id>` |
| Run a waiting manual job | `glab ci trigger <job-id>` |

Screens nest as pipeline list → job graph → attempts list (only for a retried job) → job log, and `esc` walks back out. Selecting a pipeline opens that pipeline, not the latest one on the branch. Polling pauses while a log is open and resumes when you go back.

## Not included

Artifacts, merge-request and YAML views, canceling a running job, and following a bridge job into its child pipeline.

## Development

```bash
bun test
./node_modules/.bin/tsc --noEmit
```

## Disclaimer

glabscope is an unofficial, personal project. It is not affiliated with, endorsed by, or supported by GitLab, and it talks to GitLab only through the official `glab` CLI: bring your own GitLab account and your own `glab` login.
