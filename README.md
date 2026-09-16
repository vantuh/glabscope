# glab-pipeline-viewer

Personal terminal UI for GitLab pipelines on top of [`glab`](https://gitlab.com/gitlab-org/cli). Nested screens: pipeline list → job graph → job attempts (when a card was retried) → job log.

## Prerequisites

- [Bun](https://bun.com)
- [`glab`](https://gitlab.com/gitlab-org/cli) on `PATH`, already authenticated (`glab auth login`)
- Run from a git working tree whose remote `glab` can resolve to a GitLab project

There is no separate token prompt. Missing `glab`, a missing login, or a directory with no GitLab remote is an error, not an empty pipeline list.

## Run

Install once in this repo:

```bash
bun install
```

Start the TUI **from the GitLab project you want to inspect** (so `glab` sees that git remote). This clone has no GitLab remote, so `bun start` here will error on purpose.

```bash
cd /path/to/your-gitlab-project
bun /path/to/glab-pipeline-viewer/src/index.tsx
```

The job graph uses Nerd Font status icons, so run it in a terminal whose font is a Nerd Font (otherwise the glyphs render as tofu).

Keys: `q` quits, arrows move (up/down in a stage, left/right across stages), Enter drills in (job attempts when a card was retried, otherwise the log), `Ctrl+R` retries the focused failed or canceled job, Esc goes back (log → attempts if open → graph → list).
