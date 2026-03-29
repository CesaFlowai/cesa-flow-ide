#!/usr/bin/env bash
# apply_patches.sh
# Applies CesaFlow source-level customizations to VS Code before build.
# Run from repo root: bash scripts/apply_patches.sh [vscode_dir]

set -euo pipefail
VSCODE_DIR="${1:-vscode}"

echo "=== CesaFlow patches → $VSCODE_DIR ==="

# ── Patch 1: Help menu — remove social/Twitter links ─────────────────────────
# VS Code 1.96.x: src/vs/workbench/contrib/help/browser/helpActions.ts
HELP_ACTIONS="$VSCODE_DIR/src/vs/workbench/contrib/help/browser/helpActions.ts"
if [ -f "$HELP_ACTIONS" ]; then
  # Remove "Follow us on Twitter/X" menu item
  sed -i '/twitter\.com\|x\.com\/code\|Follow us on/d' "$HELP_ACTIONS"
  # Remove "Join Us on YouTube" menu item
  sed -i '/youtube\.com.*vscode\|Join Us on YouTube/d' "$HELP_ACTIONS"
  echo "✓ Help menu: social links removed"
else
  echo "⚠ $HELP_ACTIONS not found, skipping"
fi

# ── Patch 2: Disable Settings Sync account button ────────────────────────────
# Remove "Turn on Settings Sync..." from the accounts menu
SYNC_FILE="$VSCODE_DIR/src/vs/workbench/services/userDataSync/browser/userDataSyncWorkbenchService.ts"
if [ -f "$SYNC_FILE" ]; then
  sed -i "s/'Turn on Settings Sync\.\.\.'/''/g" "$SYNC_FILE"
  echo "✓ Settings Sync: turn-on prompt disabled"
else
  # Try alternate path
  SYNC_FILE2=$(find "$VSCODE_DIR/src" -name "userDataSyncWorkbenchService.ts" 2>/dev/null | head -1)
  if [ -n "$SYNC_FILE2" ]; then
    sed -i "s/'Turn on Settings Sync\.\.\.'/''/g" "$SYNC_FILE2"
    echo "✓ Settings Sync: turn-on prompt disabled (alt path)"
  else
    echo "⚠ Settings Sync file not found, skipping"
  fi
fi

# ── Patch 3: Welcome page — replace VS Code references ───────────────────────
WELCOME_HTML="$VSCODE_DIR/src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts"
if [ -f "$WELCOME_HTML" ]; then
  sed -i 's/Visual Studio Code/CesaFlow IDE/g' "$WELCOME_HTML"
  sed -i 's/VS Code/CesaFlow IDE/g' "$WELCOME_HTML"
  echo "✓ Welcome page: VS Code → CesaFlow IDE"
else
  echo "⚠ Getting started content not found, skipping"
fi

# ── Patch 4: Window title — remove "Visual Studio Code" suffix ───────────────
WINDOW_TITLE="$VSCODE_DIR/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts"
if [ -f "$WINDOW_TITLE" ]; then
  sed -i 's/Visual Studio Code/CesaFlow IDE/g' "$WINDOW_TITLE"
  echo "✓ Title bar: Visual Studio Code → CesaFlow IDE"
else
  echo "⚠ Titlebar part not found, skipping"
fi

# ── Patch 5: About dialog ─────────────────────────────────────────────────────
ABOUT_FILE=$(find "$VSCODE_DIR/src" -name "abstractIssueReporterService.ts" 2>/dev/null | head -1)
if [ -z "$ABOUT_FILE" ]; then
  ABOUT_FILE=$(find "$VSCODE_DIR/src" -name "issueReporter.ts" 2>/dev/null | head -1)
fi
if [ -n "$ABOUT_FILE" ]; then
  sed -i 's/Visual Studio Code/CesaFlow IDE/g' "$ABOUT_FILE"
  echo "✓ About dialog: patched"
else
  echo "⚠ About/issue reporter not found, skipping"
fi

echo "=== Patches complete ==="
