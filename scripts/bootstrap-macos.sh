#!/bin/sh
# macOS Apple Silicon developer bootstrap for this CAD service.
# Does not require Homebrew. Does not download a Linux AppImage.
set -eu

echo "machine=$(uname -m)  darwin=$(uname -s)  node=$(command -v node || echo missing)"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script is for macOS. On Linux use scripts/install-freecad.sh" >&2
  exit 2
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "Note: this Mac is $(uname -m). Apple Silicon (arm64) is the Tier-1 target; Intel is best-effort."
fi

FOUND=""
if [ -n "${AGENTCAD_FREECAD_CMD:-}" ] && [ -x "$AGENTCAD_FREECAD_CMD" ]; then
  FOUND="$AGENTCAD_FREECAD_CMD"
elif [ -n "${FREECAD_CMD:-}" ] && [ -x "$FREECAD_CMD" ]; then
  FOUND="$FREECAD_CMD"
else
  for bundle in \
    "/Applications/FreeCAD.app" \
    "/Applications/FreeCAD 1.0.app" \
    "/Applications/FreeCAD 1.1.app" \
    "$HOME/Applications/FreeCAD.app"
  do
    for c in \
      "$bundle/Contents/Resources/bin/FreeCADCmd" \
      "$bundle/Contents/MacOS/FreeCADCmd" \
      "$bundle/Contents/MacOS/FreeCAD"
    do
      if [ -x "$c" ]; then
        FOUND="$c"
        break 2
      fi
    done
  done
fi

if [ -z "$FOUND" ]; then
  cat <<'EOF'
FreeCAD.app was not found.

Install the official macOS build:
  https://www.freecad.org/downloads.php

Drag FreeCAD.app into /Applications, then re-run this script.

If Gatekeeper quarantines the app:
  xattr -dr com.apple.quarantine /Applications/FreeCAD.app

Override discovery:
  export AGENTCAD_FREECAD_CMD="/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"

Homebrew (`brew install --cask freecad`) is optional.
See docs/MACOS.md
EOF
  exit 1
fi

echo "FreeCADCmd: $FOUND"
if "$FOUND" --version >/dev/null 2>&1 || true; then
  "$FOUND" --version 2>/dev/null | head -3 || true
fi

echo
echo "Next:"
echo "  npm install"
echo "  export AGENTCAD_FREECAD_CMD=\"$FOUND\""
echo "  npm run test:discover"
echo "  npm run test:freecad"
echo "  npm run dev          # studio on 0.0.0.0:8080 in this sandbox; locally use the documented host"
echo
echo "OK"
