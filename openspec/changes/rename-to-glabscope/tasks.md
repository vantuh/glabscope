## 1. Project Identity

- [x] 1.1 Change the root package name from `glab-pipeline-viewer` to `glabscope`, updating `bun.lock` only if it records that value; verify the package manifests parse and contain the new name while `private: true` remains unchanged

## 2. Public Documentation

- [x] 2.1 Rewrite `README.md` as a polished public landing page for glabscope with its pitch, current features, prerequisites, setup and launch instructions, controls, glab-based operation, and unofficial-project disclaimer; verify every documented command and key matches the current package scripts and application behavior

## 3. Verification

- [ ] 3.1 Search the active package metadata and README for the old project name, then run `bun test` and `./node_modules/.bin/tsc --noEmit`; verify the old identity is absent from current public-facing files and all available checks pass
