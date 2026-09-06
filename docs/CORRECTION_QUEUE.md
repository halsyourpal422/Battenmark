# Battenmark Correction Queue

Status: 2026-09-06

This file tracks the immediate CAD corrections exposed by the current public
Orange Pi 4 Pro benchmark before that benchmark can be promoted as a full-fidelity
success.

## P0 — Orange Pi 4 Pro two-piece enclosure

### 1. Lid mating feature

**Current:** full-area solid plug, 90.6 × 57.6 × 4 mm.  
**Required:** hollow perimeter friction rim, approximately 2.4 mm wall thickness.

Acceptance criteria:

- full-area solid plug removed;
- perimeter rim remains on all four sides;
- interior cavity open or terminated at the cap inner face only;
- no geometry forcing the base walls outward during assembly;
- rebuild/inspection confirms intended mating geometry.

### 2. Vent function

**Current:** six blind slots, 2.4 × 55 mm, ending at z=3.  
**Required:** six true through-vents extending through the complete lid/rim stack.

Acceptance criteria:

- six slots preserved at 2.4 × 55 mm;
- each slot creates an open airflow path from exterior to enclosure interior;
- no residual 3 mm vent floor remains;
- rebuild and face inspection confirm through penetration.

### 3. Post-correction evidence

After both fixes:

- run authoritative rebuild;
- inspect corrected lid faces;
- inspect base and lid separately;
- preserve warnings/errors exactly;
- re-export FCStd / STEP / STL / 3MF;
- parse the new 3MF;
- confirm exactly two expected build objects;
- compare mesh sum against 3MF combined volume;
- use mesh/analytical cross-check if non-manifold-edge warnings persist;
- verify print orientation notes remain correct;
- classify geometry validity and specification fidelity separately;
- only then decide whether the benchmark can move from PARTIAL to PASS.

## Promotion dependency

PR #25 should remain draft until this correction run is completed or the project
explicitly decides to launch while presenting the Orange Pi result as a published
PARTIAL benchmark rather than a finished enclosure success.
