# Demo C — Iterative Correction Loop

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP  
**Backend:** FreeCAD / OpenCascade 1.1.3

## Result: PASS

| Metric | Value |
|--------|-------|
| Volume (before correction) | ~11,705.47 mm³ |
| Volume (after correction) | **11,410.95 mm³** |
| Valid (before) | true |
| Valid (after) | true |
| Solids (before/after) | 1 |
| Operations | 21 HTTP calls, all successful |

## Workflow

1. Create initial holes at 10 mm spacing from left edge
2. Requirement change: spacing increased to 15 mm
3. Delete old holes, create new with wider spacing
4. Rebuild and validate — both before and after are valid=true, solid_count=1

## Key Insight

Change the requirement, update the model through Battenmark, then rebuild and validate. All features (old + new) persist in the merged body. This is **iterative correction** — the operation trace shows explicit delete/recreate of holes rather than direct parameter editing.

## Evidence

Full evidence package archived on Google Drive:
`Demo_Captures/candidate-31ee9369/demo-c-iterative/`

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
