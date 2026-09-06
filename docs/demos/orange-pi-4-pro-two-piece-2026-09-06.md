# Real-world proof: two-piece Orange Pi 4 Pro enclosure

**Date:** 2026-09-06  
**Execution path:** Claude → Battenmark MCP → FreeCAD 1.1.3 / OpenCascade  
**Bypass policy:** Battenmark only; zero direct FreeCAD bypasses  
**Exported revision:** `rev_2jbr5m` — revision **50 / 50**  
**Document:** `doc_pwjq1a`  
**Project:** `opi4pro-enclosure`  
**Artifact:** `art_vfljcv`  
**Final decision:** **CAD_CORRECTION_REQUIRED**  
**Overall benchmark result:** **PARTIAL**

This benchmark is intentionally recorded as PARTIAL. It is strong evidence that
Battenmark can drive a long, nontrivial, persistent, exportable two-piece CAD
workflow through the authoritative FreeCAD/OpenCascade backend, but it is **not**
evidence that every design requirement was interpreted and modeled correctly.

The final audit also corrected an earlier evidence mistake: the raw B-rep volume
numbers are **not trustworthy for these bodies** because both bodies carry
non-manifold-edge warnings. The exported 3MF mesh and analytical geometry agree
to floating-point tolerance and are the reliable volume evidence for this run.

## What the run exercised

The run built a two-piece Orange Pi 4 Pro enclosure and exercised:

- parameter registration;
- sketches;
- pockets;
- pads;
- booleans and feature repair;
- fillets;
- separate base and lid bodies;
- ventilation features;
- authoritative FreeCAD/OpenCascade rebuild and inspection;
- face-level geometry inspection;
- FCStd / STEP / STL / 3MF export;
- persistence and reopen;
- iterative modification across **50 revisions**;
- 3MF mesh audit;
- recovery without bypassing Battenmark.

## Authoritative geometry and volume evidence

### Base

- B-rep bounding box: **96 × 63 × 22 mm**;
- B-rep-reported volume: **26,782.393 mm³** — **UNRELIABLE for volume accounting in this run**;
- audited mesh volume: **28,142.687 mm³**;
- reason for preferring mesh volume: non-manifold-edge warning invalidates the OpenCascade volume integral as a trustworthy ground-truth measure here.

### Lid

- B-rep bounding box: **96 × 63 × 6 mm**;
- B-rep-reported volume: **32,563.687 mm³** — **UNRELIABLE for volume accounting in this run**;
- audited mesh volume: **30,594.240 mm³**;
- analytical volume: **30,594.240 mm³**;
- analytical check:

```text
96×63×2 + 90.6×57.6×4 − 6×(2.4×55×3)
= 30,594.240 mm³
```

### Combined volume

- mesh sum: **58,736.927 mm³**;
- exported 3MF combined volume: **58,737.036 mm³**;
- discrepancy: **0.109 mm³**;
- interpretation: negligible floating-point / tessellation difference;
- B-rep aggregate volume: **59,346.079 mm³** — about **609 mm³ high**, explained by the same non-manifold B-rep-volume problem.

## 3MF fidelity audit

The exported 3MF was parsed and audited directly.

- object count: **2**;
- object 1: base, **604 triangles**, manifold;
- object 2: lid, **124 triangles**, manifold;
- both build items use identity transform;
- no stale or phantom geometry was found;
- 3MF geometry matches the current modeled geometry;
- combined 3MF volume agrees with the audited mesh sum to **0.109 mm³**.

This means the exported 3MF is a faithful representation of the **current CAD
model**. It does **not** mean the current CAD model is mechanically correct.

## Lid mating-feature audit

The lid's mating feature is a **solid plug**, not the intended hollow perimeter
friction rim.

Evidence:

- `gref_face_035` is the plug bottom face at `z=6` with normal `+Z`;
- face area: **5,218.56 mm²**;
- `90.6 × 57.6 = 5,218.56 mm²` exactly;
- therefore the current mating feature is a full rectangular slab, not a hollow rim.

### Design consequence

This is **not the intended lid design**. A solid 90.6 × 57.6 × 4 mm plug can
force the enclosure walls outward and may stress or crack printed PLA/PETG
walls during assembly.

Required correction:

- replace the solid plug with a hollow perimeter friction rim;
- target rim wall thickness: approximately **2.4 mm** on all four sides;
- interior cavity should be open, or terminate at the cap inner face (`z=2`) without creating a solid full-area plug.

## Vent audit

The six lid vent slots are **blind**, not through-vents.

Evidence:

- `gref_face_036` through `gref_face_041` are the vent floor faces;
- each floor area is **132 mm² = 2.4 × 55 mm**;
- vent floors are at `z=3`;
- current slots run `z=0 → 3`;
- the lid/plug continues to `z=6`;
- therefore **3 mm of solid material remains below each vent floor**.

