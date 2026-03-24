#!/usr/bin/env bash
# build_local.sh — Local dev build (Linux / macOS)
# Usage: bash scripts/build_local.sh [vscode-tag] [orkestra-version]
# Example: bash scripts/build_local.sh 1.87.2 0.1.0

set -euo pipefail

VSCODE_TAG="${1:-1.87.2}"
ORKESTRA_VERSION="${2:-0.1.0}"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"  # darwin or linux

echo "═══════════════════════════════════════════════════"
echo " Orkestra IDE v${ORKESTRA_VERSION} — local build"
echo " VS Code tag : ${VSCODE_TAG}"
echo " Platform    : ${PLATFORM}"
echo "═══════════════════════════════════════════════════"

# ── 1. Clone VS Code ──────────────────────────────────
if [ ! -d "vscode/.git" ]; then
  echo "→ Cloning VS Code ${VSCODE_TAG}..."
  git clone --depth 1 --branch "${VSCODE_TAG}" \
    https://github.com/microsoft/vscode.git vscode
else
  echo "→ vscode/ already cloned, skipping"
fi

# ── 2. Apply branding ─────────────────────────────────
echo "→ Applying branding..."
COMMIT=$(cd vscode && git rev-parse HEAD)
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed "s/REPLACE_WITH_COMMIT/${COMMIT}/g; s/REPLACE_WITH_DATE/${DATE}/g" \
  product.json > vscode/product.json

# ── 3. Copy extension ─────────────────────────────────
echo "→ Copying built-in extension..."
bash scripts/copy_extension.sh

# ── 4. Install dependencies ───────────────────────────
echo "→ Installing VS Code dependencies (takes a few minutes first time)..."
cd vscode
npm install --legacy-peer-deps

# ── 5. Build ──────────────────────────────────────────
if [ "$PLATFORM" = "darwin" ]; then
  ARCH="$(uname -m)"
  if [ "$ARCH" = "arm64" ]; then
    echo "→ Building macOS arm64..."
    npm run gulp vscode-darwin-arm64
    echo "✓ Output: VSCode-darwin-arm64/"
  else
    echo "→ Building macOS x64..."
    npm run gulp vscode-darwin-x64
    echo "✓ Output: VSCode-darwin-x64/"
  fi
elif [ "$PLATFORM" = "linux" ]; then
  echo "→ Building Linux x64..."
  npm run gulp vscode-linux-x64
  echo "✓ Output: VSCode-linux-x64/"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo " Build complete!"
echo " To create a DMG (macOS): run scripts/package_macos.sh"
echo " To run directly: open VSCode-darwin-*/Orkestra\\ IDE.app"
echo "═══════════════════════════════════════════════════"
