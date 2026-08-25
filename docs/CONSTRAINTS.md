# Battenmark constraint model (Phase 6)

Battenmark's assembly constraints are a **bounded, deterministic rigid
subset** — not a full parametric solver.

Supported today: `fixed`, `mate_faces`, `align_axes`, `concentric`,
`set_distance` (positive = air gap), `set_angle` (explicit degrees),
`set_parallel` / `set_perpendicular` shorthands (planar faces; minimal
deterministic rotation of the second referenced instance; translation
preserved).

Not supported yet: gear/screw joints, path mates, symmetric mates,
collision-driven solving, motion/kinematics.

State truth: contradictory constraints **raise `CONSTRAINT_CONFLICT`** at solve time; the `conflicted` constraint_state is therefore not emitted through normal inspection. Residual validation is enforced post-solve — an applied relationship outside tolerance flips the assembly to `unsolved`. Redundant-but-mechanically-active constraints still contribute DOF restriction.

Semantics: insertion-order evaluation; second reference moves; grounded
instances immovable; contradictory duplicates raise `CONSTRAINT_CONFLICT`;
unapplied leftovers raise `ASSEMBLY_UNSOLVED`; ambiguous or vanished
references surface as `GEOMETRY_REFERENCE_AMBIGUOUS` /
`GEOMETRY_REFERENCE_LOST`. DOF accounting is coarse but honest
(`remaining_dof` per instance in `inspect_assembly`).

Determinism: identical inputs (geometry, constraints, parameters, version)
produce byte-identical placements. See docs/adr/0001-assembly-ir.md.