There is currently no open airflow path from the exterior through to the
interior enclosure volume.

Required correction:

- extend each of the six vent cuts through the full modeled lid/rim stack;
- target depth: **6 mm** for the current coordinate system;
- preserve six slots at **2.4 × 55 mm** each.

## Print orientation audit

### Base

Required orientation before printing:

- flip **180° about X or Y**;
- model origin `z=0` is the open rim;
- `z=22` is the closed floor;
- closed floor should be on the print bed;
- open rim faces upward;
- this avoids unnecessary support under the floor and keeps the internal bosses / wall features in a favorable print orientation.

### Lid

Required orientation before printing:

- **cap-down**;
- no flip is required if exported at the current model origin;
- `z=0` is the exterior cap face and should sit on the print bed;
- the mating feature grows upward;
- after the vent correction, slots remain printable without support in this orientation.

## Export and persistence result

The run successfully produced the expected manufacturing/interchange artifacts,
including FCStd, STEP, STL and 3MF outputs. Persistence/reopen also passed after
**50 revisions**. The project state survived close/reopen and remained
inspectable through Battenmark.

## What passed

### Battenmark / client interoperability — PASS

- Claude discovered and used the Battenmark MCP tool surface;
- the full enclosure run stayed inside Battenmark;
- direct FreeCAD bypass was **not used**.

### CAD execution / backend proof — PASS

- real Battenmark operations reached local FreeCAD 1.1.3 / OpenCascade;
- nontrivial geometry was created and edited;
- two separate enclosure pieces were maintained;
- rebuild/inspection completed;
- exports completed;
- persistence/reopen completed;
- the workflow recovered from modeling failures without direct FreeCAD bypass.

### 3MF export fidelity — PASS for current modeled geometry

The exported 3MF contains exactly the current base and lid meshes, with two
manifold objects and no phantom geometry. Its combined volume matches the mesh
sum to floating-point tolerance.

## What remains wrong

The current model should **not be printed as the final enclosure yet**.

1. **Solid plug must become a hollow perimeter rim.**
2. **Blind vent slots must become true through-vents.**
3. B-rep volume reporting for the current non-manifold-warning bodies must not be
   used as authoritative volume evidence.
4. Earlier modeling-semantic issues found during the run remain useful regression
   candidates (`create_box` positioning expectations, multi-profile pocket
   behavior, face-touching pad connectivity, and document-vs-body inspection
   semantics).

## Corrected evidence interpretation

An earlier summary compared the B-rep base/lid volume numbers directly and
suggested a roughly 609 mm³ 3MF/B-rep mismatch. The final audit resolves that:

- the **3MF is not missing geometry**;
- the exported mesh volume is internally consistent;
- the 3MF faithfully matches the current modeled geometry;
- the roughly 609 mm³ discrepancy comes from **unreliable B-rep volume
  integration on bodies carrying non-manifold-edge warnings**, not from stale or
  missing 3MF objects.

That correction matters because Battenmark's benchmark policy should distinguish
among:

- B-rep validity / warnings;
- measurement reliability;
- export fidelity;
- and specification correctness.

They are not interchangeable signals.

## Public claim allowed by this result

A defensible public statement is:

> Claude completed a 50-revision, two-piece Orange Pi 4 Pro enclosure workflow
> entirely through Battenmark into FreeCAD/OpenCascade, with persistence and
> multi-format export. The exported 3MF faithfully matches the current CAD model,
> but the benchmark remains PARTIAL and marked CAD_CORRECTION_REQUIRED because
> the lid mating feature is a solid plug instead of a hollow friction rim and
> the vent slots are blind rather than through-cut.

Do **not** summarize this benchmark as “the Orange Pi enclosure passed.”

## Classification

| Area | Result |
| --- | --- |
| Claude → Battenmark interoperability | PASS |
| Battenmark-only execution | PASS |
| Direct FreeCAD bypass avoided | PASS |
| FreeCAD/OpenCascade rebuild / inspection | PASS |
| Export fidelity to current geometry | PASS |
| 3MF object integrity | PASS — 2 manifold objects |
| 3MF volume vs audited mesh sum | PASS — 0.109 mm³ discrepancy |
| Persistence/reopen | PASS |
| Long iterative session | PASS — 50 revisions |
| B-rep volume reliability | **FAIL / unreliable for this run** |
| Lid mating-feature design | **FAIL — solid plug** |
| Vent function | **FAIL — blind slots** |
| Print readiness | **NO** |
| Overall benchmark | **PARTIAL / CAD_CORRECTION_REQUIRED** |
