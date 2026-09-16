/**
 * The platform's default browser opener, one argv shape per platform, spawned
 * with every stream ignored so it never touches the TUI's terminal and
 * released so the app can exit while a browser is still starting.
 *
 * `BROWSER` is deliberately ignored: honoring it means parsing an environment
 * value that may carry arguments, which is more than this app needs.
 */
export function browserArgv(platform: string, url: string): string[] | null {
  switch (platform) {
    case "darwin":
      return ["open", url];
    case "linux":
      return ["xdg-open", url];
    case "win32":
      // The empty title keeps `start` from reading a quoted url as its window.
      return ["cmd", "/c", "start", "", url];
    default:
      return null;
  }
}

/** Injectable spawn, so tests can exercise the failure path without a browser. */
export type BrowserSpawn = (argv: string[]) => { unref?: () => void } | void;

function defaultSpawn(argv: string[]): { unref?: () => void } {
  return Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

/**
 * Launch the platform's default opener for `url`. Best effort and never
 * throwing: `false` means the platform is unsupported or the launch could not
 * be started, while `true` says only that it was started — not that a browser
 * opened anything.
 */
export function openInBrowser(
  url: string,
  options: { platform?: string; spawn?: BrowserSpawn } = {},
): boolean {
  const argv = browserArgv(options.platform ?? process.platform, url);
  if (!argv) {
    return false;
  }
  try {
    (options.spawn ?? defaultSpawn)(argv)?.unref?.();
    return true;
  } catch {
    return false;
  }
}
