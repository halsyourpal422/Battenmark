# macOS (Apple Silicon)

**Status:** implemented and **hardware verified** on Apple Silicon (2026-08-22 — see proof below).

| Platform | Status |
| --- | --- |
| macOS Apple Silicon | Tier 1 / primary supported — **hardware verified** |
| macOS Intel | best-effort / unverified |
| Linux | supported headless/development (validated) |
| Windows | unsupported / unverified |

## Install FreeCAD

1. Download the official macOS build from [freecad.org/downloads](https://www.freecad.org/downloads.php).
2. Drag `FreeCAD.app` into `/Applications`.
3. Homebrew (`brew install --cask freecad`) is **optional**.

Do **not** use the Linux x86_64 AppImage on a Mac.

## Discovery order

`src/cad/kernel/discover.server.ts`:

1. `$AGENTCAD_FREECAD_CMD` or `$FREECAD_CMD`
2. Bundle executables, for each of `/Applications/FreeCAD.app`, `FreeCAD 1.0.app`, `FreeCAD 1.1.app`, and the same under `~/Applications`:
   - `Contents/Resources/bin/FreeCADCmd` (conda / official .dmg layout)
   - `Contents/MacOS/FreeCADCmd`
   - `Contents/MacOS/FreeCAD`
3. Homebrew: `/opt/homebrew/bin/FreeCADCmd`, `/usr/local/bin/FreeCADCmd`
4. `PATH`

Override:

```bash
export AGENTCAD_FREECAD_CMD="/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"
```

## Bootstrap

```bash
sh scripts/bootstrap-macos.sh
# or
sh scripts/install-freecad.sh   # discovers; refuses to fetch the Linux AppImage
```

## Gatekeeper / quarantine

If macOS blocks FreeCADCmd:

```bash
xattr -dr com.apple.quarantine /Applications/FreeCAD.app
```

The worker is headless (`QT_QPA_PLATFORM=offscreen`). A GUI login is not required for `FreeCADCmd`.

## Apple Silicon Validation

```text
Validation date: 2026-08-22
Architecture: arm64 (Apple Silicon, T8132)
macOS version: 26.6.2 (Build 25G83)
FreeCAD version: 1.1.3 Revision 20260725
FreeCAD bundle: /Applications/FreeCAD.app
FreeCADCmd: /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd (native Mach-O arm64; discovered via case-insensitive FreeCADCmd path)
Node: v20.20.2   npm: 11.9.0   Python: 3.14.6
```

| Test               | Result |
| ------------------ | ------ |
| bootstrap          | PASS (`scripts/bootstrap-macos.sh`, no fixes required) |
| discovery          | PASS (`mode=macos-bundle`) |
| worker startup     | PASS (headless JSON-lines IPC, banner noise tolerated) |
| capabilities       | PASS (registry-derived report; holes through/blind/counterbore/countersink=true, helical_thread=false; linear/rectangular patterns=true, circular=false; assembly/constraints=false) |
| create_box         | PASS (80×50×12 → V=48000 mm³, 1 solid) |
| parametric rebuild | PASS (length 80→120 → V=72000, bbox x=120) |
| semantic hole      | PASS (backend-neutral `create_hole`; PartDesign Hole internally when PD-eligible) |
| semantic fillet    | PASS (`top_perimeter` re-resolves after resize; V 47508.186 → 71353.672) |
| expressions        | PASS (wall 2.4→4 moves dependent geometry; enclosure wall 2.4→3.0 rebuilds) |
| gref valid         | PASS (persistent `gref_edge_*` re-resolve after recompute) |
| gref lost          | PASS (`GEOMETRY_REFERENCE_LOST`, no silent substitution) |
| gref ambiguous     | PASS (`GEOMETRY_REFERENCE_AMBIGUOUS` on nearest-candidate tie) |
| four-view preview  | PASS (isometric/front/top/right PNG artifacts, 640×480, non-empty) — JSCAD preview renderer, not OCC hidden-line |
| STEP export        | PASS (ISO-10303 header) |
| STEP reimport      | PASS (valid, 1 solid, V≈48000, bounds 80×50×12; B-rep only, no history reconstruction claimed) |
| FCStd save         | PASS (zip container, non-empty) |
| FCStd reload       | PASS (opens; native PartDesign tree present; final Body Tip valid at V=48000, bounds 80×50×12 — see measurement semantics below) |
| STL export         | PASS (binary STL, size consistent with facet count) |
| worker restart     | PASS (kill → immediate respawn race fixed; regression-tested) |
| direct parity      | PASS (V=48000) |
| CLI parity         | PASS (V=48000) |
| HTTP parity        | PASS (V=48000) |
| MCP parity         | PASS (V=48000) |
| Python parity      | PASS (Python client via live HTTP server → authoritative rebuild V=48000) |

### FCStd reload measurement semantics

Native `doc.saveAs()` FCStd files retain the full PartDesign feature tree: intermediate
feature shapes as well as the final Body Tip. Summing volume over every solid-bearing
document object therefore double-counts sequential feature history (e.g. Base solid +
padded Tip = 2 × physical volume). Round-trip validation measures the **final Body
Tip / visible result**, not an aggregate over historical features. Service-level
parametric state lives in `document.json`; an imported/reopened tree is not claimed to
be a reconstructed AgentCAD parametric history.

### Mac-specific bug found during validation

```text
Symptom:      test:macos "worker restart" failed — after worker.kill("SIGKILL"),
              freeCadKernel.available() reported the backend unavailable.
Root cause:   The killed child's 'exit' handler unconditionally nulled the client's
              this.child/this.pid. On macOS the stale exit event arrived after the
              replacement worker had spawned, clobbering the live registration, so
              the next request hit "Worker stdin is not available".
Why Linux/mock tests missed it: the hardware proof SKIPs on non-Apple-Silicon hosts,
              and unit tests do not run real respawn timing.
Fix:          Identity guard in src/cad/kernel/client.server.ts — only clear
              registration if this.child === child.
Regression:   "restart-race" case added to test:freecad (kill + immediate respawn).
Retest:       PASS (test:macos full sequence incl. pid change; repeated across runs).
```

A related harness-only cleanup was added for the same lifecycle class: transport test
runners that spawn the worker in-process (HTTP/MCP/transport-parity) now shut it down
and exit explicitly instead of relying on natural event-loop drain.

Until the table above is reproduced on other hardware, macOS Intel and Windows remain
unverified. Do not treat `test:discover` Darwin fixtures as a substitute for this proof.
