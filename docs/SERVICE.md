# CAD service

Working identifier: **cad-service**. Historical prefix: AgentCAD.

This is a CAD **service**. The studio, Grok, MCP, CLI, Python, and HTTP API are adapters. None of them own the model.

```text
ChatGPT / Claude / Gemini / Codex / local models / scripts
        │
   MCP stdio │ MCP Streamable HTTP │ CLI │ HTTP /api/v1
        │
        ▼
  AgentCadService     (src/cad/service/agentcad.ts)
        │
  capability layer    inspect_backend_capabilities
        │
  persisted project   (AGENTCAD_WORKSPACE/projects/<slug>/)
        │
     CadKernel
   ╱             ╲
JSCAD preview   FreeCAD → OpenCascade → FCStd / STEP / STL / 3MF
```

Schema version: `agentcad_schema_version: 2` (independent of the app version). Schema 1 documents still load. See `docs/VERSIONING.md`.

## Handles

| Handle | Meaning |
| --- | --- |
| `project_id` | Stable id, also the workspace slug (`motor-bracket`). |
| `document_id` | Canonical `CadDocument.id` (`doc_…`). |
| `revision_id` | Checkpoint id (`rev_…`). |
| `artifact_id` | Exported file id (`art_…`). Retrieve via HTTP, never as raw bytes in tool results. |
| `feature_id` / `body_id` | Feature tree identities. Semantic names (`Plate`, `top_face`) also resolve. |

External clients reconstruct state from these handles plus the workspace. There is no hidden “current document.”

## Persistence

```text
projects/<slug>/
  project.json      metadata + handles
  document.json     canonical CadDocument
  source/           live .FCStd
  revisions/        FCStd snapshots
  exports/          kernel exports
  artifacts/<id>/   retrievable files + meta.json
  logs/             inspect dumps, idempotency keys
```

Restart the process, then `project_open(project_id)` — the model is still there.

## Mutations

```text
acquire per-project lock → load → operate → persist → checkpoint → release
```

Different projects do not block each other. The FreeCAD worker is still a single serialized process.

Idempotency: mutating HTTP calls honor `Idempotency-Key`. MCP/CLI can pass `idempotency_key`. Same key + same args replay the original result; same key + different args → `IDEMPOTENCY_CONFLICT`.

Dry run: `dry_run: true` validates structure against a clone and does not write.

Batch: `batch_operations` checkpoints, runs in order, rolls back the tree on the first failure.

Preview: `render_preview` writes isometric/front/top/right PNGs under `previews/` and as artifacts. MCP embeds the images.

Import: `import_step` / `import_fcstd` copy the file into `imports/` and rebuild a non-parametric `imported_solid`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENTCAD_WORKSPACE` | `./projects` | Project root |
| `AGENTCAD_FREECAD_CMD` / `FREECAD_CMD` | discovery | FreeCADCmd |
| `AGENTCAD_API_TOKEN` | (empty) | Bearer token for remote HTTP/MCP |
| `AGENTCAD_API_SCOPES` | `cad:read,cad:write,cad:export,cad:admin` | Token scopes |
| `AGENTCAD_REQUIRE_AUTH` | unset | Force auth even on loopback |
| `AGENTCAD_HOST` / `AGENTCAD_PORT` | `127.0.0.1` / `8787` | `agentcad serve` |
| `AGENTCAD_LOG_LEVEL` | `info` | Structured stderr JSON logs |
| `AGENTCAD_CORS_ORIGINS` | localhost preview origins | Never `*` by default |
| `AGENTCAD_BIND` | unset | Must be `0.0.0.0` to expose `serve` |

Do not hardcode FreeCAD paths. Do not put secrets in the CAD document.

## Grok / studio

The in-app Grok loop upserts the browser document into a persisted project, then every tool call goes through `AgentCadService`. Lab rebuild/export do the same. The Zustand store is a viewport cache, not the source of truth for external clients.
