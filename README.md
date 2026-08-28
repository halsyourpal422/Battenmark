# Battenmark

**Open, backend-neutral CAD infrastructure for AI agents and software.**

[![CI](https://github.com/halsyourpal422/Battenmark/actions/workflows/ci.yml/badge.svg)](https://github.com/halsyourpal422/Battenmark/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)
![schema](https://img.shields.io/badge/schema-2-informational.svg)
![MCP](https://img.shields.io/badge/MCP-5.0.0-informational.svg)

Battenmark provides a typed, backend-neutral interface for creating, editing,
inspecting, validating and exporting authoritative CAD geometry across
interchangeable CAD backends. Callers request `create_hole` — never
`PartDesign::Hole`. No transport owns the model; one canonical service does.

```text
ChatGPT / Claude / Gemini / Grok / Codex / local models / IDE agents / custom apps
                                   │
                    MCP / HTTP / Python / CLI
                                   │
                                   ▼
                         Battenmark Core
                                   │
                    typed CAD operations / CAD IR
                                   │
                        Backend Registry
                                   │
             ┌─────────────────────┼──────────────────────┐
             ▼                     ▼                      ▼
          FreeCAD                JSCAD              future adapters
     authoritative B-rep        preview        build123d/CadQuery/etc.
```

- **FreeCAD / OpenCascade** — authoritative B-rep kernel (headless JSON-lines worker)
- **JSCAD** — in-process preview/envelope backend (not the source of truth)

## Quickstart

Prerequisites: Node.js ≥ 20 and npm. FreeCAD is **optional** for the core
service and required only for the authoritative B-rep backend.

```bash
npm install
npx tsc --noEmit   # type check
npm test           # fast kernel-free suites (parametric, selectors, registry)
```

### FreeCAD backend

```bash
sh scripts/bootstrap-macos.sh      # macOS: discovers /Applications/FreeCAD.app
sh scripts/install-freecad.sh      # Linux: installs headless 1.0.2 AppImage (no FUSE)
npm run test:freecad               # proves the real worker end-to-end
```

Discovery order: `$AGENTCAD_FREECAD_CMD` → macOS `FreeCAD.app` bundles →
Homebrew → extracted Linux AppImage → `PATH`. See [docs/MACOS.md](docs/MACOS.md)
and [docs/LINUX.md](docs/LINUX.md).

### Transports

| Transport | Entry point |
| --- | --- |
| MCP stdio | `npx agentcad-mcp` |
| HTTP | `npx agentcad serve --port 8787` then `/api/v1/...` (Bearer token via `AGENTCAD_API_TOKEN`) |
| CLI | `npx agentcad --help` |
| Python | [`python/agentcad`](python/agentcad/client.py) — see [examples](examples) |

Python client example:

```python
from agentcad import AgentCad

c = AgentCad(base_url="http://127.0.0.1:8787", token="secret-token")
pid = c.project_create("demo")["project_id"]
c.create_box(pid, 80, 50, 12)
print(c.rebuild(pid)["data"]["volume_mm3"])   # 48000
```

## Golden smoke model

The canonical release smoke test is an **80 × 50 × 12 mm box = 48,000 mm³**,
verified through JSCAD, FreeCAD, HTTP, CLI, MCP and the Python client
(`test:transport-parity`). Do not change this fixture casually.

## Capabilities

- Backend-neutral typed CAD operations with explicit schema (`agentcad_schema_version: 2`)
- FreeCAD/OpenCascade authoritative B-rep; JSCAD preview
- Scalar parameter expressions and dependency evaluation
- Semantic face/edge selectors (`top_perimeter`, …) that re-resolve after edits
- Persistent geometry references (`gref`) with explicit lost/ambiguous errors
- Through / blind / counterbore / countersink holes
- Fillets and chamfers · linear and rectangular patterns
- STEP / FCStd / STL interchange · four-view PNG previews
- Dynamic backend registry with per-backend capability discovery
- One serialized FreeCAD worker with kill/restart recovery
- **Assemblies**: component definitions, persistent instances, grounded frames,
  face mates, axis/concentric alignment, distance & angle constraints
  (see docs/ASSEMBLIES.md)

## Platform status

| Platform | Status |
| --- | --- |
| macOS Apple Silicon | Tier 1 — **hardware verified** (arm64, macOS 26.6.2, FreeCAD 1.1.3) |
| Linux x86_64 | headless / development validated (FreeCAD 1.0.2 AppImage) |
| macOS Intel | unverified |
| Windows | unsupported / unverified |

## Known limitations

This is pre-1.0 alpha software; APIs may change.

- Assemblies support the current rigid subset; nested assemblies, assembly patterns, and advanced joint types remain unsupported
- No circular patterns
- Threads are cosmetic metadata, not helical solids
- Imported STEP is geometry import — not automatic parametric reconstruction
- Native FCStd documents keep historical PartDesign feature shapes; Battenmark
  measures the final Body Tip (summing historical solids double-counts)
- One serialized FreeCAD worker (no pooling)
- Preview rendering is JSCAD, not OCC hidden-line
- Complete topological naming is not solved; persistent `gref` mitigates it

Full list: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Documentation

| Topic | Doc |
| --- | --- |
| Architecture & foundation | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/FOUNDATION.md](docs/FOUNDATION.md) |
| Operation contract & schema | [docs/CONTRACT.md](docs/CONTRACT.md) · [docs/VERSIONING.md](docs/VERSIONING.md) |
| Backends & kernels | [docs/BACKENDS.md](docs/BACKENDS.md) · [docs/FREECAD.md](docs/FREECAD.md) · [docs/JSCAD.md](docs/JSCAD.md) · [docs/KERNEL.md](docs/KERNEL.md) |
| Transports | [docs/MCP.md](docs/MCP.md) · [docs/HTTP.md](docs/HTTP.md) · [docs/CLI.md](docs/CLI.md) · [docs/PYTHON.md](docs/PYTHON.md) · [docs/CLIENTS.md](docs/CLIENTS.md) |
| Service & persistence | [docs/SERVICE.md](docs/SERVICE.md) · [docs/AUTH.md](docs/AUTH.md) |
| Import / export & preview | [docs/IMPORT.md](docs/IMPORT.md) · [docs/PREVIEW.md](docs/PREVIEW.md) |
| Platforms & validation | [docs/MACOS.md](docs/MACOS.md) · [docs/LINUX.md](docs/LINUX.md) · [docs/RELEASE.md](docs/RELEASE.md) |

## Compatibility identifiers

Public branding is **Battenmark**. Historical engineering identifiers remain on
purpose and are a compatibility surface, not a second brand:
`AgentCadService`, `agentcad_schema_version`, `AGENTCAD_*` environment
variables, the `agentcad` / `agentcad-mcp` binaries. The internal service
version `0.5.6` intentionally differs from the release tag; see
[docs/VERSIONING.md](docs/VERSIONING.md).

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

Apache-2.0 for this repository. FreeCAD/OpenCascade are invoked as a separate
LGPL process (the worker scripts run inside FreeCADCmd). See
[LICENSE](LICENSE), [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
