# MCP

SDK: `@modelcontextprotocol/sdk` **1.30.0** (official TypeScript SDK). MCP server version: **5.0.0** (`AGENTCAD_MCP_VERSION`). Speaks CAD schema **2**.

Protocol: whatever the SDK negotiates (Streamable HTTP + stdio, spec revision 2025-03-26 / current). Legacy HTTP+SSE is **not** the primary transport.

Tools are generated from `src/cad/schema.ts` (`TOOL_CATALOG`). There is no second CAD implementation for ChatGPT, Claude, or anyone else.

## Local stdio

```bash
npx agentcad mcp --stdio
# or
npx tsx src/cad/mcp/stdio.ts
```

Diagnostics go to **stderr**. Protocol frames go to **stdout**.

Example client config (Claude / Cursor / Codex / Warp / OpenCode — same command):

```json
{
  "mcpServers": {
    "agentcad": {
      "command": "npx",
      "args": ["tsx", "src/cad/mcp/stdio.ts"],
      "env": {
        "AGENTCAD_WORKSPACE": "/absolute/path/to/projects"
      }
    }
  }
}
```

## Remote Streamable HTTP

```text
POST /mcp
Accept: application/json, text/event-stream
Authorization: Bearer $AGENTCAD_API_TOKEN
```

Stateless: each POST is an independent JSON-RPC request. `project_id` is the session. GET/DELETE return 405.

`agentcad serve` (default `127.0.0.1:8787`) and the studio process both expose `/mcp`.

## Tool contract

- `project_id` is required on document-scoped tools.
- Results are JSON: `{ ok, project_id, document_id, revision_id, feature_id, data, error }`.
- Exports return `{ artifact_id, filename, bytes, format }` — not the file.
- `eval_python` / `shell` / `exec` are not registered. Calling them yields `PRIVILEGED_DENIED`.
- Annotations: `readOnlyHint`, `destructiveHint`, `idempotentHint`.

## MCP Inspector

1. Connect stdio (`npx tsx src/cad/mcp/stdio.ts`) or Streamable HTTP (`/mcp`).
2. List tools.
3. `project_create` → `create_box` → `inspect_document` → `set_parameter` → `rebuild` → `validate` → `export_step` → `get_artifact_metadata`.

Automated coverage: `npm run test:mcp:stdio` (in-memory + stdio spawn + Streamable HTTP initialize).
