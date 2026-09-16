import { expect, test } from "bun:test";
import { browserArgv, openInBrowser, type BrowserSpawn } from "./browser.ts";

const URL = "https://gitlab.example.com/group/project/-/jobs/47074530";

test("each platform gets its own opener argv", () => {
  expect(browserArgv("darwin", URL)).toEqual(["open", URL]);
  expect(browserArgv("linux", URL)).toEqual(["xdg-open", URL]);
  expect(browserArgv("win32", URL)).toEqual(["cmd", "/c", "start", "", URL]);
});

test("an unsupported platform has no argv and opens nothing", () => {
  let spawned = 0;
  const spawn: BrowserSpawn = () => {
    spawned += 1;
  };
  expect(browserArgv("freebsd", URL)).toBeNull();
  expect(openInBrowser(URL, { platform: "freebsd", spawn })).toBe(false);
  expect(spawned).toBe(0);
});

test("a supported platform hands the opener its argv, released, and reports the launch", () => {
  const seen: string[][] = [];
  let releases = 0;
  const spawn: BrowserSpawn = (argv) => {
    seen.push(argv);
    return {
      unref: () => {
        releases += 1;
      },
    };
  };
  expect(openInBrowser(URL, { platform: "darwin", spawn })).toBe(true);
  expect(seen).toEqual([["open", URL]]);
  expect(releases).toBe(1);
});

test("a spawn that fails returns false instead of throwing", () => {
  // The real failure mode: the opener binary is missing from PATH, which throws
  // out of Bun.spawn. No browser can be launched by this name.
  let result: boolean | undefined;
  const spawn: BrowserSpawn = () =>
    Bun.spawn(["glabscope-no-such-opener"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
  expect(() => {
    result = openInBrowser(URL, { platform: "darwin", spawn });
  }).not.toThrow();
  expect(result).toBe(false);
});
