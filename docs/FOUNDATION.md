# Universal CAD Foundation

```text
Universal CAD Foundation: Frozen after Phase 5.5.1
```

This is a **logical freeze**, not a Git tag (this tree is not a Git repository yet).

| Contract | Frozen value |
| --- | --- |
| Public schema | **2** (schema 1 remains readable) |
| MCP | **5.0.0** |
| Package | `cad-service@0.5.6` (working identifier, not a brand) |
| Operations | backend-neutral (`create_hole`, `fillet`, `create_pattern`, …) |
| Backend IDs | open strings via `BackendRegistry` |
| Roles | derived from registration (`authoritative`, `preview`, …) |
| Authoritative today | FreeCAD / OpenCascade |
| Preview today | JSCAD |
| Apple Silicon | **Tier 1 / hardware verified** — real Mac arm64, macOS 26.6.2, FreeCAD 1.1.3, full E2E + regression battery green (2026-08-22, see `docs/MACOS.md`) |

Phase 6 (assemblies, mates, constraints) must **build on** these contracts. It must not casually redesign the IR, the catalog, or the registry.

“Frozen” does not mean immutable forever. It means a schema 3 or a new MCP major is required to break them, with an explicit migration.
