# glab-pipeline-viewer

Personal terminal UI for GitLab pipelines on top of [`glab`](https://gitlab.com/gitlab-org/cli). Nested screens: pipeline list → job-dependency graph → job log.

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

Keys: `q` quits, arrows move, Enter drills in, Esc goes back (log → graph → list).
