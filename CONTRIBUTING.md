# Contributing

Battenmark is a **backend-neutral CAD service**, not a chatbot wrapper and not a FreeCAD GUI plugin.

Public branding is **Battenmark**. Historical engineering identifiers such as
`AgentCadService`, `agentcad_schema_version`, `AGENTCAD_*`, `agentcad`, and
`agentcad-mcp` are retained as compatibility surfaces; do not introduce a
second public product name for them.

## Before you start

1. Read `docs/ARCHITECTURE.md`, `docs/CONTRACT.md`, and `docs/BACKENDS.md`.
2. Public operations describe **design intent** (`create_hole`), never a FreeCAD class (`PartDesign::Hole`).
3. MCP, HTTP, CLI, and Python must call the same `AgentCadService`. Do not add a second CAD engine for a new transport.
4. JSCAD is preview. FreeCAD/OCC is authoritative B-rep.

## Developer setup

### macOS Apple Silicon (Tier 1)

See `docs/MACOS.md`. Short path:

```bash
sh scripts/bootstrap-macos.sh
npm install
export AGENTCAD_FREECAD_CMD="/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"
npm run typecheck
npm run test:schema
npm run test:discover
npm run test:freecad
```

Homebrew is optional.

### Linux (headless / CI)

See `docs/LINUX.md`.

```bash
sh scripts/install-freecad.sh
npm install
npm run test:phase55
```

Windows is unsupported/unverified.

## Tests you must not skip

Geometry changes: `npm run test:cad`, `npm run test:phase5`, `npm run test:conformance`.
Persistent geometry-reference changes: `npm run test:gref`.
Service/transport changes: `npm run test:phase3`, `npm run test:schema`.
Discovery changes: `npm run test:discover`.

## Pull requests

- Keep the operation schema backend-neutral.
- If you add a capability, advertise it in `src/cad/backend/capabilities.ts` and fail with `BACKEND_UNSUPPORTED` when it is false.
- Do not claim circular patterns, helical solid threads, nested assemblies, assembly patterns, advanced joint types, or Windows support until those capabilities are actually implemented and validated.
- Assemblies are supported only for the currently documented rigid subset; keep claims aligned with `docs/ASSEMBLIES.md` and `docs/LIMITATIONS.md`.
- Do not commit secrets, local FreeCAD user homes, personal filesystem paths, or `.FCBak` files.
- Update `CHANGELOG.md` when the change is user-visible.
