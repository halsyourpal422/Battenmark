# Versioning

Three numbers, one job each. Defined in `src/cad/version.ts`.

| Constant | Current | Meaning |
| --- | --- | --- |
| `AGENTCAD_SCHEMA_VERSION` | **2** | Wire format of operations, documents, and service envelopes |
| `AGENTCAD_SCHEMA_MIN_READABLE` | **1** | Oldest document/project metadata that still loads |
| `AGENTCAD_MCP_VERSION` | **5.0.0** | MCP server package version (5.x speaks schema 2) |
| `CAD_SERVICE_VERSION` | **0.5.6** | npm `cad-service` version (working identifier) |

Responses always claim schema **2**. Schema 1 documents remain readable. Unknown versions raise `SCHEMA_MISMATCH` (HTTP 409).

## Policy

- Additive optional fields do not bump the schema integer.
- Removing or reinterpreting a field requires schema 3 and a migration note.
- MCP major version tracks breaking tool/annotation changes; it is not the schema integer.
- Do not duplicate version literals in HTTP error paths or MCP `create-server`.
- Tests: `npm run test:schema`.

## Envelope

Every service result includes:

```json
{
  "ok": true,
  "operation": "create_box",
  "agentcad_schema_version": 2
}
```
