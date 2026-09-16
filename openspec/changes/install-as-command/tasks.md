## 1. Build command

- [ ] 1.1 Add `"build": "bun build --compile src/index.tsx --no-compile-autoload-dotenv --outfile dist/glabscope"` to the `scripts` block in `package.json`; verify with `bun run build` exiting 0, `ls -lh dist/glabscope` showing roughly 71 MB, and `git status --porcelain` still not listing `dist/` (it is already in `.gitignore`).
- [ ] 1.2 Verify the built artifact carries no external native library: `otool -L dist/glabscope` lists only system libraries (`libSystem`, `libc++`, `libicu`, `libresolv`) with no path into `node_modules` or `/opt/homebrew`; record the actual output.
- [ ] 1.3 Verify the artifact runs and that `.env` autoloading is really off: start `dist/glabscope` from a scratch directory whose `.env` sets `GLAB_BIN=/bin/false` (use `script -q <log> ./dist/glabscope` so it has a PTY, then kill it after a few seconds); the captured output must show the framed `Not a git repository` error and must NOT show the missing-`glab` message — with dotenv autoloading on, the second is what would appear.

## 2. Installer

- [ ] 2.1 Write `scripts/install.sh`: resolve the project root from the script's own location, default `PREFIX=${PREFIX:-$HOME/.local/bin}`, fail with a non-zero exit before touching anything when the build tool is missing, warn without failing when `glab` is missing, run `bun run build`, `mkdir -p "$PREFIX"`, `ln -sf "$ROOT/dist/glabscope" "$PREFIX/glabscope"`, then print the `PATH` line when `$PREFIX` is not on `$PATH`; verify with `PREFIX=$(mktemp -d) bash scripts/install.sh` exiting 0 and `ls -l "$PREFIX/glabscope"` showing the link into this project's `dist/`.
- [ ] 2.2 Verify idempotence and the custom target: run the same command a second time and confirm exit 0 with exactly one entry remaining (`ls -1 "$PREFIX" | wc -l` is 1) and the link still pointing at this project's build; then run `PREFIX=$(mktemp -d)/nested bash scripts/install.sh` and confirm the nested directory is created and the link lands there.
- [ ] 2.3 Verify the missing-prerequisite refusal: run `env PATH=/usr/bin:/bin bash scripts/install.sh` with a temp `PREFIX` and confirm a non-zero exit, a message naming the missing build tool, and that the target directory was left without an entry. The default `PATH` cannot be used for this check, since it always contains the build tool.
- [ ] 2.4 Verify the `glab` warning is not fatal: run the installer with the build tool's directory on `PATH` but `glab`'s directory removed (for example `env PATH="$HOME/.bun/bin:/usr/bin:/bin" bash scripts/install.sh`) and confirm the warning appears, the exit code is 0, and the entry is installed.
- [ ] 2.5 Verify a failed build leaves nothing pointed at a stale binary: temporarily set the `build` script in `package.json` to a command that exits non-zero, run the installer with a temp `PREFIX` against a target directory that already holds a link to a *deleted* artifact (`rm dist/glabscope` first), confirm the installer exits non-zero and reports the failure, then restore the `build` script and re-run to a clean state.

## 3. Uninstaller

- [ ] 3.1 Write `scripts/uninstall.sh`: `PREFIX=${PREFIX:-$HOME/.local/bin}`, resolve the project root the same way, read the entry with `readlink`, compare the target text against `"$ROOT/dist/glabscope"`, remove the entry only on a match, refuse with a non-zero exit and a reason for a regular file, a directory, or a link elsewhere, and report-and-exit-zero when nothing exists at that path; verify each of those five cases against a temp `PREFIX` and record the five exit codes.
- [ ] 3.2 Verify the dangling-link case: install into a temp `PREFIX`, delete `dist/glabscope`, run the uninstaller, and confirm it removes the entry and exits 0; then run `bun run build` again and reinstall so the checkout is left in a working state.
- [ ] 3.3 Verify the uninstaller leaves the project alone: after an uninstall, confirm `git status --porcelain` lists no change under `dist/` or `scripts/` and that `PREFIX=$(mktemp -d) bash scripts/install.sh` restores a working entry.

## 4. Script coverage

- [ ] 4.1 Add `scripts/install.test.ts` running both scripts through `Bun.spawn` with `PREFIX` always set to a fresh temporary directory (never the default, so the test cannot touch the operator's real `~/.local/bin`): cover the created link, the second run leaving exactly one entry, the uninstall refusal against a regular file, the refusal against a foreign symlink, the clean removal, and the empty case; verify with `bun test scripts/install.test.ts` green and `echo $?` recording the exit code.
- [ ] 4.2 Verify the test actually fails when a guard is broken: temporarily change the compared target in `scripts/uninstall.sh` (for example append a character), confirm `bun test scripts/install.test.ts` goes red naming the refusal case, then revert and confirm green again.

## 5. Documentation

- [ ] 5.1 Add an install section to `README.md` covering: `bash scripts/install.sh` (and `bun run install:local`), the `PREFIX` default and the `PATH` line, the update recipe `git pull && bun run build`, `bash scripts/uninstall.sh`, the accepted failure mode where moving the clone leaves a dangling link repaired by re-running the installer from the new location, the manual `rm` needed when the clone is deleted outright, and the current scope (macOS arm64, host platform only); verify that every command quoted matches the scripts and `package.json` (`grep` each one against the files) and that the existing "Run" section still describes `bun start` accurately.
- [ ] 5.2 Verify the documented install path end-to-end by following the README literally in a fresh shell: `bash scripts/install.sh`, then `command -v glabscope` printing the installed path, then `bash scripts/uninstall.sh`, then `command -v glabscope` printing nothing; record the two outputs.

## 6. Integration verification

- [ ] 6.1 Run `bun test` and `./node_modules/.bin/tsc --noEmit` and confirm both are green against the baseline measured before this change (249 passing, 0 failing, 20 files, 8.47 s; clean type check) plus the new `scripts/install.test.ts` cases; record the actual counts and any delta, and state the new file count.
- [ ] 6.2 Operator check in a GitLab-bound working tree, because this checkout has no git remote and cannot bind to a project: install the command, run `glabscope` from a GitLab project and confirm the pipeline list appears, then `rm -rf node_modules` and run it again from the same project to confirm the command still works, then run it from a second GitLab project to confirm the project follows the working tree, then run it from a directory that is not a GitLab project and confirm the existing error appears; record the observed outcome in this change, or state it as not run.
