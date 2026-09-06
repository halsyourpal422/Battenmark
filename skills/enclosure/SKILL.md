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
3. Derive the main internal cavity from measured component dimensions + clearances; keep it parametric.
4. The main internal cavity is independent from every connector opening; create and verify it first.
5. Preserve mounting features and connector openings.
6. Never invent dimensions.

## Recommended operation sequence

1. **REQUIRED** — `project_create` / `project_open`; capture measurements as parameters.
2. **REQUIRED** — Create the outer body with `create_box` (expression-driven).
3. **REQUIRED** — Create and verify the main internal cavity: derive its size from component clearances and intended wall/floor thickness; create a distinct cavity tool with `create_box`; subtract it from the outer body with `boolean` operation `subtract` so the top is open and the intended walls and floor remain.
4. **REQUIRED** — Create connector openings as separate downstream features, for example with `create_sketch` → `add_rectangle` → `pocket` on the appropriate wall. A connector pocket is not the main cavity.
5. **RECOMMENDED** — lid, ports, standoffs, light fillets.
6. **REQUIRED** — `validate` → `render_preview` → `rebuild` → export.

## Geometry / mechanical rules

Never invent component dimensions. Clearance is a stated design decision. Derive cavity length and width from the measured component plus clearance. Set cavity depth to leave the intended floor, and inspect the result to confirm wall and floor thickness. Wall thickness defaults are contextual (e.g. typical consumer FDM starting range 1.6–3.0 mm — confirm for printer/nozzle/material).

## Verification gates

Critical dimensions are parameters with sources. Before final validation and export, confirm that the outer body exists, the main internal cavity exists with an open top and intended walls/floor, and required connector openings exist independently. Then validate clean, inspect cavity extents and wall/floor thickness, and require export artefact IDs.

## Failure recovery

Structured error → refine selectors → backend-diagnostics. Never bypass public service layer.

## Outputs

Parametric enclosure, previews, authoritative STEP/FCStd artefact IDs, clearance assumptions note.

## Platform notes

Backend-neutral intent. Use `fdm-dfm` for manufacturability review after modelling.

## Examples

PCB enclosure: measured PCB size + clearance + wall parameters; cavity boolean; openings; lid; validate → preview → export. Replace numbers with real measurements.
