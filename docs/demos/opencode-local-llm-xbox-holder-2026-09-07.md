# OpenCode + Local LLM Xbox Controller Holder Proof — 2026-09-07

## Result

**PASS — end-to-end CAD workflow plus downstream slicer ingestion.**

This run adds a third directly observed Battenmark client path:

```text
OpenCode + local LLM
        │
        ▼
    Battenmark
        │
        ▼
FreeCAD / OpenCascade
        │
        ├── STL
        └── 3MF
        │
        ▼
   ELEGOO Slicer
```

The important result is not that the holder is a finished consumer product. The
important result is that an OpenCode session backed by a local model drove
Battenmark into the authoritative FreeCAD/OpenCascade CAD backend, produced a
valid solid, exported normal print artifacts, and those artifacts were accepted
and sliced by a real downstream slicer.

No direct FreeCAD bypass was used for the CAD workflow.

## Artifact

The test artifact was an upright cradle-style holder for a standard Xbox
controller, with the following requested geometry:

- base platform: **190 × 120 × 8 mm**;
- left/right end walls: **15 × 110 × 65 mm**;
- nominal gap between grip-end walls: **160 mm**;
- rear lip: **190 × 12 × 30 mm**;
- USB cable through-slot: **16 × 16 mm**;
- cable-routing trough: **16 × 50 × 4 mm**.

The design intentionally used simple box-based geometry. This made the test more
about client-to-CAD execution, export integrity and downstream compatibility than
about advanced surfacing or ergonomic design quality.

## Battenmark / FreeCAD evidence

The completed workflow reported:

- authoritative rebuild: **PASS**;
- valid solids: **1**;
- solid volume: **458,252 mm³**;
- STL export: valid binary mesh, approximately **45 KB**;
- 3MF export: valid ZIP-based 3MF generated through the FreeCAD/OpenCascade
  path;
- direct FreeCAD bypass: **NO**.

The STL and 3MF were verified as parseable files on disk before the slicer test.

## ELEGOO Slicer evidence

The exported model was then opened in ELEGOO Slicer and successfully sliced for
an **ELEGOO Centauri, 0.4 mm nozzle** using the visible **0.20 mm Standard**
profile.

Observed slicer result:

- complete toolpath preview: **PASS**;
- model filament: **56.95 m / 171.21 g**;
- total filament: **57.95 m / 174.22 g**;
- model printing time: **3 h 38 min**;
- total estimated time: **3 h 39 min**;
- generated support material: approximately **2.81 g**.

The slicer screenshot also corrected an earlier assumption: the geometry was
not entirely support-free under the selected slicer settings. That is a print
orientation/settings observation, not a Battenmark interoperability failure.

## Evidence classification

This proof qualifies as:

- **End-to-end CAD workflow:** PASS;
- **FreeCAD/OpenCascade authoritative rebuild:** PASS;
- **STL export:** PASS;
- **3MF export:** PASS;
- **real downstream slicer ingestion:** PASS;
- **physical print:** NOT PERFORMED;
- **real Xbox controller fit/ergonomics:** NOT VALIDATED.

The user intentionally chose not to print this artifact because physical output
was unnecessary for the interoperability question being tested.

## Claim discipline

This evidence supports the narrow statement:

> OpenCode, when backed by the tested local-LLM setup, successfully used
> Battenmark to create and validate authoritative FreeCAD/OpenCascade CAD and
> produce an export that a real desktop slicer could ingest and slice.

It does **not** establish that every local model, every OpenCode configuration or
every CAD design will succeed. It also does not establish physical fit or
product-quality ergonomics for this holder.

For the broader client matrix, see
[`docs/CLIENT_VALIDATION.md`](../CLIENT_VALIDATION.md).
