# User Trial 001 — USB + microSD Holder

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP (port 8787)  
**Backend:** FreeCAD / OpenCascade 1.1.3  
**Platform:** macOS 26.6.2, arm64

## Result: PASS

| Metric | Value |
|--------|-------|
| Volume | **305,698.91 mm³** |
| Bounding Box | 130 × 124 × 20 mm |
| Surface Area | 52,191.19 mm² |
| Solids | 1 |
| Valid | true |
| Operations | 42/42 succeeded |

## Design

Desktop holder for **15 USB-A flash drives** and **10 microSD cards**:
- Base: 130 × 124 × 20 mm, 4 mm corner fillets
- USB slots: 5×3 grid (13.4 × 5.6 mm each, 13 mm deep)
- microSD slots: 5×2 grid (11.8 × 1.6 mm each, 9.5 mm deep)

## Evidence

Full evidence package (16 files) archived on Google Drive:
`Demo_Captures/candidate-31ee9369/user-trial-001/`

Includes: prompt.txt, environment.txt, command-transcript.txt, operation-trace.json, validation-result.json, dimensions-volume.txt, 4 preview PNGs, holder.FCStd, holder.step, holder.stl, result.md

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
