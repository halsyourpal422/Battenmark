# Known limitations (Phase 5.5.1)

Phase 2 kernel debt still applies:

- **Viewport is JSCAD.** The on-screen mesh is still CSG. FreeCAD is the manufacturing kernel. Previews are not hidden-line OpenCascade drawings.
- **One serialized FreeCAD worker.** Per-project async locks isolate document mutations; OCC work still queues.
- **Vercel / serverless.** Spawning FreeCADCmd is a local/self-hosted capability.
- **Privileged Python** is disabled and is not an MCP/HTTP tool.
- **ChatGPT custom MCP** depends on the ChatGPT product/plan. AgentCAD exposes standards-compliant Streamable HTTP; account restrictions are not treated as service failures.

## Semantic references

- Selectors are **stable under ordinary parametric changes** (length/width/wall). They are not a complete solution to topological naming. Booleans and topology-changing fillets can invalidate a stored `gref`; AgentCAD then returns `GEOMETRY_REFERENCE_LOST` rather than silently picking another edge.
- JSCAD `query_geometry` uses the box envelope. Authoritative face/edge metadata comes from FreeCAD/OpenCascade.
- Hole rim edges are not classified as `top_perimeter` (line edges only).

## PartDesign

- `PartDesign::Hole`, `PartDesign::LinearPattern`, `PartDesign::Fillet` are used when a body is **PD-eligible**: it starts with a box and then only holes, fillets, chamfers, and patterns. Bodies with booleans, extra primitives, or sketches keep the Part CSG driver (cylinder cuts, `Part::Fillet`).
- The enclosure (cavity boolean, USB cut, posts) is CSG. The hole-plate demo is PartDesign.
- Helical threads are **not** modeled. `thread` is cosmetic metadata.
- Sketch hole centers are written at rebuild time from resolved expressions. Opening the FCStd in desktop FreeCAD and editing `Params.inset` will not move sketch points until AgentCAD rebuilds.

## Patterns

- Linear and rectangular patterns are implemented. Circular patterns return `BACKEND_UNSUPPORTED` (`pattern.circular=false`).
- PartDesign linear patterns use the hole sketch `H_Axis` / `V_Axis`. Direction `z` on a top-face hole is not useful.

## Architecture

- One serialized FreeCAD worker. See `docs/KERNEL.md`.
- macOS Apple Silicon discovery is implemented; it is **not** hardware-verified in this Linux sandbox.
- Windows is unsupported/unverified.
- Assemblies, mates, constraints, helical threads, GD&T, CAM are not implemented.
- The working package name is `cad-service`. No public brand has been chosen.

## Phase 3 notes

- Studio Zustand is a cache. External clients must use `project_id`.
- `agentcad serve` defaults to 127.0.0.1. The preview studio still binds all interfaces because the host platform requires it; `/api/v1` and `/mcp` use bearer auth off-loopback.
- A single `AGENTCAD_API_TOKEN` is the identity system. OAuth is future work.

## Phase 4 notes

- Previews rasterize the JSCAD evaluation, not a hidden-line OCCT drawing. Imported solids use a capped tessellation captured at import.
- Section views / TechDraw PDF are not implemented.
- Import does not reconstruct sketches, constraints, or spreadsheets from an arbitrary FCStd.
- The Python SDK talks HTTP only; it does not embed FreeCAD.

## Phase 5.5.1 notes

- `BackendId` is open. Production still registers only `freecad` and `jscad`. `mockcad` is test-only and is not a geometry engine.
- `CadKernel.id` remains `"jscad" | "freecad"` for the two real evaluators. A future engine adds a kernel adapter **and** a registry entry.
- Apple Silicon discovery is implemented; this sandbox is Linux x86_64 so Gates G–J are not hardware-verified.
