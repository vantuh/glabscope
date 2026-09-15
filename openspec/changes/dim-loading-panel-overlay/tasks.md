## 1. Panel body overlay

- [x] 1.1 Split the framed panel into chrome and a flex-grown overlay boundary; render the existing animated spinner in a translucent, centered body overlay only while navigation is loading — verify captured list and graph frames retain their border, title, and footer while the body is dimmed

## 2. Verification

- [x] 2.1 Update loading-frame tests to assert the overlay is bounded by the panel body, retains spinner animation and underlying list/graph content, and does not dim the title or footer — verify `bun test src/app.test.tsx` passes
- [x] 2.2 Run `bun test`, `bunx tsc --noEmit`, and `openspec validate "dim-loading-panel-overlay" --strict` — verify all complete successfully
