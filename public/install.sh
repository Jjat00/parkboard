#!/bin/sh
# Installs park, the Parkboard CLI: curl -fsSL https://parkboard.jato.run/install.sh | sh
# One file, no dependencies, Node 20+. It lives in ~/.local/share/parkboard/park.mjs (the .mjs extension is what
# makes Node 20 load it as an ES module) and ~/.local/bin/park links to it. PARK_DIR changes the bin folder.
set -eu

SRC="https://raw.githubusercontent.com/Jjat00/parkboard/main/cli/park.mjs"
DIR="${PARK_DIR:-$HOME/.local/bin}"
LIB="${XDG_DATA_HOME:-$HOME/.local/share}/parkboard"

if ! command -v node >/dev/null 2>&1; then
  echo "park needs Node.js 20 or newer: https://nodejs.org" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  echo "park needs Node.js 20 or newer (found $(node -v))" >&2
  exit 1
fi

mkdir -p "$DIR" "$LIB"
tmp="$LIB/park.$$.mjs"
trap 'rm -f "$tmp"' EXIT
curl -fsSL "$SRC" -o "$tmp"
node --check "$tmp"
chmod +x "$tmp"
mv "$tmp" "$LIB/park.mjs"
ln -sf "$LIB/park.mjs" "$DIR/park"
echo "✓ installed park in $DIR"

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) echo "  $DIR is not in your PATH: add  export PATH=\"$DIR:\$PATH\"  to your shell profile" ;;
esac
echo "Next: park login"
