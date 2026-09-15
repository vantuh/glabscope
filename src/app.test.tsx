import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./app.tsx";

test("blank TUI renders and exits on q", async () => {
  let exited = false;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exited = true;
    void code;
  }) as typeof process.exit;

  const setup = await testRender(<App />, { width: 40, height: 8 });
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame.includes("Checking glab") || frame.includes("glab-pipeline-viewer")).toBe(
      true,
    );
    setup.mockInput.pressKey("q");
    await setup.renderOnce();
    expect(exited).toBe(true);
  } finally {
    process.exit = originalExit;
    setup.renderer.destroy();
  }
});
