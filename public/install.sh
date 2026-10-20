#!/bin/sh
# Installs park, the Parkboard CLI: curl -fsSL https://parkboard.jato.run/install.sh | sh
# One file, no dependencies, Node 20+. PARK_DIR changes where it goes (default ~/.local/bin).
set -eu

SRC="https://raw.githubusercontent.com/Jjat00/parkboard/main/cli/park.mjs"
DIR="${PARK_DIR:-$HOME/.local/bin}"

if ! command -v node >/dev/null 2>&1; then
  echo "park needs Node.js 20 or newer: https://nodejs.org" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  echo "park needs Node.js 20 or newer (found $(node -v))" >&2
  exit 1
fi

mkdir -p "$DIR"
tmp=$(mktemp)
curl -fsSL "$SRC" -o "$tmp"
node --check "$tmp"
chmod +x "$tmp"
mv "$tmp" "$DIR/park"
echo "✓ installed park $("$DIR/park" --version) in $DIR"

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) echo "  $DIR is not in your PATH: add  export PATH=\"$DIR:\$PATH\"  to your shell profile" ;;
esac
echo "Next: park login"
