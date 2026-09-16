import { expect, test } from "bun:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ARTIFACT = join(ROOT, "dist", "glabscope");
const INSTALL = join(ROOT, "scripts", "install.sh");
const UNINSTALL = join(ROOT, "scripts", "uninstall.sh");

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(
  script: string,
  prefix: string,
  extraEnv: Record<string, string> = {},
): Promise<Result> {
  const proc = Bun.spawn(["bash", script], {
    cwd: ROOT,
    env: {
      ...process.env,
      // An isolated HOME as well as PREFIX, so that even a regression which
      // ignored PREFIX could not reach the operator's real ~/.local/bin.
      HOME: join(prefix, "home"),
      ...extraEnv,
      PREFIX: prefix,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = new Response(proc.stdout).text();
  const stderr = new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, stdout: await stdout, stderr: await stderr };
}

// Every case runs against a fresh temporary directory. The installer's default
// target is never used, so the suite cannot touch the operator's ~/.local/bin.
async function withPrefix<T>(fn: (prefix: string) => Promise<T>): Promise<T> {
  const prefix = await mkdtemp(join(tmpdir(), "glabscope-install-"));
  try {
    return await fn(prefix);
  } finally {
    await rm(prefix, { recursive: true, force: true });
  }
}

// A project-shaped temporary tree holding the real installer, a `bun` that
// always fails, and optionally a runnable file where the artifact would be. It
// lets the installer's failure paths run without touching this checkout's
// build output.
async function withFailingBuild<T>(
  artifact: "missing" | "runnable",
  fn: (project: string) => Promise<T>,
): Promise<T> {
  const project = await mkdtemp(join(tmpdir(), "glabscope-project-"));
  try {
    const bin = join(project, "bin");
    await mkdir(join(project, "scripts"), { recursive: true });
    await mkdir(bin);
    await copyFile(INSTALL, join(project, "scripts", "install.sh"));
    await writeFile(join(bin, "bun"), "#!/bin/sh\nexit 3\n");
    await chmod(join(bin, "bun"), 0o755);
    if (artifact === "runnable") {
      await mkdir(join(project, "dist"));
      await writeFile(join(project, "dist", "glabscope"), "#!/bin/sh\necho old\n");
      await chmod(join(project, "dist", "glabscope"), 0o755);
    }
    return await fn(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

// `bun` resolves to the failing stub, so only the project tree's own tools run.
function failingPath(project: string): string {
  return `${join(project, "bin")}:/usr/bin:/bin`;
}

test("the installer links the command into the target directory", () =>
  withPrefix(async (prefix) => {
    const result = await run(INSTALL, prefix);

    expect(result.code).toBe(0);
    expect(await readdir(prefix)).toEqual(["glabscope"]);
    expect(await readlink(join(prefix, "glabscope"))).toBe(ARTIFACT);
  }));

test("a second install leaves exactly one entry pointing at the build output", () =>
  withPrefix(async (prefix) => {
    expect((await run(INSTALL, prefix)).code).toBe(0);
    expect((await run(INSTALL, prefix)).code).toBe(0);

    expect(await readdir(prefix)).toEqual(["glabscope"]);
    expect(await readlink(join(prefix, "glabscope"))).toBe(ARTIFACT);
  }));

test("the installer replaces an entry that is a symlink to a directory in place", () =>
  withPrefix(async (prefix) => {
    const entry = join(prefix, "glabscope");
    const elsewhere = join(prefix, "elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, entry);

    const result = await run(INSTALL, prefix);

    expect(result.code).toBe(0);
    expect(await readlink(entry)).toBe(ARTIFACT);
    // Following the old link would have written the command into `elsewhere`.
    expect(await readdir(elsewhere)).toEqual([]);
  }));

test("the installer refuses a directory at the entry path", () =>
  withPrefix(async (prefix) => {
    const entry = join(prefix, "glabscope");
    await mkdir(entry);

    const result = await run(INSTALL, prefix);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("a directory is already there");
    // Nothing may be nested inside it either.
    expect(await readdir(entry)).toEqual([]);
  }));

test("installing through a symlinked path records the physical build output", () =>
  withPrefix(async (prefix) => {
    const alias = join(prefix, "alias");
    await symlink(ROOT, alias);

    const installed = await run(join(alias, "scripts", "install.sh"), prefix);

    expect(installed.code).toBe(0);
    expect(await readlink(join(prefix, "glabscope"))).toBe(ARTIFACT);
    // The entry installed through the alias is still recognised as ours when
    // the project is addressed by its physical path.
    const removed = await run(UNINSTALL, prefix);
    expect(removed.code).toBe(0);
    expect(await readdir(prefix)).toEqual(["alias"]);
  }));

test("a failed build drops our own entry instead of leaving it dangling", () =>
  withFailingBuild("missing", (project) =>
    withPrefix(async (prefix) => {
      // The installer resolves its own root physically, so the link it would
      // own is spelled with the physical path.
      await symlink(
        join(await realpath(project), "dist", "glabscope"),
        join(prefix, "glabscope"),
      );

      const result = await run(join(project, "scripts", "install.sh"), prefix, {
        PATH: failingPath(project),
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("build failed");
      expect(await readdir(prefix)).toEqual([]);
    }),
  ));

test("a failed build drops our entry even when the previous artifact still runs", () =>
  withFailingBuild("runnable", (project) =>
    withPrefix(async (prefix) => {
      await symlink(
        join(await realpath(project), "dist", "glabscope"),
        join(prefix, "glabscope"),
      );

      const result = await run(join(project, "scripts", "install.sh"), prefix, {
        PATH: failingPath(project),
      });

      expect(result.code).not.toBe(0);
      expect(await readdir(prefix)).toEqual([]);
    }),
  ));

test("the uninstaller removes the link the installer created", () =>
  withPrefix(async (prefix) => {
    await run(INSTALL, prefix);

    const result = await run(UNINSTALL, prefix);

    expect(result.code).toBe(0);
    expect(await readdir(prefix)).toEqual([]);
  }));

test("the uninstaller refuses a regular file and leaves it alone", () =>
  withPrefix(async (prefix) => {
    const entry = join(prefix, "glabscope");
    const contents = "#!/bin/sh\necho not ours\n";
    await writeFile(entry, contents);

    const result = await run(UNINSTALL, prefix);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("regular file");
    expect(await readFile(entry, "utf8")).toBe(contents);
  }));

test("the uninstaller refuses a symlink that points somewhere else", () =>
  withPrefix(async (prefix) => {
    const entry = join(prefix, "glabscope");
    const elsewhere = join(prefix, "elsewhere");
    await writeFile(elsewhere, "someone else's command\n");
    await symlink(elsewhere, entry);

    const result = await run(UNINSTALL, prefix);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("not to this project's build output");
    expect(await readlink(entry)).toBe(elsewhere);
  }));

test("the uninstaller reports an empty target directory as nothing to remove", () =>
  withPrefix(async (prefix) => {
    const result = await run(UNINSTALL, prefix);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing is installed");
  }));
