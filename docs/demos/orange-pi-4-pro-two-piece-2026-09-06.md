# Real-world proof: two-piece Orange Pi 4 Pro enclosure

**Date:** 2026-09-06  
**Execution path:** Claude / ChatGPT Work-style local agent workflow → Battenmark → FreeCAD 1.1.3 / OpenCascade  
**Bypass policy:** Battenmark only; zero direct FreeCAD bypasses  
**Overall result:** **PARTIAL**

This benchmark is intentionally recorded as PARTIAL. It is strong evidence that
Battenmark can drive a nontrivial, persistent, exportable two-piece CAD workflow
through the authoritative FreeCAD/OpenCascade backend, but it is **not** evidence
that every design requirement was interpreted and modeled correctly.

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
- FCStd / STEP / STL / 3MF export;
- persistence and reopen;
- iterative modification across **50 revisions**;
- recovery without bypassing Battenmark.

## Authoritative final geometry

### Base

- bounding box: **96 × 63 × 22 mm**;
- volume: **26,782.393 mm³**;
- feature count: **10**;
- authoritative geometry: valid solid.

### Lid

- bounding box: **96 × 63 × 6 mm**;
- volume: **32,563.687 mm³**;
- feature count: **5**;
- authoritative geometry: valid solid.

Both final pieces rebuilt successfully as separate valid solids.

## Export and persistence result

The run successfully produced the expected manufacturing/interchange artifacts:

- FCStd;
- STEP;
- STL;
- 3MF;
- the additional run export tracked by the benchmark, for **5 successful exports total**.

Persistence/reopen also passed after **50 revisions**. The authoritative project
state survived close/reopen and remained inspectable through Battenmark.

## What passed

### CAD execution / backend proof — PASS

- real Battenmark operations reached the local FreeCAD 1.1.3 / OpenCascade backend;
- nontrivial geometry was created and edited;
- two separate enclosure pieces were maintained;
- authoritative rebuild completed;
- both final solids were valid;
- exports completed;
- persistence/reopen completed;
- the workflow recovered from modeling failures without direct FreeCAD bypass.

### Interchange / persistence — PASS

The resulting project was not a preview-only artifact. It generated real CAD and
manufacturing formats and persisted across a long iterative session.

## Why the overall benchmark is PARTIAL

The final geometry was valid, but several modeling and specification-fidelity
problems prevent this run from being called a complete design pass:

1. **`create_box` position semantics** did not behave as expected in the workflow.
2. The **base pocket orientation** was effectively inverted relative to the intended construction.
3. A **multi-profile pocket** attempt failed.
4. **Face-touching pads** could become disconnected rather than producing the intended joined feature.
5. There was **document-vs-body `solid_count` ambiguity** during inspection.
6. The lid volume was approximately **32,563.687 mm³** versus an expected value near **30,594 mm³**, a difference of roughly **1,970 mm³**.
7. Some CSG hole operations produced **non-manifold-edge warnings** even though the final authoritative solids validated.

These are exactly the kinds of failures the public evidence should preserve.
Battenmark successfully executed, rebuilt, validated, exported and persisted the
CAD workflow; the agent/modeling layer did not yet achieve perfect dimensional
and semantic fidelity to the intended enclosure specification.

## Public claim allowed by this result

A defensible public statement is:

> Battenmark has completed a real two-piece Orange Pi 4 Pro enclosure workflow
> through FreeCAD/OpenCascade, including iterative modeling, authoritative
> rebuild, valid final solids, multi-format export and persistence across 50
> revisions. The infrastructure path passed; the benchmark remains PARTIAL on
> design/spec fidelity, and the failure details are published.

Do **not** summarize this benchmark as “the Orange Pi case passed” without the
PARTIAL qualifier.

## Why this is useful promotion evidence

The value of this benchmark is not that the LLM made a flawless enclosure. It
shows that Battenmark can support the full engineering loop around a difficult
model:

```text
requirement
   ↓
agent decisions
   ↓
Battenmark typed CAD operations
   ↓
FreeCAD / OpenCascade authoritative geometry
   ↓
rebuild / inspect / validate
   ↓
correct / repair / continue
   ↓
FCStd / STEP / STL / 3MF
   ↓
persist / reopen / continue
```

Publishing the PARTIAL result also makes the benchmark more credible: geometry
validity and file generation are not being confused with specification fidelity.

## Classification

| Area | Result |
| --- | --- |
| Battenmark-only execution | PASS |
| FreeCAD/OpenCascade authoritative rebuild | PASS |
| Separate base/lid valid solids | PASS |
| Export | PASS |
| Persistence/reopen | PASS |
| Long iterative session | PASS — 50 revisions |
| Design/spec fidelity | PARTIAL |
| Overall benchmark | **PARTIAL** |
