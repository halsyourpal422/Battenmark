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
| **ChatGPT Work on macOS** | Full-fidelity hard benchmark + physical-output proof + vision-assisted correction | **PASS** | Proven through Battenmark to FreeCAD 1.1.3/OpenCascade with real geometry, rebuild, correction, FCStd/STEP/STL/3MF export, persistence/reopen, independent 3MF audit, a physically printed calibration coupon, and a vision-assisted correction run on the persisted dog-holder project. |
| **Claude via MCP stdio** | End-to-end CAD workflow + interoperability proof | **PASS** | 75-tool discovery smoke proof plus the original 50-revision Orange Pi workflow through Battenmark only. The final corrected enclosure was later audited to full PASS in ChatGPT Work. |
| **OpenCode + local LLM** | End-to-end CAD workflow + slicer ingestion + persisted-project numeric correction | **PASS** | Created and sliced a simple Xbox cradle, created the original dog-holder artifact, and later completed a longer same-prompt correction run on the shared persisted dog project. The local correction run finished after ChatGPT Work because of a timeout. Because both clients were working on the same project at the same time, that dog-fix pair is **not** a clean isolated A/B benchmark and must not be described as an intentional sequential handoff. |
| **Hermes 0.20.5 stock MCP client** | Protocol/client proof | **PASS** | Stock client discovered 75/75 tools and completed two clean 13/13 assembly/control runs with export and structured-error recovery. |
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

Claude later completed the original two-piece Orange Pi 4 Pro enclosure workflow
through Battenmark only. The run exercised 50 revisions, separate base/lid
bodies, sketches, pads, pockets, booleans, fillets, ventilation, rebuild,
inspection, export and persistence.

That first hard result was correctly classified PARTIAL because the lid still
contained a solid plug and blind vents. Those defects became the correction
benchmark later completed to PASS in ChatGPT Work.

See:

- [`docs/demos/orange-pi-4-pro-two-piece-2026-09-06.md`](demos/orange-pi-4-pro-two-piece-2026-09-06.md)

## OpenCode + local LLM proof details

### Xbox cradle interoperability proof

OpenCode backed by the tested local model completed an independent Battenmark →
FreeCAD/OpenCascade print-artifact workflow.

Observed authoritative result:

- one valid solid: **458,252 mm³**;
- STL export: PASS;
- 3MF export: PASS;
- ELEGOO Slicer toolpath: PASS;
- model filament: **171.21 g**;
- total filament: **174.22 g**;
- total estimated print time: **3 h 39 min**.

The holder was intentionally not printed, so this proves CAD execution/export/
slicer interoperability rather than physical fit.

See:

- [`docs/demos/opencode-local-llm-xbox-holder-2026-09-07.md`](demos/opencode-local-llm-xbox-holder-2026-09-07.md)

### Original dog-holder form stress test

The same local-model path then created a dog-shaped Xbox controller holder using
CSG primitives and booleans.

Observed result:

- one valid solid: **873,640 mm³**;
- STL/3MF export: PASS;
- ELEGOO Slicer ingestion: PASS;
- model filament: **294.78 g**;
- total filament: **308.58 g**;
- estimated time: **6 h 40 min**.

CAD execution was PASS while the intended organic dog form was rated only
PARTIAL from the slicer preview. This remains useful evidence that Battenmark
execution quality and model visual/spatial design quality are separate.

See:

- [`docs/demos/opencode-local-llm-dog-holder-2026-09-07.md`](demos/opencode-local-llm-dog-holder-2026-09-07.md)

## ChatGPT Work proof details

### Physical calibration proof

On Apple Silicon macOS, ChatGPT Work has been proven to use Battenmark as the
execution path into the locally installed FreeCAD 1.1.3/OpenCascade backend.
The physical proof was a **60 × 25 × 4 mm** calibration coupon with nominal
**3 / 4 / 5 mm** through-holes.

### Corrected Orange Pi 4 Pro full-fidelity proof

ChatGPT Work reopened the live `opi4pro-enclosure` project and corrected the two
known design defects entirely through Battenmark.

Final corrected 3MF evidence included two watertight manifold objects, zero
boundary/non-manifold mesh edges, essentially exact agreement with the corrected
analytical lid volume, fresh-process persistence/reopen, and no direct FreeCAD
bypass.

Overall corrected hard benchmark: **PASS**.

