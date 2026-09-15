## Why

The new in-panel loading line is easy to miss against active pipeline and graph content. Navigation should retain the visual focus of the former loading overlay without obscuring the frame’s identity or available keys.

## What Changes

- Add a dimmed overlay over only the content area of framed pipeline-list and job-graph screens while navigation is loading.
- Keep the rounded border, title, footer help, loading label, and animated spinner visible.
- Retain the existing duplicate-confirm guards and loading completion/error behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pipeline-list`: loading feedback gains a dimmed in-panel overlay while a job graph opens.
- `job-graph`: loading feedback gains a dimmed in-panel overlay while a job log opens.

## Impact

- `src/app.tsx` panel and loading presentation only.
- `src/app.test.tsx` frame/color assertions.
- No GitLab commands, model transitions, keybindings, or dependencies change.

## Non-goals

- No fullscreen overlay or terminal-wide dimming.
- No true terminal blur, theme system, or changes to the four status buckets.
- No changes to navigation, polling, or trace behavior.
