# Linux

Linux is a supported **headless / CI** target. It is not the primary desktop target.

## Install

```bash
sh scripts/install-freecad.sh
```

That prefers an existing `FreeCADCmd`, otherwise downloads the official FreeCAD 1.0.2 Linux x86_64 AppImage and extracts it (no FUSE) under `$FREECAD_PREFIX` (default `/opt/freecad`).

Launch:

```text
AppRun freecadcmd freecad-worker/bootstrap.py
```

## Discovery

1. `$AGENTCAD_FREECAD_CMD` / `$FREECAD_CMD`
2. Extracted AppImage `AppRun` + `usr/bin/freecadcmd`
3. `/usr/bin/FreeCADCmd`, `/usr/bin/freecadcmd`, …
4. `PATH`

## Tests

```bash
npm run typecheck
npm run test:cad
npm run test:phase5
npm run test:phase55
npm run test:freecad
```

aarch64 Linux AppImages are not fetched by the default installer URL.
