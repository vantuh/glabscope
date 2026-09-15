import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { isQuitKey } from "./keys.ts";
import { probeGlab } from "./glab/probe.ts";

export function App() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void probeGlab().then((result) => {
      if (result.ok) {
        setReady(true);
        return;
      }
      setError(result.message);
    });
  }, []);

  useKeyboard((key) => {
    if (isQuitKey(key.name)) {
      process.exit(0);
    }
  });

  if (error) {
    return (
      <box padding={1}>
        <text fg="#ff5555">Cannot start</text>
        <text>{error}</text>
        <text fg="#888888">q quit</text>
      </box>
    );
  }

  if (!ready) {
    return (
      <box padding={1}>
        <text>Checking glab…</text>
      </box>
    );
  }

  return (
    <box padding={1}>
      <text>glab-pipeline-viewer</text>
      <text fg="#888888">q quit</text>
    </box>
  );
}
