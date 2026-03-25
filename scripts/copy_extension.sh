#!/usr/bin/env bash
# copy_extension.sh
# Copies the built-in Orkestra extension into the VS Code source tree.
# Run from the repo root (orkestra-ide/).

set -euo pipefail

EXT_SRC="extension"
EXT_DST="vscode/extensions/orkestra"

mkdir -p "$EXT_DST"

# compiled JS (required)
if [ -d "$EXT_SRC/out" ]; then
  cp -r "$EXT_SRC/out" "$EXT_DST/"
else
  echo "⚠  vscode-extension/out/ not found — extension will have no code"
  mkdir -p "$EXT_DST/out"
fi

# package.json (required)
cp "$EXT_SRC/package.json" "$EXT_DST/"

# media assets (optional)
if [ -d "$EXT_SRC/media" ]; then
  cp -r "$EXT_SRC/media" "$EXT_DST/"
fi

echo "✓ CesaFlow extension copied to $EXT_DST"
