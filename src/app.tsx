import { useKeyboard } from "@opentui/react";
import { isQuitKey } from "./keys.ts";

export function App() {
  useKeyboard((key) => {
    if (isQuitKey(key.name)) {
      process.exit(0);
    }
  });

  return (
    <box padding={1}>
      <text>glab-pipeline-viewer</text>
      <text fg="#888888">q quit</text>
    </box>
  );
}
