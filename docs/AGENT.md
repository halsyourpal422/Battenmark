# Agent skill — operating AgentCAD

You are a CAD operator, not a FreeCAD scripter. Use structured tools only.

**Reference design intent, not incidental topology.**

## Session

1. `kernel_status` / `inspect_backend_capabilities` if you need to know whether FreeCAD is live and which features it advertises.
2. `project_create` (or `project_open`) and keep `project_id`.
3. `inspect_document` before editing an existing project.
4. `define_parameter` for anything you may change later.
5. Build with `create_box` / `create_cylinder` / sketches / holes / fillets.
6. `validate`.
7. `save_revision`.
8. `render_preview` (`view: "all"` or `isometric`) and look at the images.
9. `rebuild` then `export_step` / `export_fcstd`. Keep `artifact_id`.

Never call `eval_python`, `shell`, or `execute_code`. They are not available.

## Units and frames

- Millimetres. X right, Y depth, Z up.
- Box origin is the **min corner**, not the center.
- Hole `x_mm,y_mm` start at the min corner of `top_face` / `front_face` / …
- `from_right_mm` / `from_front_mm` are offsets from the opposite edges of that face. Prefer those (or expressions such as `length - inset`) so holes stay 10 mm from a corner when the plate grows.

## Semantic modeling

- Prefer parameters. Prefer expressions over duplicated constants.
  - Bad: cavity origin `{ x: 2.4, y: 2.4, z: 2.4 }`
  - Better: cavity origin `{ x: "wall", y: "wall", z: "floor_thickness" }`
- Prefer semantic selectors. Avoid raw OCC indices.
  - Bad: fillet Edge18
  - Better: fillet `top_perimeter` or `all_vertical`
- Inspect with `query_geometry` / `inspect_edges` / `inspect_faces` before selecting ambiguous topology.
- If a selector is ambiguous or lost, read `GEOMETRY_REFERENCE_AMBIGUOUS` / `GEOMETRY_REFERENCE_LOST` and refine the selector. Do not guess.
- `inspect_dependencies("wall")` shows which features a parameter drives.
- Validate after edits. Render previews for visual checks (JSCAD approximation, not hidden-line OCC).

## Visual check

`render_preview` returns PNG artifacts (isometric, front, top, right). MCP embeds the PNGs so you can see them. If a hole is missing or a fillet exploded, fix the parameters and preview again.

## Import

`import_step` / `import_fcstd` load B-rep (or mesh). The result is **not** a parametric AgentCAD tree. You may query faces/edges on imported solids. Do not invent sketches, pads, or pockets that were not there.

## Errors

Read `error`, `suggestion`, and numeric limits (`maximum_estimated_radius_mm`). Retry with a legal value. Do not claim success if `validate` reports errors.

## Clients

The same tools work from Grok, Claude, Codex, Warp, OpenCode, MCP Inspector, `agentcad` CLI, HTTP `/api/v1`, and the Python client. Do not fork CAD logic per vendor.
