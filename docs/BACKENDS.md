# Backends

Backends are **registered**, not hard-coded into the CAD contract.

`BackendId` is an open validated string (`^[a-z][a-z0-9_-]{0,62}$`). Adding `build123d` or `cadquery` does not require editing `create_hole`.

```ts
const registry = createBackendRegistry();
registry.register({
  id: "freecad",
  name: "FreeCAD / OpenCascade",
  roles: ["authoritative", "import", "export"],
  capabilities: { "feature.hole.through": true /* … */ },
});
```

Roles (`authoritative`, `preview`, …) are advertised by each registration. `inspect_backend_capabilities` **derives** `roles.authoritative` / `roles.preview` from that table. The generic reporter does not contain the literals `"freecad"` / `"jscad"` as role assignments.

## Current production registration

| Backend | Roles | Status |
| --- | --- | --- |
| `freecad` | authoritative, import, export | Tier 1, implemented |
| `jscad` | preview, render | Implemented, **not** authoritative |
| `mockcad` | preview (test-only) | Registered only in tests |

Default backend = first available backend whose roles include `authoritative` (today: FreeCAD).

Explicit selection: pass `backend` on a tool call. Unknown → `BACKEND_NOT_FOUND`. Down → `BACKEND_UNAVAILABLE`. Missing capability → `BACKEND_UNSUPPORTED`. Duplicate register → `BACKEND_REGISTRATION_CONFLICT`. Exclusive role clash → `BACKEND_ROLE_CONFLICT`.

Ordinary `create_box(80,50,12)` does not require a backend argument.

## Discovery

`inspect_backend_capabilities` and `GET /api/v1/capabilities` return a typed report including `roles`.

FreeCAD currently advertises (honest subset):

| Key | Value |
| --- | --- |
| `feature.hole.through` / `.blind` / `.counterbore` / `.countersink` | true |
| `feature.hole.thread_cosmetic` | true |
| `feature.hole.helical_thread` | **false** |
| `pattern.linear` / `pattern.rectangular` | true |
| `pattern.circular` | **false** |
| `assembly` / `constraints` | **false** |
| `geometry.semantic_selectors` / `geometry.persistent_gref` | true |
| `import.step` / `import.fcstd` / `export.step` / `export.stl` | true |
| `render.preview` | false (preview is JSCAD) |

Unavailable capabilities fail with `BACKEND_UNSUPPORTED`. There is no silent CSG substitution that changes the requested intent for a feature the backend does not have (circular pattern is the current example).

Hole through/blind *may* be executed as PartDesign or as a CSG cut depending on body eligibility. That is an adapter choice, not a different public operation.

## Future adapters

build123d and CadQuery are intentionally **not** implemented. Register them the same way as `mockcad` (see `src/cad/backend/mockcad.ts`). The public operation schema must not change merely to acknowledge a new engine.

Do not copy APIs from `neka-nat/freecad-mcp`, `contextform/freecad-mcp`, `jdilla1277/agentcad`, or `pzfreo/build123d-mcp`. Those projects are references, not foundations.
