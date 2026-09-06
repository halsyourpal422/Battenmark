# Demo Video Script & Shot List: Battenmark Phase 8B
**Purpose**: 45-60 second showcase of Battenmark's capabilities for public release
**Tone**: Confident, technical, accessible
**Target Audience**: Developers, engineering teams, technical decision-makers

## Shot List & Script (45-60 seconds)

### [0:00-0:05] OPENING TITLE
**VISUAL**: Battenmark logo + tagline "Open, backend-neutral CAD infrastructure"
**AUDIO**: Soft tech music begins
**VOICEOVER**: "Battenmark delivers authoritative CAD geometry through interchangeable backends."

### [0:06-0:12] QUICKSTART MONTAGE
**VISUAL**: Split-screen showing:
- Left: HTTP request creating box (code snippet)
- Right: FreeCAD preview rendering same box
**AUDIO**: Music continues
**VOICEOVER**: "One typed API. Multiple backends. Zero vendor lock-in."

### [0:13-0:20] DEMO A: L-SHAPED BRACKET (Key Innovation)
**VISUAL**: 
- 0:13: Base plate creation (70×50×4mm)
- 0:15: Vertical wall creation (6×50×35mm) 
- 0:17: Holes added to base (4×Ø4.5mm)
- 0:19: Holes added to wall (2×Ø4.5mm) - BEFORE union (key insight!)
- 0:21: Boolean union creates L-shape
- 0:23: Fillet applied (1.5mm radius)
- 0:25: Final validation PASS (valid=true)
**AUDIO**: Music builds slightly
**VOICEOVER": "Smart workflow: Create features on individual bodies BEFORE boolean operations. Avoids face selector ambiguity after union."

### [0:21-0:28] DEMO B: ROUND-TRIP ENGINEERING
**VISUAL**:
- 0:26: Import STEP from Demo A (workspace path)
- 0:28: Inspect faces (12 found) and edges (62 found)
- 0:30: Add pocket cutout (20×20×3mm box)
- 0:32: Boolean cut applied
- 0:34: Rebuild and validate PASS
**AUDIO**: Music continues
**VOICEOVER": "Full round-trip: Import → Inspect → Modify → Export. Same geometry, multiple paths."

### [0:29-0:35] DEMO C: PARAMETRIC CORRECTION
**VISUAL**:
- 0:29: Initial holes (3×Ø5mm at 10mm spacing)
- 0:31: Requirement change: spacing increased to 15mm
- 0:33: Delete old holes, create new with wider spacing
- 0:35: Rebuild and validate PASS
**AUDIO**: Music continues
**VOICEOVER": "Iterative correction: Change requirements, re-execute operations. Parametric workflow preserved."

### [0:36-0:42] DEMO D & E: ASSEMBLY & INTERCHANGEABILITY
**VISUAL**:
- 0:36: Two bracket instances created
- 0:38: Assembly container defined
- 0:40: Instances placed and mated (back-face to back-face)
- 0:42: DOF diagnostics show constrained system
**AUDIO**: Music peaks
**VOICEOVER": "Assemblies with constraints. DOF diagnostics. Same surface through face enum, spatial selectors, and feature references."

### [0:43-0:50] TECHNOLOGY STACK
**VISUAL**: Clean icons appearing:
- HTTP API (cloud)
- FreeCAD (gear)
- JSCAD (triangle)
- MCP (plug)
- CLI (terminal)
- Python (snake)
**AUDIO**: Music sustains
**VOICEOVER": "HTTP, MCP, CLI, Python clients. FreeCAD authoritative backend. JSCAD preview."

### [0:51-0:55] CALL TO ACTION
**VISUAL**: 
- Battenmark logo centered
- Text: "Try it today: npx agentcad serve"
- GitHub URL: github.com/halsyourpal422/Battenmark
**AUDIO**: Music resolves
**VOICEOVER": "Open source. Backend neutral. Ready for your CAD workflow."

### [0:56-0:60] CLOSING
**VISUAL**: Fade to black with Battenmark wordmark
**AUDIO**: Music ends with soft click

## Technical Notes for Production:
- **Resolution**: 1920×1080 (16:9)
- **Frame Rate**: 30fps
- **Codec**: H.264
- **Audio**: AAC stereo, 44.1kHz
- **Text Overlays**: Clean sans-serif font (Inter or similar)
- **Color Scheme**: Battenmark blues (#2563EB, #1D4ED8) on dark background
- **Timing**: Total 55 seconds ideal

## Key Messages to Emphasize:
1. **Backend Neutrality**: Same code works with FreeCAD/JSCAD
2. **Typed Safety**: No `as any`, strict schemas
3. **Interchangeable Targeting**: Multiple ways to reach same geometry
4. **Assembly Support**: Constraints and DOF diagnostics
5. **Round-trip Fidelity**: Import → Modify → Export preserves intent
6. **Validation Built-in**: Every operation can be validated