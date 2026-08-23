# CLI

Executable: `npx agentcad` (or `node bin/agentcad.mjs`).

Machine-readable JSON is the default contract for agents: always pass `--json`. Diagnostics on stderr, data on stdout, exit `0` on success.

```bash
agentcad status --json
agentcad capabilities --json

agentcad project create enclosure --json
agentcad project list --json
agentcad project inspect enclosure --json

agentcad box --project enclosure --length 80 --width 50 --height 12 --json
agentcad param set --project enclosure length 100 --json
agentcad inspect --project enclosure --json
agentcad validate --project enclosure --json
agentcad rebuild --project enclosure --json
agentcad export --project enclosure --format step --json
agentcad revisions --project enclosure --json
agentcad rollback --project enclosure rev_xxxx --json

agentcad mcp --stdio
agentcad serve --host 127.0.0.1 --port 8787
```

`--project` is required for geometry, inspect, validate, rebuild, and export. The CLI talks to `AgentCadService` in-process (no hidden HTTP). The same parser used by the studio command palette handles `box`, `hole`, `fillet`, `cylinder`, …
