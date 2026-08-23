# Battenmark examples

Minimal, runnable examples of driving Battenmark through its transports.
All examples use the canonical golden smoke model:

> **80 × 50 × 12 mm box → volume 48,000 mm³**

## 1. Start a service (pick one)

```bash
# HTTP + MCP on :8787 (token-protected; any non-empty token works locally)
AGENTCAD_API_TOKEN=secret-token npx agentcad serve --port 8787
```

```bash
# MCP stdio for agent hosts (Claude Desktop, etc.)
npx agentcad-mcp
```

## 2. Python client (`python_quickstart.py`)

```bash
export AGENTCAD_URL=http://127.0.0.1:8787
export AGENTCAD_API_TOKEN=secret-token
python3 examples/python_quickstart.py
```

Expected tail of output:

```text
volume_mm3 = 48000.0
bounds     = 80 x 50 x 12
```

## 3. HTTP one-shot (`cli_box.sh`)

```bash
AGENTCAD_API_TOKEN=secret-token examples/cli_box.sh   # starts/stops its own server
```

## Notes

- Without a FreeCAD install these examples exercise the JSCAD preview backend.
  Install FreeCAD (`sh scripts/install-freecad.sh` on Linux,
  `sh scripts/bootstrap-macos.sh` on macOS) and restart the server to route
  authoritative B-rep through FreeCAD/OpenCascade.
- `rebuild` reports the authoritative kernel result; see docs/IMPORT.md for
  why imported STEP is geometry import rather than parametric reconstruction.
