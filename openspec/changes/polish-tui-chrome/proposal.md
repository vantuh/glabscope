## Why

Every screen is padding plus loose text on the default background, so the pipeline list, job graph, and job log read as one undifferentiated block. The operator asked for real TUI chrome—frames around the list and logs, and the same treatment elsewhere—without changing navigation or GitLab behavior.

## What Changes

- Give every screen a titled, bordered content panel instead of floating text.
- Put identity (screen name, pipeline iid, job name, live/ended) on the panel title; keep the keymap on a dim footer inside or just under the frame.
- Use a muted chrome color for borders and titles so the four status-bucket colors stay the only bright signals.
- Apply the same chrome to boot and error screens so they do not look like a different app.

## Capabilities

### New Capabilities
- `screen-chrome`: shared visual shell (bordered panel, title, muted chrome vs status colors) used by boot, error, list, graph, and log screens.

### Modified Capabilities
- `pipeline-list`: the selectable pipeline list MUST render inside the framed content panel, not as unframed rows on the root background.
- `job-graph`: the job graph MUST render inside the framed content panel, with pipeline identity on the chrome, not only as loose header text.
- `job-logs`: the job trace MUST render inside a framed scrollable log panel, with job identity and live/ended state on the chrome.

## Impact

- `src/app.tsx` layout only: OpenTUI `box` borders, titles, muted colors. No model, glab, polling, or keybinding changes.
- Tests that capture frames (`src/app.test.tsx` and any screen snapshots) will need to expect panel titles/borders.
- In-flight change `add-navigation-loading-spinner` also touches `src/app.tsx`; chrome must leave a place for a loading indicator without dropping frames.

## Non-goals

- No new GitLab actions, screens, or mouse support.
- No change to status-bucket colors, DAG layout, or `glab` commands.
- No full theme engine, config file, or alternate color schemes.
- No replacing OpenTUI/React/Bun.
