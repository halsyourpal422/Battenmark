# Mechanical Assembly

## Purpose
Build a multi-part assembly from component definitions, create instances, ground a reference frame, apply constraints **incrementally**, inspect degrees of freedom (DOF) after meaningful steps, detect over-constraint and interference, then export.

## Use when
- Two or more parts must be positioned with mechanical constraints.
- You need honest remaining-DOF feedback after each major mate.

## Do not use when
- Still designing a single solid (use `basic-part` or `enclosure`).
- Need kinematics, gear joints, or path mates (not in the current bounded rigid subset).

## Preconditions
- **REQUIRED**: Parts exist as bodies or will be modelled first.
- **RECOMMENDED**: `inspect_backend_capabilities` for assembly support.

## Planning rules
1. Model or import each part independently.
2. Create assembly → define components → create instances.
3. Ground exactly one reference instance with `fix_instance`.
4. Add constraints one at a time; after each major step call `inspect_assembly`.
5. Prefer under-constraint you can tighten over over-constraint you must undo.
6. Use solver errors as evidence.

## Recommended operation sequence
1. **REQUIRED** — Model parts or import; `validate`.
2. **REQUIRED** — `create_assembly` → `define_component` → `create_instance`.
3. **REQUIRED** — `fix_instance` on reference (grounds 6 DOF).
4. **REQUIRED** — Incremental: `mate_faces`, `align_axes` (concentric), `set_distance`, `set_angle`, …
5. **REQUIRED** — After each major constraint: `inspect_assembly` (read remaining_dof).
6. **RECOMMENDED** — `check_interference`.
7. **REQUIRED** — `rebuild_assembly` → `export_assembly`.

## Geometry / mechanical rules
### DOF expectations (diagnostic — always trust inspect_assembly)

| State | Typical remaining DOF |
|-------|------------------------|
| Free instance | 6 |
| After planar `mate_faces` | 3 |
| After concentric | 2 |
| Concentric + axial stop | 1 |
| Fully constrained | 0 |

Constraints evaluate in insertion order; second referenced instance moves; grounded never move. Do not stack redundant constraints blindly. Do **not** reproduce the solver inside the skill; inspect the real output.

## Verification gates
Grounded reference; expected remaining DOF / fully_constrained; no CONSTRAINT_CONFLICT; interference clean or documented; export artefact ids.

## Failure recovery
Read structured error → `inspect_assembly` → `remove_constraint` → re-apply. Backend issues → backend-diagnostics. Never private FreeCAD APIs.

## Outputs
Assembly with stable definitions/instances, DOF inspection report, export artefact ids, previews.

## Platform notes
Assembly semantics are Battenmark IR + DOF model (docs/ASSEMBLIES.md, ADR-0001, ADR-0002). Provider-neutral.

## Examples
Two-block planar mate: create two boxes → create_assembly → define_component ×2 → create_instance → fix_instance → mate_faces → inspect_assembly (expect ~3 DOF) → check_interference → export_assembly. Confirm DOF from inspect_assembly, not from the table alone.
