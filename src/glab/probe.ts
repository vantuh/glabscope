export function glabBin(): string {
  return process.env.GLAB_BIN ?? "glab";
}

export async function probeGlab(
  bin = glabBin(),
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const proc = Bun.spawn([bin, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    if (code === 0) {
      return { ok: true };
    }
    const stderr = await new Response(proc.stderr).text();
    return {
      ok: false,
      message: stderr.trim() || `${bin} exited with status ${code}`,
    };
  } catch {
    return {
      ok: false,
      message:
        "glab was not found on PATH. Install GitLab CLI and authenticate with `glab auth login`.",
    };
  }
}
