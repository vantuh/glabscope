#!/usr/bin/env bash
# Remove the glabscope link this project's installer created.
# Removes nothing else: not a regular file, not a directory, not a foreign link.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PREFIX="${PREFIX:-$HOME/.local/bin}"
BIN="glabscope"
ARTIFACT="$ROOT/dist/$BIN"
ENTRY="$PREFIX/$BIN"

# -L as well as -e: a link whose target is gone is still installed.
if [ ! -e "$ENTRY" ] && [ ! -L "$ENTRY" ]; then
  echo "$BIN: nothing is installed at $ENTRY; nothing to remove."
  exit 0
fi

if [ ! -L "$ENTRY" ]; then
  if [ -d "$ENTRY" ]; then
    echo "$BIN: refusing to remove $ENTRY: it is a directory, not a symbolic link." >&2
  else
    echo "$BIN: refusing to remove $ENTRY: it is a regular file, not a symbolic link." >&2
  fi
  echo "$BIN: this installer did not create it, so delete it yourself if you are sure." >&2
  exit 1
fi

# The target is compared as text, so a link whose build output was deleted is
# still recognised as ours and still removable.
TARGET="$(readlink "$ENTRY")"
if [ "$TARGET" != "$ARTIFACT" ]; then
  echo "$BIN: refusing to remove $ENTRY: it links to $TARGET," >&2
  echo "$BIN: not to this project's build output ($ARTIFACT)." >&2
  exit 1
fi

rm "$ENTRY"
echo "$BIN: removed $ENTRY (it pointed at $ARTIFACT)."
