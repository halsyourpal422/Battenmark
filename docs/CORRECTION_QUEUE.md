# Battenmark Correction Queue

Status: 2026-09-07 — **P0 Orange Pi correction CLOSED**

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

## Open engineering investigation

The correction also exposed a discrepancy that remains worth reproducing, but
PR #27 narrowed its interpretation substantially.

A focused authoritative FreeCAD regression on current `main` creates a pocket,
changes its depth from 3 mm to 6 mm through `set_feature_param`, and confirms the
updated result in the Battenmark IR, fresh FreeCAD rebuild, STEP export, 3MF
export and after a worker restart. The full CI suite passed without any
production-code change.

Therefore the Orange Pi observation is **not established as a generic pocket
synchronization bug**. Recreating `Vent_ThroughSlots` after `Plug_Hollow` changed
feature history as well as pocket depth. The remaining issue is to reproduce the
benchmark's six-profile vent sketch plus surrounding lid feature history and
identify whether the cause is feature-order semantics, multi-profile behavior,
direction/placement or a genuine complex-model rebuild defect.

Track the investigation in GitHub issue #26.

## Promotion dependency

The Orange Pi CAD correction is **no longer a blocker** for PR #25.

The promotion branch now has corrected evidence wording, approved brand/media
assets and a completed benchmark package. The remaining gate is current-head CI
and merge readiness.
