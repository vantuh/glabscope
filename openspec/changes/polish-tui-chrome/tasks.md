## 1. Chrome shell

- [ ] 1.1 Add muted chrome tokens (border/title `#4b5563`, help `#9ca3af`) and a small titled/bordered panel helper (`border`, `borderStyle="rounded"`, `title`, dim footer, flex-grown children) in `src/app.tsx` or `src/chrome.tsx` if the JSX repeats — verify a unit/render test of the helper’s `captureCharFrame()` includes a rounded-box character and the title string
- [ ] 1.2 Wrap the boot screen in that panel (`title` ≈ `startup`, checking-glab message inside) and verify `src/app.test.tsx` still finds the checking message and `q` still quits, and the frame includes the startup title

## 2. Screens

- [ ] 2.1 Wrap the error screen in the same panel (`title` ≈ `error`, red on the message only, keymap in the dim footer) — verify a render/test of the error chrome includes the frame title and keeps `#ef4444` on the message, not as the border color
- [ ] 2.2 Wrap the pipeline list: drop the loose header `<text>`, title `pipelines`, rows in the inner `scrollbox`, keys in the footer — verify a captured list frame (helper with fake rows if `App` cannot be stubbed) shows the title, a box border around the rows, and no duplicate header line above the frame
- [ ] 2.3 Wrap the job graph: title includes pipeline iid; truncation warning inside the panel above the job `scrollbox`; keys in the footer — verify a captured graph frame includes the iid in the title and the truncation warning inside the bordered area when truncated
- [ ] 2.4 Wrap the job log: title includes job name; footer `live · esc back` vs `ended · esc back`; trace only in the inner `scrollbox` — verify captured live and ended frames show those chrome strings and the trace/waiting text inside the border, not on the same row as the keys

## 3. Coexistence and suite

- [ ] 3.1 If `add-navigation-loading-spinner` is already on the branch, keep its loading line inside the framed panel (title or a line under the title) and verify loading text still appears without dropping the border
- [ ] 3.2 Run `bun test` and confirm the full suite passes, including `src/app.test.tsx`
