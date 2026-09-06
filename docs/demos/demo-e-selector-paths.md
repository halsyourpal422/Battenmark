# Demo E — Selector / Path Interoperability

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP  
**Backend:** FreeCAD / OpenCascade 1.1.3

## Result: PASS

| Metric | Value |
|--------|-------|
| Volume | **14,874.34 mm³** |
| Solids | 1 |
| Valid | true |

## Design

Three API paths all create valid holes on the top face of a 50×30×10 mm box:

1. **Path A (face enum):** Direct semantic selector `top_face`
2. **Path B (geometry selector):** Spatial reference `centroid_near` at box center
3. **Path C (created_by reference):** Feature-based reference to `BaseBox`

All three paths converge to the identical physical result.

## Key Insight

Battenmark's typed CAD model supports interchangeable targeting — the same geometry modification can be expressed using face names, spatial coordinates, or feature references. This is **selector/path convergence**, NOT different LLM providers or transports.

## Evidence

Full evidence package archived on Google Drive:
`Demo_Captures/candidate-31ee9369/demo-e-paths/`

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
