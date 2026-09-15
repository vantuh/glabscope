import { glabBin } from "./probe.ts";

export type GlabResult = {
  stdout: string;
  stderr: string;
  code: number;
};

const GLAB_TIMEOUT_MS = 20_000;

export async function runGlab(
  args: string[],
  options: { cwd?: string } = {},
): Promise<GlabResult> {
  try {
    const proc = Bun.spawn([glabBin(), ...args], {
      cwd: options.cwd ?? process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const killer = setTimeout(() => proc.kill(), GLAB_TIMEOUT_MS);
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stdout, stderr, code: code ?? 1 };
    } finally {
      clearTimeout(killer);
    }
  } catch {
    return {
      stdout: "",
      stderr:
        "glab was not found on PATH. Install GitLab CLI and authenticate with `glab auth login`.",
      code: 127,
    };
  }
}

export function parseJsonStdout<T>(result: GlabResult): T {
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `glab exited ${result.code}`);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(result.stderr.trim() || "glab returned invalid JSON");
  }
}
