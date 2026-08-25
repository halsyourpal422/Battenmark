# FDM Design-for-Manufacturing

## Purpose
Review an existing model for consumer FDM printability. Separate **general geometric principles** from **printer/material/orientation-specific** recommendations.

## Use when
- Solid or assembly is largely complete; need manufacturability pass before slicing.
- Target process is consumer FDM.

## Do not use when
- Model does not yet exist (design first with `basic-part` / `enclosure`).
- Need machine-specific G-code or slicer profiles.

## Preconditions
- **REQUIRED**: Project with geometry; intended print orientation known or to be decided.
- **RECOMMENDED**: Target nozzle/material/layer height if available; otherwise label numeric advice as defaults/ranges.

## Planning rules
1. Inspect real geometry first.
2. Confirm print orientation.
3. Apply general principles; only then consider material/printer-specific numbers.
4. Label every numeric value as contextual — never as universal law.

## Recommended operation sequence
1. **REQUIRED** — `inspect_document` / `inspect_body` / `query_geometry` → `render_preview`.
2. **REQUIRED** — Walk geometry checklist.
3. **RECOMMENDED** — Apply corrective features if needed → `validate` → re-preview.
4. **OPTIONAL** — mesh export for slicer; keep STEP/FCStd authoritative.

## Geometry / mechanical rules
### General principles
Prefer orientations minimising unsupported overhangs and long bridges. Avoid features thinner than practical for chosen nozzle/material (treat numbers as project-specific ranges).

### Contextual guidance (always label)
Example starting ranges — **must be confirmed for the actual printer/material**:
- Wall thickness often 1.2–3.0 mm for common 0.4 mm nozzles.
- Overhangs steeper than ~45–60° from vertical frequently need support or redesign.
Never present these as Battenmark or universal CAD rules.

## Verification gates
Geometry inspected with public tools; orientation stated; numeric recommendations labelled as defaults/ranges requiring confirmation; validate clean after edits.

## Failure recovery
Reduce fillet/thickness on limit failures; refine selectors; backend errors → backend-diagnostics. Never private FreeCAD Python.

## Outputs
Structured review (orientation, issues, contextual recommendations with confirmation language), updated previews/validation.

## Platform notes
Does not replace slicer analysis. Provider-neutral; backend-neutral intent.

## Examples
Bracket review: inspect extents/holes; confirm orientation; checklist walls/holes/overhangs; optional modest fillet; validate → preview. Re-inspect real model; do not copy example numbers.