### Dog-holder correction run

ChatGPT Work received the same dog-holder fix prompt as the local LLM at the same
time. It worked on the shared persisted `dog-xbox-controller-holder` project and
finished first.

Observed final state:

- document: `doc_qrnre7`;
- final persisted revision: `rev_tlcbkg`;
- one valid OCC solid;
- volume: **748,166.214 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- STL: **2,019,584 bytes / 40,390 triangles**;
- 3MF: **458,728 bytes / 40,390 triangles**;
- fresh-process persistence/reopen: PASS;
- direct FreeCAD bypass: NO.

Its workflow used rendered visual feedback and rollback/recovery around failed
boolean stylizing attempts.

See:

- [`docs/demos/gpt-work-vision-dog-correction-2026-09-07.md`](demos/gpt-work-vision-dog-correction-2026-09-07.md)

## Concurrent same-prompt dog-holder fix test

The local LLM and ChatGPT Work were **not** run sequentially for the dog-holder
fix. They were given the same fix prompt at the same time and both targeted the
same persisted Battenmark project.

ChatGPT Work finished first at `rev_tlcbkg`. The local run took longer because of
a timeout and eventually finished at `rev_85czot`.

The local report observed `rev_tlcbkg` as an intermediate state before its own
final revision. Because the project was shared and mutable, the two outcomes are
not independent isolated A/B results and exact attribution of every later local
geometry change to an untouched common baseline is not possible.

The later local final state was nevertheless valid:

- final revision: `rev_85czot`;
- feature count: **83**;
- one valid OCC solid;
- volume: **730,934.359 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- operative grip wells: **Ø54 mm**;
- operative USB tunnel: **Ø22 mm**;
- strain-relief recess: **22 × 30 × 4 mm**;
- STL/3MF/STEP export: PASS;
- repeated worker-restart persistence: PASS;
- ELEGOO Slicer: **249.32 g model / 260.80 g total / 5 h 54 min**;
- direct FreeCAD bypass: NO.

Correct interpretation:

- both clients successfully used Battenmark on the persisted project;
- shared-project survivability and persistence were observed;
- the local client demonstrated feature-history inspection and exact numeric
  editing;
- the pair does **not** establish a clean model-vs-model comparison;
- the pair does **not** establish an intentional GPT-then-local handoff.

See:

- [`docs/demos/concurrent-same-prompt-dog-holder-fix-2026-09-07.md`](demos/concurrent-same-prompt-dog-holder-fix-2026-09-07.md)

## Evidence interpretation

The current evidence supports Battenmark as a persistent, client-neutral CAD
execution layer across multiple clients. It also shows why model reasoning,
visual feedback, CAD-kernel execution and shared-project concurrency must be
reported as separate dimensions.

For future same-prompt comparisons, use isolated clones/branches of the same
starting revision so neither client can observe or modify the other's work.

## Claim discipline

Use the narrowest accurate statement:

- **Do say:** “Claude is a validated Battenmark MCP client and completed a nontrivial 50-revision FreeCAD/OpenCascade enclosure workflow.”
- **Do say:** “ChatGPT Work completed the corrected Orange Pi enclosure as a full-fidelity Battenmark benchmark and also has physical-print proof on macOS.”
- **Do say:** “OpenCode with the tested local-LLM setup created validated FreeCAD/OpenCascade CAD through Battenmark and produced artifacts that ELEGOO Slicer successfully sliced.”
- **Do say:** “ChatGPT Work and the local LLM both completed the same dog-holder fix prompt while sharing one persisted Battenmark project; the local run finished later after a timeout.”
- **Do say:** “That concurrent shared-project run is useful persistence/concurrency evidence, not a clean isolated A/B benchmark.”
- **Do not say:** “The local model intentionally reopened GPT Work’s completed dog project as a later sequential handoff.”
- **Do not say:** “Every LLM/agent works with Battenmark.”
- **Do not say:** “All local LLMs are validated with Battenmark.”
- **Do not equate:** protocol discovery with autonomous CAD quality.
- **Do not equate:** slicer ingestion with physical fit or product-quality ergonomics.
- **Do not equate:** valid B-rep geometry with strong visual/aesthetic design.
- **Do not equate:** a shared-state concurrent run with independent model comparison.
- **Do not hide:** failures or cross-client interaction merely because the final geometry is valid.
