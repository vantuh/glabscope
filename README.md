# glab-pipeline-viewer

Personal terminal UI for GitLab pipelines on top of [`glab`](https://gitlab.com/gitlab-org/cli). Nested screens: pipeline list → job-dependency graph → job log.

## Prerequisites

- [Bun](https://bun.com)
- [`glab`](https://gitlab.com/gitlab-org/cli) on `PATH`, already authenticated (`glab auth login`)
- Run from a git working tree whose remote `glab` can resolve to a GitLab project

There is no separate token prompt. Missing `glab`, a missing login, or a directory with no GitLab remote is an error, not an empty pipeline list.

## Run

```bash
bun install
bun start
```

Keys: `q` quits.
