# HTTP API

Versioned prefix: `/api/v1`. OpenAPI: `GET /api/v1/openapi.json`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | Kernels + capability summary (unauthenticated health) |
| GET | `/capabilities` | Machine-readable backend capability report |
| GET | `/projects` | List |
| POST | `/projects` | Create `{ name }` |
| GET | `/projects/{id}` | Open |
| GET | `/projects/{id}/document` | Inspect |
| POST | `/projects/{id}/operations` | `{ operation, arguments, dry_run? }` |
| POST | `/projects/{id}/batch` | `{ operations: [...] }` |
| POST | `/projects/{id}/rebuild` | FreeCAD rebuild |
| POST | `/projects/{id}/validate` | `{ kernel?: "jscad"\|"freecad" }` |
| GET/POST | `/projects/{id}/revisions` | List / save |
| POST | `/projects/{id}/rollback` | `{ revision_id }` |
| POST | `/projects/{id}/exports` | `{ format: "step"\|"fcstd"\|"stl"\|"3mf"\|"json" }` |
| GET | `/artifacts/{artifact_id}` | File bytes (`?download=meta` for JSON) |

Idempotency: header `Idempotency-Key` on mutating operations.

Example:

```bash
curl -sS -H "Authorization: Bearer $AGENTCAD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"http-plate"}' \
  http://127.0.0.1:8787/api/v1/projects

curl -sS -H "Authorization: Bearer $AGENTCAD_API_TOKEN" \
  -H "Idempotency-Key: box-1" \
  -d '{"operation":"create_box","arguments":{"length_mm":80,"width_mm":50,"height_mm":12}}' \
  http://127.0.0.1:8787/api/v1/projects/http-plate/operations
```

Standalone server defaults to **127.0.0.1**. Binding `0.0.0.0` requires `AGENTCAD_BIND=0.0.0.0`. CORS is an allow-list, not `*`.
