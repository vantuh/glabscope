import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type ClipboardService,
  type CliRenderer,
} from "@opentui/core";

/**
 * Writer for the system clipboard through OpenTUI's helpers: the host
 * clipboard service when it can take the text, OSC 52 through the renderer
 * otherwise ("best-available"), always as plain text. The host service is
 * created on the first write so a session that never copies does not open a
 * native clipboard connection.
 */
export function clipboardWriter(renderer: CliRenderer): (text: string) => void {
  let service: ClipboardService | null = null;
  return (text) => {
    service ??= createClipboard({
      host: createHostClipboard(),
      terminal: createRendererClipboardAdapter(renderer),
    });
    void service.writeText(text, { destination: "best-available" }).catch(() => {});
  };
}

/**
 * Copy plain text to the system clipboard, skipping empty text so an empty
 * selection never replaces what the operator already had. Returns whether
 * anything was written, so callers can show feedback only for a real copy.
 */
export function copyPlainText(text: string, write: (text: string) => void): boolean {
  if (!text) {
    return false;
  }
  write(text);
  return true;
}
