#!/bin/sh
# Discover or install a headless FreeCADCmd for this CAD service.
# macOS: locate FreeCAD.app (do not download the Linux AppImage).
# Linux: prefer an existing executable, otherwise download the official
# x86_64 AppImage and extract it (no FUSE required).
set -eu

UNAME="$(uname -s)"
ROOT="${FREECAD_PREFIX:-/opt/freecad}"
MARKER="$ROOT/ok.json"
APPIMAGE="$ROOT/FreeCAD.AppImage"
EXTRACT="$ROOT/squashfs-root"
URL="${FREECAD_APPIMAGE_URL:-https://github.com/FreeCAD/FreeCAD/releases/download/1.0.2/FreeCAD_1.0.2-conda-Linux-x86_64-py311.AppImage}"

find_macos() {
  if [ -n "${AGENTCAD_FREECAD_CMD:-}" ] && [ -x "$AGENTCAD_FREECAD_CMD" ]; then
    printf '%s\n' "$AGENTCAD_FREECAD_CMD"
    return 0
  fi
  if [ -n "${FREECAD_CMD:-}" ] && [ -x "$FREECAD_CMD" ]; then
    printf '%s\n' "$FREECAD_CMD"
    return 0
  fi
  for bundle in \
    "/Applications/FreeCAD.app" \
    "/Applications/FreeCAD 1.0.app" \
    "/Applications/FreeCAD 1.1.app" \
    "$HOME/Applications/FreeCAD.app" \
    "$HOME/Applications/FreeCAD 1.0.app" \
    "$HOME/Applications/FreeCAD 1.1.app"
  do
    for c in \
      "$bundle/Contents/Resources/bin/FreeCADCmd" \
      "$bundle/Contents/MacOS/FreeCADCmd" \
      "$bundle/Contents/MacOS/FreeCAD"
    do
      if [ -x "$c" ]; then
        printf '%s\n' "$c"
        return 0
      fi
    done
  done
  for c in \
    /opt/homebrew/bin/FreeCADCmd \
    /opt/homebrew/bin/freecadcmd \
    /usr/local/bin/FreeCADCmd \
    /usr/local/bin/freecadcmd
  do
    if [ -x "$c" ]; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  if command -v FreeCADCmd >/dev/null 2>&1; then
    command -v FreeCADCmd
    return 0
  fi
  return 1
}

if [ "$UNAME" = "Darwin" ]; then
  if CMD="$(find_macos)"; then
    echo "FreeCAD already available: $CMD"
    echo "arch=$(uname -m)"
    exit 0
  fi
  cat <<'EOF'
FreeCADCmd was not found on this Mac.

Apple Silicon (Tier 1):
  1. Download the official FreeCAD .dmg from https://www.freecad.org/downloads.php
  2. Drag FreeCAD.app into /Applications
  3. This service looks for, in order:
       $AGENTCAD_FREECAD_CMD
       $FREECAD_CMD
       /Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd
       /Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd
  4. Optional override:
       export AGENTCAD_FREECAD_CMD="/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"

Homebrew is optional and not required.
Do not download the Linux AppImage on macOS.
See docs/MACOS.md or run scripts/bootstrap-macos.sh
EOF
  exit 1
fi

find_cmd() {
  if [ -n "${AGENTCAD_FREECAD_CMD:-}" ] && [ -x "$AGENTCAD_FREECAD_CMD" ]; then
    printf '%s\n' "$AGENTCAD_FREECAD_CMD"
    return 0
  fi
  if [ -n "${FREECAD_CMD:-}" ] && [ -x "$FREECAD_CMD" ]; then
    printf '%s\n' "$FREECAD_CMD"
    return 0
  fi
  for c in \
    "$EXTRACT/usr/bin/FreeCADCmd" \
    "$EXTRACT/usr/bin/freecadcmd" \
    "$EXTRACT/AppRun" \
    /usr/bin/FreeCADCmd \
    /usr/bin/freecadcmd \
    /usr/lib/freecad/bin/FreeCADCmd \
    /opt/freecad/bin/FreeCADCmd
  do
    if [ -x "$c" ]; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  if command -v FreeCADCmd >/dev/null 2>&1; then
    command -v FreeCADCmd
    return 0
  fi
  if command -v freecadcmd >/dev/null 2>&1; then
    command -v freecadcmd
    return 0
  fi
  return 1
}

if CMD="$(find_cmd)"; then
  echo "FreeCAD already available: $CMD"
  exit 0
fi

echo "FreeCAD not on PATH. Installing Linux AppImage into $ROOT"
mkdir -p "$ROOT"
if [ ! -f "$APPIMAGE" ]; then
  echo "Downloading $URL"
  curl -L --fail --retry 3 --retry-delay 2 -o "$APPIMAGE.partial" "$URL"
  mv "$APPIMAGE.partial" "$APPIMAGE"
  chmod +x "$APPIMAGE"
fi

if [ ! -x "$EXTRACT/usr/bin/FreeCADCmd" ] && [ ! -x "$EXTRACT/usr/bin/freecadcmd" ]; then
  echo "Extracting AppImage (no FUSE)..."
  (
    cd "$ROOT"
    if ./"$(basename "$APPIMAGE")" --appimage-extract >/tmp/freecad-extract.log 2>&1; then
      :
    else
      echo "AppImage extract failed, log:" >&2
      tail -50 /tmp/freecad-extract.log >&2
      exit 1
    fi
  )
fi

CMD="$(find_cmd)" || {
  echo "Extracted AppImage but could not find FreeCADCmd" >&2
  find "$EXTRACT" -iname '*freecad*' | head -50 >&2
  exit 1
}

echo "FreeCADCmd: $CMD"
python3 -c "import json,time,os; os.makedirs(os.path.dirname('$MARKER'), exist_ok=True); json.dump({'cmd':'$CMD','installed_at':time.time(),'source':'appimage'}, open('$MARKER','w'), indent=2)"
echo "OK"
