# Battenmark Assemblies (Phase 6)

Assemblies express **mechanical intent**: reusable component definitions,
placed instances, and semantic relationships. Callers never touch
`App::Part`, `Assembly::Joint`, placements quaternions on FreeCAD objects, or
OCC topology ids.

## Core concepts

| Concept | Meaning |
| --- | --- |
| **ComponentDefinition** | Reusable design content — a snapshot of bodies/features/parameters (native), or imported STEP/FCStd geometry (explicitly non-parametric). |
| **ComponentInstance** | One placement of a definition. Stable `instance_id`; array position is meaningless. Instances share the definition — no copied design trees. |
| **AssemblyTransform** | Canonical rigid placement: millimetre translation + unit quaternion (scalar-last). |
| **AssemblyRef** | Instance-qualified semantic reference: `bracket_1.top_face`, resolved per instance against the definition's own geometry. |
| **AssemblyConstraint** | Mechanical relationship between two references (or grounding one instance). |

## Workflow (agent-recommended)

```text
1. model each part with normal single-part operations
2. create_assembly
3. define_component  (snapshot; scope with include.body_ids or import a file)
4. create_instance   (stable id, optional initial transform)
5. fix_instance      (ground one reference frame)
6. add constraints incrementally: mate_faces / align_axes / set_distance / set_angle
7. inspect_assembly  (constraint status + remaining DOF + world bbox)
8. render_preview    (assembly_id renders instances at solved transforms)
9. rebuild_assembly / export_assembly (authoritative FreeCAD)
```

## Constraint semantics

Constraints are evaluated in **insertion order** and always move the **second**
referenced instance. Grounded instances never move.

| Kind | Reduces | Notes |
| --- | --- | --- |
| `fix_instance` | all 6 DOF of that instance | reference frame |
| `mate_faces` | 3T + 2R | faces oppose; optional `offset_mm` gap along anchor normal |
| `align_axes` | 2R | directions parallel |
| `concentric` (`align_axes … concentric:true`) | 2R + 3T | axis lines coincide exactly |
| `set_distance` | 1T | positive value = physical air gap along anchor outward normal |
| `set_angle` | 1R | dihedral angle in explicit degrees |

## Honest state reporting

`inspect_assembly` reports:

- `solved: boolean` — false when any constraint could not be applied;
- per-constraint status `applied | redundant | deferred`;
- per-instance `remaining_dof` (coarse rigid accounting);
- world bounding box from transformed component meshes.

Errors follow the canonical catalog: `ASSEMBLY_NOT_FOUND`,
`COMPONENT_NOT_FOUND`, `INSTANCE_NOT_FOUND`, `CONSTRAINT_NOT_FOUND`,
`INVALID_ASSEMBLY_REFERENCE`, `GEOMETRY_REFERENCE_LOST`,
`GEOMETRY_REFERENCE_AMBIGUOUS`, `CONSTRAINT_CONFLICT`,
`CONSTRAINT_UNSUPPORTED`, `ASSEMBLY_UNSOLVED`, `ASSEMBLY_LIMIT_EXCEEDED`.

## Solver boundary

Battenmark resolves a **bounded rigid subset** deterministically (pure TS over
kernel-free evaluations). This is not a general geometric constraint solver;
see docs/adr/0001-assembly-ir.md.

## Persistence & backends

Canonical state lives in `document.json` (`assemblies[]`, additive since the
alpha; schema stays 2). The FreeCAD adapter materializes:

```text
App::Part (assembly)
  └── Part::Feature per instance   Placement = solved transform
```

FCStd keeps this native hierarchy; STEP exports placed solids with instance
labels (structured product hierarchy depends on OCC XCAF behaviour — do not
assume it). Components are never fused.
