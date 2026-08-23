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
