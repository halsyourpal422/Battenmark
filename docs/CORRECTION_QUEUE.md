# Battenmark Correction Queue

Status: 2026-09-06 — **P0 Orange Pi correction CLOSED**

The Orange Pi 4 Pro two-piece enclosure correction task is complete. The hard
benchmark has moved from **PARTIAL / CAD_CORRECTION_REQUIRED** to **PASS**.

## Closed P0 — Orange Pi 4 Pro two-piece enclosure

### 1. Lid mating feature — COMPLETE

Final geometry:

- outer rim: **90.6 × 57.6 mm**;
- inner opening: **85.8 × 52.8 mm**;
- wall thickness: **2.4 mm**;
- rim elevation: **z=2 → z=6 mm**;
- full-area solid plug: **absent**.

### 2. Vent function — COMPLETE

Final geometry:

- six slots preserved at **2.4 × 55 mm**;
- stale blind vent pocket removed;
- replacement through-slot pocket depth: **6 mm**;
- residual `z=3` vent floors: **absent**;
- exterior-to-interior airflow path: **confirmed**.

### 3. Post-correction evidence — COMPLETE

- authoritative rebuild: PASS;
- separate base/lid inspection: PASS;
- specification fidelity: PASS;
- FCStd / STEP / STL / 3MF fresh export: PASS;
- 3MF objects: **2**;
- boundary mesh edges: **0 / 0**;
- non-manifold mesh edges: **0 / 0**;
- base mesh volume: **28,142.686683 mm³**;
- lid mesh volume: **13,138.560000 mm³**;
- analytical lid target: **13,138.56 mm³**;
- combined mesh volume: **41,281.246683 mm³**;
- Battenmark export volume: **41,281.356 mm³**;
- discrepancy: **0.109317 mm³ / 0.000265%**;
- fresh-process persistence/reopen: PASS;
- direct FreeCAD bypass: NO;
- overall benchmark: **PASS**.

See `docs/demos/orange-pi-4-pro-two-piece-2026-09-06.md`.

## New engineering regression item

The correction exposed a separate Battenmark platform issue:

> Editing an existing pocket depth updated Battenmark metadata from 3 mm to 6 mm
> without reliably rebuilding the worker geometry. Deleting/recreating only the
> stale pocket through Battenmark produced the correct persisted/exported shape.

This is now a platform bug/regression candidate and should be fixed independently
of the completed enclosure benchmark.

## Promotion dependency

The Orange Pi CAD correction is **no longer a blocker** for PR #25.

Remaining promotion work is presentation/readiness work: final CI, refreshed
hero/social assets around the corrected PASS, flagship demo packaging, and
public launch sequencing.
