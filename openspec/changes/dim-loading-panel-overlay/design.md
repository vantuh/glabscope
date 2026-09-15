## Context

See `proposal.md` for motivation. `ScreenPanel` currently draws its border, title, body children, and footer in one box; `LoadingIndicator` is an inline animated text child. The previous fullscreen overlay showed the desired dimmed focus but covered all terminal content.

## Goals / Non-Goals

**Goals:**
- Dim the body of a loading list or graph while retaining the panel’s chrome and spinner.
- Keep the existing animation, navigation guards, and loading lifecycle.

**Non-Goals:**
- No terminal-wide overlay or true blur.
- No change to `glab ci list -F json`, GraphQL polling, `glab ci trace`, model state, or navigation.

## Decisions

### 1. Make the panel body the overlay boundary
Split `ScreenPanel` into chrome and a flex-grown, relatively positioned content body. Render the loading overlay absolutely within that body, with a translucent dark background and centered spinner text. The border, title, and footer remain siblings outside the body, so they are not dimmed.

Alternative: use the old root-level overlay. Rejected because it dims chrome and violates the requested boundary.

### 2. Reuse the existing spinner lifecycle
Keep the existing interval-based braille animation and cleanup, changing only its presentation from inline text to the body overlay. The list and graph pass the relevant loading state as they do today.

Alternative: add a separate panel-loading state. Rejected because navigation state already distinguishes both transitions and guards duplicate confirms.

## Risks / Trade-offs

- [Translucency support differs by terminal renderer] → use OpenTUI’s existing alpha background rendering and assert the overlay is bounded by the panel body in frame tests.
- [Short panels leave little visible body] → preserve title/footer and center the spinner in the available body.

## Migration Plan

Local TUI-only visual change. Restart the app to pick it up; revert the commit to restore the inline indicator.
