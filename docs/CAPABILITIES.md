# Battenmark capabilities (runtime-derived)

Capability truth comes from `inspect_backend_capabilities`; this document maps
the granular flags. Authoritative backend today: FreeCAD/OpenCascade.

| Group | Flags |
| --- | --- |
| Primitives | box, cylinder, sphere, sketch |
| Features | pad, pocket, hole (through/blind/counterbore/countersink), fillet, chamfer |
| Patterns | linear, rectangular (circular = false) |
| Boolean | union, subtract, intersect |
| Geometry | semantic_selectors, persistent_gref |
| Parametric | expressions, native (FreeCAD), rebuild |
| Import/Export | step, fcstd, stl (+3mf export) |
| Assembly | instances, fixed, face_mate, axis_alignment, concentric, distance, angle, parallel, perpendicular, interference (authoritative OCC) |
| Assembly (preview backend JSCAD) | preview=true, solver flags=false, authoritative=false |
| Deferred | nested assemblies, assembly patterns, instance_links flag reserved until cross-version hardening completes |

JSCAD never claims authoritative geometry or interference.
