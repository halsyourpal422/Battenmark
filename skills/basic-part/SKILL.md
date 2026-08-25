# Basic Parametric Part

## Purpose
Create a simple, fully dimensioned solid part using parameters, common features, inspect, preview, and export an authoritative CAD artefact.

## Use when
- Single parametric body (bracket, plate, spacer, simple housing half).
- Dimensions may change later and should be driven by named parameters.

## Do not use when
- Assembling multiple parts (use `assembly`).
- FDM manufacturability review only (use `fdm-dfm`).

## Preconditions
- **REQUIRED**: Live Battenmark project; units millimetres; X-right, Y-depth, Z-up.
- **RECOMMENDED**: `inspect_backend_capabilities` if unsure about holes/fillets/export.

## Planning rules
1. Capture design intent in named parameters before geometry.
2. Prefer expressions over duplicated constants.
3. Prefer semantic selectors over raw topology indices.
4. Inspect and preview before exporting.
5. Discover live tool surface; do not invent tool names.

## Recommended operation sequence
1. **REQUIRED** — `project_create` / `project_open`.
2. **REQUIRED** — `define_parameter` for changeable dimensions.
3. **REQUIRED** — `create_box` / `create_cylinder` (box origin = min corner).
4. **RECOMMENDED** — features: `create_hole`, `fillet`, `chamfer`, `boolean`.
5. **REQUIRED** — `validate` → `render_preview` → `rebuild` → `export_step` / `export_fcstd`.

## Geometry / mechanical rules
Units mm. Box origin = min corner. Keep hole diameter inside face. Fillet radius < half smallest adjacent dimension.

## Verification gates
`validate` clean; preview matches intent; export returns `artifact_id`.

## Failure recovery
Read structured error; refine selectors via `inspect_*`; backend issues → `backend-diagnostics`. Never private FreeCAD Python or shell.

## Outputs
Parametric model, validation result, preview, export artefact IDs.

## Platform notes
Provider-neutral; backend-neutral intent. Discover capabilities when optional features needed.

## Examples
Parametric plate with four mounting holes: parameters → create_box → four create_hole → validate → render_preview → export_step. Replace example numbers with real values.
