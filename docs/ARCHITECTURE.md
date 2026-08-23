# Architecture

Working identifier: **cad-service** (not a public brand). Historical module prefix: `AgentCAD`.

A model-neutral CAD service for AI agents and ordinary software. FreeCAD/OpenCascade is the first authoritative backend. JSCAD is preview.

```text
ChatGPT / Codex / Claude / Gemini / local models / IDE agents / scripts
                                   │
             MCP / HTTP / Python / CLI / Studio
                                   │
                                   ▼
                     AgentCadService  (canonical)
                                   │
                 Typed operations / CAD IR   schema 2
                                   │
                      Backend registry (open IDs, dynamic roles)
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
     FreeCAD                      JSCAD                    mockcad
   authoritative                 preview                 test-only
   OpenCascade B-rep
        │
        └────────── future: build123d / CadQuery (same contract, new registration)
```

## Module map

| Area | Path | Class |
| --- | --- | --- |
| Protocol versions | `src/cad/version.ts` | universal core |
| Operation catalog | `src/cad/schema.ts` | universal core |
| CAD IR / document | `src/cad/types.ts`, `document.ts`, `operations.ts` | backend-neutral geometry semantics |
| Expressions | `src/cad/expressions.ts` | backend-neutral |
| Selectors / gref | `src/cad/selectors.ts` | backend-neutral |
| Capability + registry | `src/cad/backend/` | open backend IDs, dynamic roles |
| Canonical service | `src/cad/service/agentcad.ts` | universal core |
| HTTP | `src/cad/service/http.ts` | transport |
| MCP | `src/cad/mcp/` | transport |
| CLI | `src/cad/cli/` | transport |
| Python client | `python/agentcad/` | transport (thin HTTP) |
| FreeCAD adapter | `src/cad/kernel/freecad.server.ts`, `discover.server.ts`, `client.server.ts` | FreeCAD adapter |
| Worker | `freecad-worker/` | FreeCAD adapter (runs *inside* FreeCADCmd) |
| JSCAD preview | `src/cad/kernel/jscad.ts`, `src/cad/preview/` | JSCAD preview |
| Persistence | `src/cad/service/store.ts`, `projects/` | persistence |
| Studio | `src/components/`, `src/routes/` | Studio/UI |
| Host chrome | `AGENTS.md`, `public/__grok/`, `server/`, `startup.sh` | builder environment (kept for this sandbox) |

`src/cad/kernel/` is the **adapter layer**, not the public contract. Callers never send `PartDesign::Hole`.

## Dispatch

```text
create_hole { diameter, type: through, target: top_face, position }
        │
        ▼
AgentCadService.executeTool
        │
        ▼
capability resolution  (feature.hole.through)
        │
        ▼
CadDocument feature tree  (kind: "hole")
        │
        ▼
FreeCAD adapter
        │
        ├─ PD-eligible body → PartDesign::Hole
        └─ otherwise        → CSG cylinder cut
```

The caller stops at `create_hole`.
