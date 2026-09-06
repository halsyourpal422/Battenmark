# Universal CAD contract

Public operations describe **design intent**. Backends execute them.

Groups:

## Geometry creation

`create_box`, `create_cylinder`, `create_sphere`, `create_sketch` + `add_rectangle` / `add_circle`, `pad`, `pocket`, `create_body`.

Dimensions accept numbers or expressions (`wall * 2`). Box origin is the min corner, Z up.

## Feature operations

| Operation | Intent | Capability | Fallback |
| --- | --- | --- | --- |
| `create_hole` | Through/blind hole, optional C'bore/C'sink, semantic placement | `feature.hole.*` | PartDesign or CSG cut (adapter) |
| `fillet` | Blend edges by selector / gref | `feature.fillet` | PD fillet or `Part::Fillet` |
| `chamfer` | Chamfer edges | `feature.chamfer` | PD or Part |
| `create_pattern` | Linear / rectangular copies | `pattern.linear` / `.rectangular` | PD LinearPattern or CSG copies |
| `create_pattern` kind=`circular` | Circular copies | `pattern.circular` | **none** → `BACKEND_UNSUPPORTED` |
| `boolean` | union / subtract / intersect | `boolean.*` | Part boolean |

## Parameterization

`define_parameter`, `set_parameter`, `set_feature_param`, `inspect_dependencies`, `preview_parameter_change`. Cycles → `PARAMETER_CYCLE`.

## Geometry intent

`query_geometry`, `inspect_faces`, `inspect_edges`. Selectors: `top_face`, `top_perimeter`, `all_vertical`, `largest_planar`, `gref`, … Lost → `GEOMETRY_REFERENCE_LOST`. Ambiguous → `GEOMETRY_REFERENCE_AMBIGUOUS`.

## Persistent geometry references (`gref`)

A `gref` is a stable string identifier returned by `query_geometry` (e.g., `gref_face_001`). Callers store grefs and pass them back in subsequent selectors to target the same geometry entity.

**Resolution path:**

1. Direct `semantic_id` match against current face/edge enumeration.
2. If direct match fails and a stored `GeometryRef` entry exists in `CadDocument.geometryRefs[]`, the FreeCAD backend attempts **fingerprint-based re-resolution** — matching surface_type, role, area, normal, centroid, and other stored properties. Confidence is downgraded to `"strong"` on fallback.
3. If no match is found, the operation fails with `GEOMETRY_REFERENCE_LOST`.
4. If multiple candidates tie on fingerprint score, the operation fails with `GEOMETRY_REFERENCE_AMBIGUOUS`.

**Lifecycle:**

- `query_geometry` automatically stores `GeometryRef` entries in `CadDocument.geometryRefs[]` after each successful query. This activates the fingerprint fallback for subsequent resolution.
- `geometryRefs[]` is included in revision snapshots and survives rollback.
- `geometryRefs[]` is serialized with the document on project save/load.

**Limitations:**

- `semantic_id` values are **positional** (e.g., `gref_face_001` = first face after enumeration). After topology mutations (fillet, boolean, pocket), the mapping between positional indices and physical geometry changes. The fingerprint fallback mitigates this but is heuristic, not guaranteed.
- The JSCAD envelope path (used by the assembly solver) has **no fingerprint fallback** — only direct `semantic_id` match. If the envelope's face/edge count changes, grefs resolved through the envelope will fail.
- Fingerprint matching may fail after major topology changes (e.g., boolean subtract consuming the referenced face).

**Error codes:**

| Code | Meaning |
| --- | --- |
| `GEOMETRY_REFERENCE_LOST` | No current geometry matches the gref (direct or fingerprint) |
| `GEOMETRY_REFERENCE_AMBIGUOUS` | Multiple geometry entities match the gref equally |
| `GEOMETRY_SELECTOR_MULTIPLE_MATCHES` | Selector matches multiple entities (not gref-specific) |

**Recommended usage:**

1. Call `query_geometry` to discover and obtain grefs.
2. Store grefs for later use (they persist across serialization and rollback).
3. Pass grefs in selectors for subsequent operations (`fillet`, `chamfer`, `mate_faces`, etc.).
4. Handle `GEOMETRY_REFERENCE_LOST` by re-querying geometry and obtaining a fresh gref.

## Inspection / files

`inspect_document`, `validate`, `rebuild`, `export_step`, `export_fcstd`, `export_stl`, `import_step`, `import_fcstd`, `render_preview`.

Import is **not** parametric (`IMPORT_NOT_PARAMETRIC` / `parametric: false`).

## Determinism

The same document + parameters should rebuild to the same volume/bounds within kernel tolerance. Worker execution is serialized (one FreeCAD process). See `docs/KERNEL.md`.

## Errors

Machine-readable `error` codes. Important ones: `BACKEND_UNSUPPORTED`, `SCHEMA_MISMATCH`, `PARAMETER_CYCLE`, `GEOMETRY_REFERENCE_LOST`, `GEOMETRY_REFERENCE_AMBIGUOUS`, `KERNEL_UNAVAILABLE`, `WORKER_CRASHED`, `OPERATION_TIMEOUT`, `IMPORT_FAILED`, `EXPORT_FAILED`.

Do not return generic `"failed"` when a precise code exists.

## Future (not implemented)

`fix`, `mate`, `align`, `concentric`, `distance`, `angle` — assembly/constraint operations. Schema room exists via capability keys `assembly` / `constraints` (both false today). Public IDs must remain semantic (`gref`, body/feature names), never FreeCAD object IDs.
