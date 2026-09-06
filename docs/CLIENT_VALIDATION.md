# Client / Agent Validation Status

Battenmark is intentionally backend-neutral and client-neutral, but public
compatibility claims should distinguish **architecture support** from **observed
end-to-end evidence**.

This page records the current evidence level for agent/client integrations.

## Evidence levels

| Level | Meaning |
| --- | --- |
| Architecture target | The Battenmark interface is intended to support the client class, but no direct interoperability proof is published. |
| Protocol/client proof | The stock client discovered and invoked Battenmark tools successfully through the supported transport. This does not by itself prove strong autonomous CAD reasoning. |
| End-to-end CAD workflow | The client drove a nontrivial Battenmark CAD workflow into the authoritative FreeCAD/OpenCascade backend, including rebuild/validation and normal engineering outputs. |
| Physical-output proof | The client-driven Battenmark workflow produced CAD/print artifacts that were physically printed. |

## Current matrix

| Client / framework | Evidence | Result | Important qualifier |
| --- | --- | --- | --- |
| **ChatGPT Work on macOS** | End-to-end CAD workflow + physical-output proof | **PASS** | Proven through Battenmark to FreeCAD 1.1.3/OpenCascade with real geometry, rebuild, validation, FCStd/STEP/STL/3MF output and a physically printed calibration coupon. |
| **Claude via MCP stdio** | End-to-end CAD workflow | **PASS on interoperability; PARTIAL on hard benchmark fidelity** | Tiny proof: 75-tool discovery, `kernel_status`, 20×15×5 mm solid, valid OCC rebuild, 1 solid, 1,500 mm³, cleanup, no direct FreeCAD bypass. Hard proof: full two-piece Orange Pi 4 Pro workflow through Battenmark only, 50 revisions, valid base/lid solids, exports and persistence; overall enclosure benchmark remains PARTIAL because design/specification fidelity was not perfect. |
| **Hermes 0.20.5 stock MCP client** | Protocol/client proof | **PASS** | Stock client discovered 75/75 tools and completed two clean 13/13 assembly/control runs with export and structured-error recovery. This is protocol/client interoperability evidence, not a claim of autonomous model-quality parity. |
| **Agent Zero** | Source-level assessment only | **UNVALIDATED as direct Battenmark client** | No direct MCP client was available in the assessed version; no bridge was added merely to manufacture a compatibility claim. |
| Other agents / IDEs / custom clients | Architecture target | **Not yet published as validated** | Treat as compatibility targets until equivalent evidence exists. |

## Claude proof details

### Tiny interoperability proof

The Claude → Battenmark → FreeCAD/OpenCascade smoke proof used the canonical
Battenmark MCP surface. Direct FreeCAD bypass was explicitly forbidden and was
not used.

Observed result:

- MCP discovery: **75 tools**;
- `kernel_status`: PASS;
- solid created: **20 × 15 × 5 mm**;
- authoritative OpenCascade rebuild: **valid**;
- solid count: **1**;
- volume: **1,500 mm³**;
- cleanup: PASS;
- direct FreeCAD bypass: **NO**.

### Hard enclosure workflow

Claude later completed the full two-piece Orange Pi 4 Pro enclosure benchmark
through Battenmark only. The run exercised a long, nontrivial CAD history and
successfully reached authoritative FreeCAD/OpenCascade rebuild, export and
persistence.

That run is not called a full design pass. Infrastructure/interoperability
passed, while specification fidelity remains **PARTIAL**. See:

- [`docs/demos/orange-pi-4-pro-two-piece-2026-09-06.md`](demos/orange-pi-4-pro-two-piece-2026-09-06.md)

## ChatGPT Work proof details

On Apple Silicon macOS, ChatGPT Work has been proven to use Battenmark as the
execution path into the locally installed FreeCAD 1.1.3/OpenCascade backend.
The workflow created real CAD, rebuilt and validated it, exported normal CAD and
print formats, and produced a physical calibration print.

The physical proof part was a **60 × 25 × 4 mm calibration coupon** with nominal
**3 / 4 / 5 mm** through-holes.

## Claim discipline

Use the narrowest accurate statement:

- **Do say:** “Claude has been validated as a Battenmark MCP client and completed a nontrivial Battenmark-only FreeCAD/OpenCascade enclosure workflow.”
- **Do say:** “ChatGPT Work has a physical-output Battenmark proof on macOS.”
- **Do say:** “Hermes has stock-client MCP interoperability evidence.”
- **Do not say:** “Every LLM/agent works with Battenmark.”
- **Do not equate:** protocol discovery with autonomous CAD quality.
- **Do not equate:** valid B-rep geometry with specification-correct engineering design.

As new clients are tested, add them here with the exact evidence level rather
than broadening a generic compatibility claim.
