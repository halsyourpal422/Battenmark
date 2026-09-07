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
| End-to-end CAD workflow | The client drove a nontrivial Battenmark CAD workflow into the authoritative FreeCAD/OpenCascade backend, including rebuild/validation and engineering outputs. |
| Full-fidelity hard benchmark | A difficult CAD task passed geometry, specification-fidelity, export and persistence checks without direct backend bypass. |
| Physical-output proof | The client-driven Battenmark workflow produced CAD/print artifacts that were physically printed. |

## Current matrix

| Client / framework | Evidence | Result | Important qualifier |
| --- | --- | --- | --- |
| **ChatGPT Work on macOS** | Full-fidelity hard benchmark + physical-output proof | **PASS** | Proven through Battenmark to FreeCAD 1.1.3/OpenCascade with real geometry, rebuild, correction, FCStd/STEP/STL/3MF export, persistence/reopen, independent 3MF audit, and an earlier physically printed calibration coupon. |
| **Claude via MCP stdio** | End-to-end CAD workflow + interoperability proof | **PASS** | Tiny proof: 75-tool discovery, `kernel_status`, 20×15×5 mm solid, valid OCC rebuild, 1 solid, 1,500 mm³, cleanup, no direct FreeCAD bypass. Claude also completed the original 50-revision two-piece Orange Pi workflow through Battenmark only. The final corrected enclosure was subsequently audited to full PASS in ChatGPT Work. |
| **OpenCode + local LLM** | End-to-end CAD workflow + downstream slicer ingestion | **PASS** | Created and validated a one-solid Xbox controller holder through Battenmark → FreeCAD/OpenCascade, exported STL/3MF, and the STL was accepted and fully sliced in ELEGOO Slicer. The artifact was intentionally not printed, so physical fit/ergonomics remain unvalidated. |
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

### Original hard enclosure workflow

Claude later completed the original two-piece Orange Pi 4 Pro enclosure
workflow through Battenmark only. The run exercised **50 revisions**, separate
base/lid bodies, sketches, pads, pockets, booleans, fillets, ventilation,
rebuild/inspection, export and persistence.

That first hard result was correctly classified PARTIAL because the lid still
contained a solid plug and blind vents. Those defects were not hidden; they were
turned into a correction benchmark.

The final corrected enclosure was then completed/re-audited through Battenmark
in ChatGPT Work and now passes the full benchmark. See:

- [`docs/demos/orange-pi-4-pro-two-piece-2026-09-06.md`](demos/orange-pi-4-pro-two-piece-2026-09-06.md)

## OpenCode + local LLM proof details

On 2026-09-07, OpenCode backed by a local model completed an independent
Battenmark → FreeCAD/OpenCascade print-artifact workflow.

The test artifact was a box-geometry Xbox controller cradle. The authoritative
workflow reported **1 valid solid / 458,252 mm³**, then exported STL and 3MF.
The STL was subsequently opened and sliced in ELEGOO Slicer for an ELEGOO
Centauri with a 0.4 mm nozzle.

Observed slicer result:

- complete toolpath preview: **PASS**;
- model filament: **171.21 g**;
- total filament: **174.22 g**;
- model printing time: **3 h 38 min**;
- total estimated time: **3 h 39 min**;
- support material under the selected settings: approximately **2.81 g**.

The user intentionally did not print the holder. Therefore this is evidence for
local-LLM client execution, authoritative CAD creation, export integrity and
real slicer compatibility — **not** physical fit validation.

See:

- [`docs/demos/opencode-local-llm-xbox-holder-2026-09-07.md`](demos/opencode-local-llm-xbox-holder-2026-09-07.md)

## ChatGPT Work proof details

### Physical calibration proof

On Apple Silicon macOS, ChatGPT Work has been proven to use Battenmark as the
execution path into the locally installed FreeCAD 1.1.3/OpenCascade backend.
The workflow created real CAD, rebuilt and validated it, exported normal CAD and
print formats, and produced a physical calibration print.

The physical proof part was a **60 × 25 × 4 mm calibration coupon** with nominal
**3 / 4 / 5 mm** through-holes.

### Corrected Orange Pi 4 Pro full-fidelity proof

ChatGPT Work reopened the live `opi4pro-enclosure` project and corrected the two
known design defects entirely through Battenmark:

- solid lid plug → **90.6 × 57.6 mm hollow friction rim** with **85.8 × 52.8 mm** opening and **2.4 mm** walls;
- blind vents → **six true 2.4 × 55 mm through-vents**.

Final exported 3MF evidence:

- object count: **2**;
- base triangles: **604**;
- lid triangles: **260**;
- boundary edges: **0 / 0**;
- non-manifold mesh edges: **0 / 0**;
- base mesh volume: **28,142.686683 mm³**;
- lid mesh volume: **13,138.560000 mm³**;
- combined mesh volume: **41,281.246683 mm³**;
- difference from Battenmark export volume: **0.109317 mm³ / 0.000265%**;
- final lid mesh volume matches analytical corrected design essentially exactly;
- persistence/reopen through a fresh stdio MCP process: PASS;
- direct FreeCAD bypass: **NO**.

Overall corrected hard benchmark: **PASS**.

## Cross-client evidence interpretation

The current evidence now spans several distinct client paths and levels:

1. Claude proved Battenmark MCP interoperability and completed the long initial
   Orange Pi enclosure workflow.
2. The PARTIAL result exposed genuine design and modeling issues rather than
   being hidden behind a generic success claim.
3. ChatGPT Work reopened the same Battenmark project, corrected the defects,
   independently audited the exported 3MF and proved persistence/reopen.
4. OpenCode with a local LLM independently created authoritative CAD through
   Battenmark and produced an STL that a real desktop slicer accepted and sliced.
5. Hermes separately provides stock-client protocol interoperability evidence.

Together these results support Battenmark as a persistent, client-neutral CAD
execution layer rather than a private CAD session coupled to one hosted model.
They still do not imply equal reasoning quality across clients or models.

## Claim discipline

Use the narrowest accurate statement:

- **Do say:** “Claude is a validated Battenmark MCP client and completed a nontrivial 50-revision FreeCAD/OpenCascade enclosure workflow.”
- **Do say:** “ChatGPT Work completed the corrected Orange Pi enclosure as a full-fidelity Battenmark benchmark and also has physical-print proof on macOS.”
- **Do say:** “OpenCode with the tested local-LLM setup created validated FreeCAD/OpenCascade CAD through Battenmark and produced an STL that ELEGOO Slicer successfully sliced.”
- **Do say:** “Hermes has stock-client MCP interoperability evidence.”
- **Do not say:** “Every LLM/agent works with Battenmark.”
- **Do not say:** “All local LLMs are validated with Battenmark.”
- **Do not equate:** protocol discovery with autonomous CAD quality.
- **Do not equate:** slicer ingestion with physical fit or product-quality ergonomics.
- **Do not equate:** valid B-rep geometry with specification-correct engineering design.
- **Do not hide:** detected worker-sync or modeling failures merely because a final recovery succeeds.

As new clients are tested, add them here with the exact evidence level rather
than broadening a generic compatibility claim.
