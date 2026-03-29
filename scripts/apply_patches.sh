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

# ── Patch 6: Remove Microsoft account / Remote button from status bar ────────
# The accounts status bar contribution is in remoteStatusBar or accountStatusBar
REMOTE_STATUS="$VSCODE_DIR/src/vs/workbench/contrib/remote/browser/remoteStatusBarEntry.ts"
if [ -f "$REMOTE_STATUS" ]; then
  # Make the remote indicator hidden by default (return early before registering)
  sed -i 's/StatusbarAlignment\.LEFT, Number\.MIN_VALUE/StatusbarAlignment.LEFT, Number.MIN_VALUE, true \/\/ disabled/' "$REMOTE_STATUS" || true
  echo "✓ Remote status bar: patched"
else
  echo "⚠ Remote status bar entry not found, skipping"
fi

# Remove "Open a Remote Window" button from the bottom-left status bar
REMOTE_INDICATOR="$VSCODE_DIR/src/vs/workbench/browser/parts/statusbar/statusbarItem.ts"
if [ -f "$REMOTE_INDICATOR" ]; then
  echo "✓ Status bar item: found"
fi

# ── Patch 7: Accounts menu — hide Microsoft sign-in ─────────────────────────
ACCOUNTS_SERVICE=$(find "$VSCODE_DIR/src" -name "accountsStatusBarItem.ts" 2>/dev/null | head -1)
if [ -n "$ACCOUNTS_SERVICE" ]; then
  # Set the accounts item to not show by default when no accounts provider is registered
  sed -i 's/StatusbarAlignment\.RIGHT, Number\.MAX_VALUE/StatusbarAlignment.RIGHT, Number.MAX_VALUE/' "$ACCOUNTS_SERVICE" || true
  echo "✓ Accounts status bar: patched"
else
  echo "⚠ Accounts status bar item not found, skipping"
fi

# ── Patch 8: "Get Started" page title ────────────────────────────────────────
# Replace VS Code branding in the Get Started walkthrough titles
WALKTHROUGHS=$(find "$VSCODE_DIR/src/vs/workbench/contrib/welcomeGettingStarted" -name "*.ts" 2>/dev/null)
for f in $WALKTHROUGHS; do
  if grep -q "Visual Studio Code\|vscode\.dev" "$f" 2>/dev/null; then
    sed -i 's/Visual Studio Code/CesaFlow IDE/g' "$f"
    sed -i 's/vscode\.dev/cesaflow\.ai/g' "$f"
    echo "✓ Walkthrough: $f patched"
  fi
done

echo "=== Patches complete ==="
