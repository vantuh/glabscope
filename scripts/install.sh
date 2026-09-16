#!/usr/bin/env bash
# Build glabscope into a standalone binary and link it onto PATH.
# Writes only to the project's dist/ and to PREFIX (default ~/.local/bin).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.local/bin}"
BIN="glabscope"
ARTIFACT="$ROOT/dist/$BIN"
ENTRY="$PREFIX/$BIN"

# A missing build tool is fatal, and it is checked before anything is touched.
if ! command -v bun >/dev/null 2>&1; then
  echo "$BIN: bun is required to build the command but was not found on PATH." >&2
  echo "$BIN: install Bun (https://bun.com) and run this script again." >&2
  exit 1
fi

# glab is needed only at run time, so its absence is a warning, not a failure.
if ! command -v glab >/dev/null 2>&1; then
  echo "$BIN: warning: glab is not on PATH; the installed command needs it" >&2
  echo "$BIN: warning: install it and run 'glab auth login' before using $BIN." >&2
fi

echo "$BIN: building $ARTIFACT"
if ! (cd "$ROOT" && bun run build); then
  echo "$BIN: build failed; nothing was installed and $ENTRY was left unchanged." >&2
  exit 1
fi

if [ ! -x "$ARTIFACT" ]; then
  echo "$BIN: build run finished but $ARTIFACT is missing or not executable;" >&2
  echo "$BIN: nothing was installed and $ENTRY was left unchanged." >&2
  exit 1
fi

mkdir -p "$PREFIX"
ln -sf "$ARTIFACT" "$ENTRY"
echo "$BIN: installed $ENTRY -> $ARTIFACT"

case ":$PATH:" in
  *":$PREFIX:"*) ;;
  *)
    echo "$BIN: $PREFIX is not on PATH. Add it with:"
    echo "    export PATH=\"$PREFIX:\$PATH\""
    echo "$BIN: put that line in your shell profile to make it permanent."
    ;;
esac
