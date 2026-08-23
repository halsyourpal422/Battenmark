# Auth

Remote HTTP and MCP Streamable HTTP are not open by default.

- Header: `Authorization: Bearer $AGENTCAD_API_TOKEN` (or `X-Api-Key`).
- Loopback without `AGENTCAD_REQUIRE_AUTH=1` is **developer mode** (all scopes) so the studio and local CLI tests work.
- Set `AGENTCAD_REQUIRE_AUTH=1` to demand a token even on localhost.
- Invalid token → `FORBIDDEN` (403). Missing token on a remote/required route → `AUTH_REQUIRED` (401).

## Scopes

| Scope | Capability |
| --- | --- |
| `cad:read` | status, inspect, list, validate, rebuild, artifact metadata |
| `cad:write` | mutations, project create, rollback, batch |
| `cad:export` | export endpoints |
| `cad:admin` | implied all |

A single process token currently carries `AGENTCAD_API_SCOPES` (default all four). This is the Phase 3 architecture, not a full identity platform. OAuth is out of scope.

stdio MCP and the in-process CLI do not use HTTP bearer tokens; they run as the local user against the workspace.
