# Known limitations

Current platform limitations include:

- **Viewport is JSCAD.** The preview mesh is CSG. FreeCAD is the manufacturing kernel. Previews are not hidden-line OpenCascade drawings.
- **One serialized FreeCAD worker.** Per-project async locks isolate document mutations; OCC work still queues.
- **Vercel / serverless.** Spawning FreeCADCmd is a local/self-hosted capability.
- **Privileged Python** is disabled and is not an MCP/HTTP tool.
- **ChatGPT custom MCP** depends on the ChatGPT product/plan. Battenmark exposes standards-compliant Streamable HTTP; account restrictions are not treated as service failures.

## Semantic references

- Selectors are **stable under ordinary parametric changes** (length/width/wall). They are not a complete solution to topological naming. Booleans and topology-changing fillets can invalidate a stored `gref`; Battenmark then returns `GEOMETRY_REFERENCE_LOST` rather than silently picking another edge.
- JSCAD `query_geometry` uses the box envelope. Authoritative face/edge metadata comes from FreeCAD/OpenCascade.
- Hole rim edges are not classified as `top_perimeter` (line edges only).

## PartDesign

- `PartDesign::Hole`, `PartDesign::LinearPattern`, `PartDesign::Fillet` are used when a body is **PD-eligible**: it starts with a box and then only holes, fillets, chamfers, and patterns. Bodies with booleans, extra primitives, or sketches keep the Part CSG driver (cylinder cuts, `Part::Fillet`).
- The enclosure (cavity boolean, USB cut, posts) is CSG. The hole-plate demo is PartDesign.
- Helical threads are **not** modeled. `thread` is cosmetic metadata.
- Sketch hole centers are written at rebuild time from resolved expressions. Opening the FCStd in desktop FreeCAD and editing `Params.inset` will not move sketch points until Battenmark rebuilds.

## Patterns

- Linear and rectangular patterns are implemented. Circular patterns return `BACKEND_UNSUPPORTED` (`pattern.circular=false`).
- PartDesign linear patterns use the hole sketch `H_Axis` / `V_Axis`. Direction `z` on a top-face hole is not useful.

## Assemblies

- Assemblies, mates, rigid constraints, rank-based DOF diagnostics, interference checks, and FCStd assembly export are implemented.
- The current assembly feature set is a rigid subset. Nested assemblies, assembly-level patterns, and advanced joint families such as screw/gear/path joints are not implemented.
- GD&T and CAM are not implemented.

## Architecture

- One serialized FreeCAD worker. See `docs/KERNEL.md`.
- macOS Apple Silicon discovery is implemented; hardware-validation status is tracked in `docs/MACOS.md` and release evidence.
- Windows is unsupported/unverified.
- The working package name remains `cad-service` for compatibility; the public project name is **Battenmark**.
- `agentcad serve` defaults to `127.0.0.1`. A single `AGENTCAD_API_TOKEN` is the current HTTP identity system; OAuth is future work.

## Import, preview, and SDK notes

- Previews rasterize the JSCAD evaluation, not a hidden-line OCCT drawing. Imported solids use a capped tessellation captured at import.
- Section views / TechDraw PDF are not implemented.
- Import does not reconstruct sketches, constraints, or spreadsheets from an arbitrary FCStd.
- The Python SDK talks HTTP only; it does not embed FreeCAD.

## Backend notes

- `BackendId` is open. Production registers `freecad` and `jscad`; `mockcad` is test-only and is not a geometry engine.
- `CadKernel.id` remains `"jscad" | "freecad"` for the two in-tree evaluators. A future engine adds a kernel adapter **and** a registry entry.
- Phase 6.2 closes backend-neutrality at the public contract / registry boundary; it does not ship build123d as a production backend.
