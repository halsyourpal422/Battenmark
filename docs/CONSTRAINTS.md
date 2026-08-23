# Battenmark constraint model (Phase 6)

Battenmark's assembly constraints are a **bounded, deterministic rigid
subset** — not a full parametric solver.

Supported today: `fixed`, `mate_faces`, `align_axes`, `concentric`,
`set_distance` (positive = air gap), `set_angle` (explicit degrees).

Not supported yet: parallel/perpendicular shorthands, gear/screw joints,
path mates, symmetric mates, collision-driven solving, motion/kinematics.

Semantics: insertion-order evaluation; second reference moves; grounded
instances immovable; contradictory duplicates raise `CONSTRAINT_CONFLICT`;
unapplied leftovers raise `ASSEMBLY_UNSOLVED`; ambiguous or vanished
references surface as `GEOMETRY_REFERENCE_AMBIGUOUS` /
`GEOMETRY_REFERENCE_LOST`. DOF accounting is coarse but honest
(`remaining_dof` per instance in `inspect_assembly`).

Determinism: identical inputs (geometry, constraints, parameters, version)
produce byte-identical placements. See docs/adr/0001-assembly-ir.md.
