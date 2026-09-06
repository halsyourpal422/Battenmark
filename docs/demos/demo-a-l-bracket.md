# Demo A — L-Bracket (Prompt → Multi-Feature Part)

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP  
**Backend:** FreeCAD / OpenCascade 1.1.3

## Result: PASS

| Metric | Value |
|--------|-------|
| Volume | **24,046.954 mm³** |
| Surface Area | 12,074.147 mm² |
| Solids | 1 |
| Valid | true |

## Design

L-shaped bracket: base plate (70×50×4 mm) with vertical wall (6×50×35 mm), mounting holes (Ø4.5mm), and 1.5 mm fillet.

## Key Insight

Face selector ambiguity after boolean union is avoided by creating features on **individual bodies before** `boolean_union`. After union, semantic selectors (`front_face`, `left_face`) resolve to the base plate's thin (4 mm) face instead of the wall's thicker (6 mm) face.

## Evidence

Full evidence package archived on Google Drive:
`Demo_Captures/candidate-31ee9369/demo-a-prompt-part/`

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
