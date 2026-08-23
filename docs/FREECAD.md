# FreeCAD driver

## Discovery

`src/cad/kernel/discover.server.ts` looks for:

| Mode | Location |
| --- | --- |
| `env` | `$AGENTCAD_FREECAD_CMD` or `$FREECAD_CMD` |
| `macos-bundle` | `/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd` (and MacOS/FreeCADCmd) |
| `homebrew` | `/opt/homebrew/bin/FreeCADCmd` (optional) |
| `appimage-extracted` | `$FREECAD_PREFIX/squashfs-root/AppRun freecadcmd` (default prefix `/opt/freecad`) |
| `system` | `/usr/bin/FreeCADCmd`, `/usr/bin/freecadcmd`, … |

Install on Linux:

```
sh scripts/install-freecad.sh
```

Install / discover on macOS Apple Silicon:

```
sh scripts/bootstrap-macos.sh
```

See `docs/MACOS.md` and `docs/LINUX.md`.

Current development environment (this sandbox):

| Item | Value |
| --- | --- |
| Version | FreeCAD 1.0.2, revision 39319 |
| Python | 3.11.13 (bundled) |
| Executable | `/opt/freecad/squashfs-root/AppRun freecadcmd` |
| Operating mode | Headless, `QT_QPA_PLATFORM=offscreen` |
| GUI | Not required. `FreeCADCmd` / `freecadcmd` only. |

## Launch

FreeCADCmd does not reliably execute a long-form `worker.py` when passed as a document path. Phase 2 launches a tiny macro:

```
AppRun freecadcmd freecad-worker/bootstrap.py
```

`bootstrap.py` uses `runpy.run_path` to load `worker.py`. Python `sys.stdout` is redirected to stderr so JSON-lines stay clean; OCCT may still print STEP statistics to the process stdout, which the Node client skips.

## Feature mapping

| AgentCAD | FreeCAD |
| --- | --- |
| parameters | `Spreadsheet::Sheet` named `Params` with aliases |
| box | `Part::Box` + expressions on Length/Width/Height |
| cylinder / sphere | `Part::Cylinder` / `Part::Sphere` |
| sketch | `Sketcher::SketchObject` |
| pad / pocket | `Part::Extrusion` (+ `Part::Cut` for pocket) |
| hole | `Part::Cylinder` tool + `Part::Cut`, placed from semantic faces |
| fillet / chamfer | `Part::Fillet` / `Part::Chamfer` on the originating solid |
| boolean | `Part::Fuse` / `Part::Cut` / `Part::Common` |
| pattern | hole copies (linear) |

Fillets are applied to the **originating box** before subsequent cuts. That matches both JSCAD preview semantics and the usual “outer rounds then pocket” intent. A 3 mm outer fillet on a 2.4 mm wall therefore succeeds on the outer solid; applying it after shelling would fail.

## Modules used

Part, Mesh, Import, Sketcher, Spreadsheet, MeshPart, PartDesign (imported for availability; Pad uses `Part::Extrusion` for headless reliability).

## Known GUI-bound features

TechDraw, some FEM, interactive PartDesign task dialogs, and anything that needs `FreeCADGui` view providers are out of scope. `ViewObject.Visibility` is best-effort under FreeCADCmd.

## Cross-platform

| OS | Notes |
| --- | --- |
| Linux | AppImage extract (this repo’s installer) or distro `freecadcmd` |
| macOS | Set `FREECAD_CMD` to `FreeCAD.app/Contents/MacOS/FreeCADCmd` |
| Windows | Set `FREECAD_CMD` to `FreeCADCmd.exe` |

Do not bake machine-specific paths into application code; use discovery.
