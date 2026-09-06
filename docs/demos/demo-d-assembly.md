# Demo D — Assembly + DOF Diagnostics

**Candidate SHA:** `31ee9369fe84b35d83932e86bf9fd0b64564aedd`  
**Transport:** HTTP + MCP (mixed)  
**Backend:** FreeCAD / OpenCascade 1.1.3

## Result: PASS (mixed transport)

| Metric | Value |
|--------|-------|
| Body A volume | ~5,937.168 mm³ |
| Body B volume | ~5,937.168 mm³ |
| Combined volume | **11,874.336 mm³** |
| Solids | 2 |
| Valid | true |
| STEP export | 18,187 bytes |

## Workflow

1. Create two bracket bodies via HTTP
2. Define assembly container, place instances, mate faces via MCP
3. Multi-body geometry/export works via HTTP
4. Full assembly constraint + DOF diagnostics via MCP

## Key Insight

Body/multi-body geometry and export were performed over **HTTP**. Full assembly constraints and DOF diagnostics used the **MCP transport**. The Battenmark schema includes assembly operations (`define_component`, `place_instance`, `mate_faces`) but the HTTP transport is not fully wired for these operations.

**This is the canonical status:** PASS with mixed transport. The demo met its designed acceptance criteria by intentionally using MCP for the assembly portion. Do NOT call HTTP fully assembly-capable.

## Evidence

Full evidence package archived on Google Drive:
`Demo_Captures/candidate-31ee9369/demo-d-assembly/`

## Quickstart Gates

All passed: bootstrap-macos.sh, npm install, tsc --noEmit, npm test, npm run test:freecad, npm run test:gref, npm run test:transport-parity
