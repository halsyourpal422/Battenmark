# ADR 0001 — Assembly IR, instancing and the solver boundary

Status: accepted (Phase 6)

## Decisions

1. **Definition ≠ instance.** Definitions own design content (snapshot of
   bodies/features/parameters, or imported geometry flagged non-parametric).
   Instances hold only identity + transform. Repeated instances never copy
   design trees; `set_definition_parameter` updates every instance.
2. **Canonical transform** = mm translation + unit quaternion scalar-last
   (`{x,y,z,w}`), matching FreeCAD's Rotation order for lossless adapter use.
   Euler XYZ degrees are accepted input sugar, normalized on ingest.
3. **Constraint IR before solver.** Constraints are typed mechanical intent
   referencing instance-qualified semantic geometry — never OCC indices,
   never FreeCAD object names.
4. **Solver boundary.** Phase 6 ships a deterministic sequential resolver for
   a rigid subset (fixed/mate/axis/concentric/distance/angle) computed
   kernel-free from definition evaluations. No general solver is claimed;
   underconstraint and deferred constraints are reported, not hidden.
5. **FreeCAD representation.** `App::Part` + one `Part::Feature` per instance,
   transform carried by `Placement` (shapes stay definition-local). Chosen for
   1.0.x/1.1.x compatibility, FCStd hierarchy fidelity, and volume-preservation;
   `App::Link` sharing is deferred (container plumbing differs across versions).
6. **Schema evolution.** Assemblies are an additive optional field
   (`document.assemblies`). Schema stays **2**; pre-assembly documents load
   unchanged.
7. **Security/scope.** Imported components go through the existing path-scoped
   importer only; no backend Python execution surface was added. Instance/
   constraint limits: 512 / 1024 / 128 definitions.
