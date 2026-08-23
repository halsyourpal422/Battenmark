# Contributing

This repository is a **CAD service**, not a chat-bot wrapper and not a FreeCAD GUI plugin.

Working identifier: `cad-service`. Do not treat "AgentCAD" as a final product name.

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
Service/transport changes: `npm run test:phase3`, `npm run test:schema`.
Discovery changes: `npm run test:discover`.

## Pull requests

- Keep the operation schema backend-neutral.
- If you add a capability, advertise it in `src/cad/backend/capabilities.ts` and fail with `BACKEND_UNSUPPORTED` when it is false.
- Do not claim circular patterns, assemblies, helical threads, or Windows support.
- Do not commit secrets, local FreeCAD user homes, or `.FCBak` files.
- Update `CHANGELOG.md`.
