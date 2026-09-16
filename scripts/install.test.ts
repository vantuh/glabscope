import { expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  readlink,
  readdir,
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

async function run(script: string, prefix: string): Promise<Result> {
  const proc = Bun.spawn(["bash", script], {
    cwd: ROOT,
    env: { ...process.env, PREFIX: prefix },
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
