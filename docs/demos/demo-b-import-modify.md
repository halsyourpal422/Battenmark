# Demo B — Import → Inspect → Modify → Export

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP  
**Backend:** FreeCAD / OpenCascade 1.1.3

## Result: PASS

| Metric | Value |
|--------|-------|
| Volume (post-modification) | **22,846.954 mm³** |
| Surface Area | 12,314.147 mm² |
| Solids | 1 |
| Valid | true |
| Faces after import | 12 |
| Edges after import | 62 |

## Workflow

1. Import STEP from Demo A via workspace path (not raw base64)
2. Inspect faces and edges
3. Add 20×20×3 mm pocket cutout via `boolean_cut`
4. Rebuild and validate
5. Export: FCStd, STEP, STL

## Key Insight

STEP import requires a workspace path (`path` parameter), not arbitrary raw base64 data. The boolean operation name is `boolean_cut` (not `boolean_subtract`).

## Evidence

Full evidence package archived on Google Drive:
`Demo_Captures/candidate-31ee9369/demo-b-import-inspect/`

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
