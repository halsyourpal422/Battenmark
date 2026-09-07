# Earlier Orange Pi single-solid enclosure benchmark

**Date:** 2026-09-06  
**Execution policy:** Battenmark-only CAD proof; direct FreeCAD bypass did not count  
**Overall result:** **PARTIAL**

This earlier enclosure run is retained because it demonstrates why Battenmark
benchmarks must score **specification fidelity separately from geometry
validity**.

## Final authoritative result

FreeCAD/OpenCascade rebuild reported:

- shape type: **Solid**;
- solid count: **1**;
- valid: **true**;
- bounding box: **96 × 68 × 22 mm**;
- volume: **31,531.285 mm³**.

Those facts prove that the final B-rep was a valid single solid. They do **not**
prove that the enclosure matched the requested feature coordinates.

## Coordinate failure

The run exposed a mounting-standoff interpretation error.

During correction, rear standoffs that had been placed outside the shell were
moved from `y=89` to `y=61`. However, the final front-right standoff remained at
**`x=61`** even though the corrected coordinate should have been **`x=89`** for
the interpreted board orientation.

That means the authoritative solid remained geometrically valid while one of
its key mechanical features was still dimensionally wrong.

## Classification

| Area | Result |
| --- | --- |
| Battenmark-only execution | PASS |
| Authoritative rebuild | PASS |
| Single-solid geometry validity | PASS |
| Bounding-box inspection | PASS |
| Mounting-feature coordinate fidelity | **FAIL** |
| Overall benchmark | **PARTIAL** |

## Benchmark lesson

A CAD benchmark must not stop at:

```text
valid == true
solid_count == 1
```

It also needs to compare the authoritative result against the requested
engineering specification: feature coordinates, clearances, dimensions,
orientation, mating geometry and functional intent.

This earlier run directly motivated the stronger evidence policy used by the
later two-piece Orange Pi benchmark.
