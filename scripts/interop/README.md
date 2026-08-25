# Interoperability harness (Phase 7A)

Verifies that external agents can operate Battenmark through its **stock MCP
surface** with zero donor-specific changes. Donor runtimes live OUTSIDE this
repository; pins are recorded in `donors.json`.

## Modes

| Command | What it does | CI |
| --- | --- | --- |
| `npm run interop:control` | Standards-compliant MCP client drives the deterministic chain: initialize → discover → project → geometry → assembly → constraint → DOF golden → structured-error recovery → FCStd export. Two runs, fresh server each (restart recovery). | ✅ safe for CI |
| `npm run interop:hermes` | Requires an external pinned Hermes checkout + venv (see `donors.json`). Drives stock Hermes client code (`tools/mcp_tool.py` → `registry.py`) through the same chain. Skips cleanly if `HERMES_REPO` is unset. | manual only |
| `npm run interop:agent-zero` | Reports the pinned Agent Zero client-capability finding (no generic MCP client at pin). | manual only |

## Hermes prerequisites

```bash
git clone https://github.com/NousResearch/hermes-agent "$HOME/hermes-src"
cd "$HOME/hermes-src" && git checkout 5908c577f9048a0adcdd80fc467501b0f1e60b1b
uv sync --extra mcp          # isolated .venv; mcp extra provides the MCP SDK
```

Create an isolated Hermes home at e.g. `$HOME/hermes-interop-home/config.yaml`:

```yaml
model:
  default: "qwen3-vl:8b"     # any provider you have credentials for
  provider: "custom"
providers:
  custom:
    base_url: "http://127.0.0.1:11434/v1"
mcp_servers:
  battenmark:
    command: "<ABS>/node_modules/.bin/tsx"
    args: ["<ABS>/src/cad/mcp/stdio.ts"]
    cwd: "<ABS>"             # Battenmark checkout root
    timeout: 120
    connect_timeout: 60
```

Run:

```bash
HERMES_REPO="$HOME/hermes-src" \
HERMES_HOME="$HOME/hermes-interop-home" \
AGENTCAD_FREECAD_CMD="/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd" \
  npm run interop:hermes
```

Expected output ends with `N/N hermes direct-client checks passed`.

Known upstream quirk encountered and documented in the evidence report: when
driven embedded (outside `cli.py`) on macOS, Hermes' `#81995` stdio fast-fail
liveness guards can flag live subprocesses as dead; the driver neutralizes only
those two guards, all other call paths are stock.
