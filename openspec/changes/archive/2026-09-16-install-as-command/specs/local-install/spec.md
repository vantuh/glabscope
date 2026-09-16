## Purpose

Makes this viewer a first-class command on the operator's machine — installed, updated, and removed without touching the project's source or the operator's shell configuration by hand — so it can be started in any GitLab working tree instead of only from a remembered path.

## ADDED Requirements

### Requirement: The command is installed on PATH

After the operator runs the installer, the command `glabscope` SHALL resolve on `PATH` and start the viewer. The installer SHALL place the entry in the directory named by `PREFIX`, defaulting to `~/.local/bin`, and SHALL write nothing outside that directory and the project. When the target directory is not on `PATH`, the installer SHALL still complete, SHALL say that the directory is missing from `PATH`, and SHALL print the line that adds it.

#### Scenario: Default install on a PATH directory

- **WHEN** the operator runs the installer with the default target directory and that directory is on `PATH`
- **THEN** `glabscope` resolves to this project's build and starts the viewer

#### Scenario: Target directory not on PATH

- **WHEN** the target directory is not on `PATH`
- **THEN** the install completes, and the installer prints both the notice that the directory is not on `PATH` and the line that adds it permanently

#### Scenario: Custom target directory

- **WHEN** the operator sets `PREFIX` to another absolute directory
- **THEN** the entry lands in that directory, and nothing is written to the default target directory

### Requirement: The installed command is self-contained at run time

The installed command MUST run without Bun, without the project's dependencies, and without any companion file next to the binary. At run time it MUST require only `glab` on `PATH` and the working tree it was launched from.

#### Scenario: Run without the project toolchain

- **WHEN** the operator removes the project's dependencies, or Bun is not available, and runs the command from a GitLab-bound working tree
- **THEN** the pipeline list appears

#### Scenario: No companion library file

- **WHEN** the install has completed
- **THEN** the build output directory contains the command binary alone, the viewer's native library is not present as a separate file, and the command runs

#### Scenario: glab missing at run time

- **WHEN** `glab` is not on `PATH` when the operator runs the command
- **THEN** the viewer shows its existing missing-`glab` error, not an install-specific failure

### Requirement: Installing is idempotent

The installer SHALL succeed whether or not the command is already installed, SHALL create the target directory when it does not exist, and SHALL leave exactly one entry pointing at the current build.

#### Scenario: Second run

- **WHEN** the operator runs the installer twice in a row
- **THEN** both runs report success, exactly one entry exists, and it points at the current build

#### Scenario: Target directory does not exist yet

- **WHEN** the target directory does not exist
- **THEN** the installer creates it and installs into it

#### Scenario: Entry already points somewhere else in this project

- **WHEN** an entry for this command already exists and points at an older build of this project
- **THEN** the installer replaces it so it points at the current build, with one entry remaining

### Requirement: Rebuilding updates the installed command

The installed entry SHALL resolve to the project's build output rather than to a copy of it, so that rebuilding after a project update changes what the command runs without reinstalling.

#### Scenario: Rebuild alone is enough

- **WHEN** the operator rebuilds the viewer and runs the command, without running the installer
- **THEN** the newly built viewer runs

#### Scenario: Build output replaced

- **WHEN** the build output file is replaced by a rebuild
- **THEN** the installed entry still resolves to it and the command still works

### Requirement: Installer prerequisites and build failure

The installer MUST NOT modify anything when a prerequisite needed to build is missing: it SHALL report the missing prerequisite and exit non-zero. A missing `glab`, which is needed only at run time, SHALL be reported as a warning and SHALL NOT fail the install. When the build fails, the installer SHALL exit non-zero and SHALL NOT leave the entry pointing at a stale or missing binary.

#### Scenario: Build tool missing

- **WHEN** Bun is not available
- **THEN** the installer reports the missing prerequisite, exits non-zero, and leaves the target directory as it was

#### Scenario: glab missing at install time

- **WHEN** `glab` is not on `PATH` while installing
- **THEN** the installer warns, still completes, and exits zero

#### Scenario: Build fails

- **WHEN** the build fails
- **THEN** the installer reports the failure, exits non-zero, and does not install an entry that would run a missing or stale binary

### Requirement: Uninstall removes only this project's entry

The uninstaller SHALL remove the installed entry only when it is a symbolic link whose target is this project's build output. It MUST NOT delete a regular file, a directory, or a link that resolves elsewhere: for those it SHALL report why and exit non-zero without deleting anything. When no entry exists at all, it SHALL report that and exit zero. The uninstaller SHALL NOT remove or modify anything inside the project, the build output included, and SHALL NOT touch any other file in the target directory.

#### Scenario: Normal removal

- **WHEN** the entry is this project's link to its build output
- **THEN** the entry is removed, nothing else changes, and the uninstaller exits zero

#### Scenario: Link target already missing

- **WHEN** the entry is this project's link but the build output it names no longer exists
- **THEN** the entry is still removed and the uninstaller exits zero

#### Scenario: A regular file sits at that path

- **WHEN** a regular file exists at the entry path
- **THEN** it is left untouched, the uninstaller explains why it refused, and it exits non-zero

#### Scenario: A link into another location

- **WHEN** the entry is a symbolic link whose target is not this project's build output
- **THEN** it is left untouched, the uninstaller explains why it refused, and it exits non-zero

#### Scenario: Nothing installed

- **WHEN** nothing exists at the entry path
- **THEN** the uninstaller reports that nothing is installed and exits zero

#### Scenario: The project survives an uninstall

- **WHEN** the operator uninstalls
- **THEN** the project directory and its build output are unchanged, and running the installer again restores a working command

### Requirement: A moved or deleted project is diagnosable and repairable

When the project directory moves, the installed entry MUST NOT silently run a different program. The operator SHALL be able to restore the command by running the installer from the project's new location. When the project is deleted outright, the leftover entry SHALL fail loudly rather than run anything in its place.

#### Scenario: Project moved

- **WHEN** the project directory has been moved
- **THEN** invoking the command fails as a broken or missing command, no other program runs in its place, and running the installer from the new location restores a working command

#### Scenario: Project deleted

- **WHEN** the project directory has been deleted along with the installer
- **THEN** the leftover entry fails loudly and removing it is a manual step that the documentation names

### Requirement: Installation preserves the working-tree binding

The installed command SHALL derive its GitLab project from the working tree it is launched in, exactly as the viewer does when run from source. Installation MUST NOT add a project argument or flag, MUST NOT carry a project between runs, and MUST NOT change the errors shown for a missing `glab` or an unresolvable working tree.

#### Scenario: Bound to the launch directory

- **WHEN** the operator runs the command from a GitLab-bound working tree
- **THEN** the viewer shows that project's pipelines

#### Scenario: Launched outside a resolvable working tree

- **WHEN** the operator runs the command from a directory that `glab` cannot resolve to a GitLab project
- **THEN** the viewer shows its existing error and does not present an empty pipeline list as success

#### Scenario: Two projects in turn

- **WHEN** the operator runs the command from one GitLab project and then from another
- **THEN** each run shows its own project's pipelines, with no project carried over from the previous run
