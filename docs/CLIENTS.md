# Clients

Every client uses the same AgentCAD tools. Do not fork CAD logic per vendor.

| Client | How | Status |
| --- | --- | --- |
| **Grok (studio)** | `runAgentTurn` → `AgentCadService` | Verified in-app |
| **MCP Inspector / SDK** | stdio or Streamable HTTP `/mcp` | Verified (`test:mcp:stdio`) |
| **CLI / scripts** | `npx agentcad … --json` | Verified (`test:cli`) |
| **HTTP clients** | `/api/v1` | Verified (`test:http`) |
| **Claude / Codex / Warp / OpenCode** | stdio MCP config in CLIENTS.md | Documented, same MCP server |
| **ChatGPT custom MCP** | Streamable HTTP `/mcp` + bearer token | Documented; product/plan may block remote MCP |

## Claude / Cursor / Codex / Warp / OpenCode

```json
{
  "mcpServers": {
    "agentcad": {
      "command": "npx",
      "args": ["tsx", "src/cad/mcp/stdio.ts"]
    }
  }
}
```

## ChatGPT

Point a custom MCP connector at Streamable HTTP `POST /mcp` with `Authorization: Bearer …`. If the account cannot add remote MCP servers, that is a product restriction, not an AgentCAD failure. Prove the server with MCP Inspector.

## Typical agent workflow

1. `project_create`
2. `define_parameter` …
3. `create_box` / `create_hole` / `fillet`
4. `validate` → `save_revision`
6. `rebuild` → `export_step` → keep `artifact_id`
7. `render_preview` → look at the PNGs
8. HTTP `GET /api/v1/artifacts/{id}` for the file
