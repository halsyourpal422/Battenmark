# 3D-Printable Enclosure

## Purpose
Design a mechanically credible, FDM-friendly enclosure around **measured** component dimensions, with clearances, mounting features, connector openings, and verification before export.

## Use when
- Real component outer dimensions, connector locations, and mounting points are known or obtainable.
- Part will be printed on a consumer FDM printer.

## Do not use when
- Component dimensions are unknown (do not invent numbers).
- Pure mechanical assembly of existing parts (use `assembly`).

## Preconditions
- **REQUIRED**: Measured component dimensions; explicit clearance assumptions; units mm.
- **RECOMMENDED**: `inspect_backend_capabilities` if unsure about boolean/hole/export.

## Planning rules
1. Collect measurements first; label unknowns.
2. Define parameters for sizes, wall, clearances before solids.
3. Model cavity from measured component + clearances; keep parametric.
4. Preserve mounting features and connector openings.
5. Never invent dimensions.

## Recommended operation sequence
1. **REQUIRED** — `project_create` / `project_open`; capture measurements as parameters.
2. **REQUIRED** — outer shell + cavity via `create_box` / `boolean` (expression-driven).
3. **RECOMMENDED** — lid, ports, standoffs, light fillets.
4. **REQUIRED** — `validate` → `render_preview` → `rebuild` → export.

## Geometry / mechanical rules
Never invent component dimensions. Clearance is a stated design decision. Wall thickness defaults are contextual (e.g. typical consumer FDM starting range 1.6–3.0 mm — confirm for printer/nozzle/material).

## Verification gates
Critical dimensions are parameters with sources; validate clean; cavity extents match; export artefact IDs returned.

## Failure recovery
Structured error → refine selectors → backend-diagnostics. Never bypass public service layer.

## Outputs
Parametric enclosure, previews, authoritative STEP/FCStd artefact IDs, clearance assumptions note.

## Platform notes
Backend-neutral intent. Use `fdm-dfm` for manufacturability review after modelling.

## Examples
PCB enclosure: measured PCB size + clearance + wall parameters; cavity boolean; openings; lid; validate → preview → export. Replace numbers with real measurements.
