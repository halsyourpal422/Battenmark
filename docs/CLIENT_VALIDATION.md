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
| **ChatGPT Work on macOS** | Full-fidelity hard benchmark + physical-output proof + vision-assisted iterative correction | **PASS** | Proven through Battenmark to FreeCAD 1.1.3/OpenCascade with real geometry, rebuild, correction, FCStd/STEP/STL/3MF export, persistence/reopen, independent 3MF audit, an earlier physically printed calibration coupon, and a later render-inspect-correct loop on a persisted organic-form project. |
| **Claude via MCP stdio** | End-to-end CAD workflow + interoperability proof | **PASS** | Tiny proof: 75-tool discovery, `kernel_status`, 20×15×5 mm solid, valid OCC rebuild, 1 solid, 1,500 mm³, cleanup, no direct FreeCAD bypass. Claude also completed the original 50-revision two-piece Orange Pi workflow through Battenmark only. The final corrected enclosure was subsequently audited to full PASS in ChatGPT Work. |
| **OpenCode + local LLM** | End-to-end CAD workflow + slicer ingestion + cross-client persisted-project round trip | **PASS** | Created two independent artifacts through Battenmark, including the dog-holder stress test; after ChatGPT Work visually corrected that same persisted project, the local model reopened it, identified the operative final cutters in an 83-feature history, made exact numeric edits, exported STL/3MF/STEP, and reproduced the final OCC result after repeated worker restarts. Organic/aesthetic quality of the original local dog design remained only PARTIAL. |
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

### Xbox cradle interoperability proof

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

### Dog-shaped holder visual/form stress test

A second test deliberately pushed the same OpenCode/local-model path away from
simple mechanical box geometry and toward an organic/aesthetic target: a
dog-shaped Xbox controller holder built from CSG primitives and booleans.

The model reported **17 features / 15 boolean operations**, one valid
**873,640 mm³** solid, and successful STL/3MF export. ELEGOO Slicer accepted the
artifact and generated a complete toolpath:

- model filament: **294.78 g**;
- total filament: **308.58 g**;
- support material: approximately **13.38 g**;
- estimated time: **6 h 40 min**.

The CAD execution path therefore remained **PASS**, while visual inspection of
the slicer preview rated the intended dog form only **PARTIAL**: the result read
more like a functional holder/block with dog-like primitive cues than a cohesive
animal sculpture.

This is a useful capability boundary rather than a Battenmark failure. The local
model was able to drive dimensions, coordinates, holes, cavities and booleans
through Battenmark, but it showed weaker visual/spatial judgment for organic
proportion and form continuity. The model's earlier rough material estimate of
about 1.1 kg was also superseded by the slicer's approximately **308.58 g total**
toolpath estimate.

See:

- [`docs/demos/opencode-local-llm-dog-holder-2026-09-07.md`](demos/opencode-local-llm-dog-holder-2026-09-07.md)

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

### Vision-assisted correction of the persisted dog holder

ChatGPT Work then reopened the same `dog-xbox-controller-holder` project created
through the OpenCode/local-model path and used rendered visual feedback to
iteratively improve its form without rebuilding the project from scratch.

The correction loop produced three design checkpoints (`rev_k28of6`,
`rev_j32je7`, `rev_nf1ym9`), a labeled verified checkpoint `rev_t6xro2`, and
final persisted revision `rev_tlcbkg`. A fresh Battenmark process reopened
`doc_qrnre7` and reproduced the final authoritative geometry exactly.

Final OCC result:

- rebuild: **PASS**;
- shape: `Solid`;
- valid solids: **exactly 1**;
- volume: **748,166.214 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- envelope: **190 × 196 × 92 mm**;
- flat printable bottom: **Z = 0**;
- STL export: **2,019,584 bytes / 40,390 triangles**;
- 3MF export: **458,728 bytes / 20,631 vertices / 40,390 triangles**;
- 3MF integrity: **PASS**;
- fresh-process persistence/reopen: **PASS**;
- direct FreeCAD bypass: **NO**.

The workflow also exercised recovery. Some accumulated stylizing unions caused
empty authoritative rebuilds, so ChatGPT Work tested them independently, kept
seven OCC-safe rounded unions, rolled back nine rejected unions, and preserved
the final grip, cavity, cable, facial-relief and base-trim cuts.

ChatGPT Work reported that the revised form read more clearly as a dog after the
render-inspect-correct loop. That visual assessment is useful evidence for
multimodal iterative CAD, but the repo does not treat it as a quantified
objective aesthetic score.

See:

- [`docs/demos/gpt-work-vision-dog-correction-2026-09-07.md`](demos/gpt-work-vision-dog-correction-2026-09-07.md)

## Cross-client round trip back to OpenCode + local LLM

The local model then reopened that same ChatGPT Work-edited persisted project
and completed a precise engineering revision rather than an aesthetic redesign.

The final document was `doc_qrnre7` at revision `rev_85czot` with **83 features**.
The local model discovered that the project contained legacy, `Recut2`, and later
`Final` cutter generations. It correctly determined that the later `Final`
cutters controlled exported geometry and edited those operative features rather
than stopping after modifying stale history.

Final requested changes:

- both grip wells: **Ø50 → Ø54 mm**, centers preserved;
- USB tunnel: **Ø18 → Ø22 mm**, centerline preserved;
- new strain-relief recess: **22 × 30 × 4 mm**;
- body margin adjusted to preserve material around the larger wells.

Final authoritative result:

- rebuild: **PASS**;
- valid solids: **exactly 1**;
- volume: **730,934.359 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- issues: `[]`;
- STL: **1,972,384 bytes / 39,446 triangles**;
- 3MF: **443,038 bytes**, valid archive;
- STEP: **300,169 bytes**, valid STEP header;
- three worker-restart persistence checks: **PASS**;
- direct FreeCAD bypass: **NO**.

The run also preserved two important failure observations: transient empty
exports immediately after booleans until the document was rebuilt into a settled
state, and a separate generic non-manifold CSG warning that did not appear in the
authoritative OCC rebuild result.

See:

- [`docs/demos/opencode-local-llm-cross-client-roundtrip-2026-09-07.md`](demos/opencode-local-llm-cross-client-roundtrip-2026-09-07.md)

## Cross-client evidence interpretation

The current evidence now spans several distinct client paths and levels:

1. Claude proved Battenmark MCP interoperability and completed the long initial
   Orange Pi enclosure workflow.
2. The PARTIAL result exposed genuine design and modeling issues rather than
   being hidden behind a generic success claim.
3. ChatGPT Work reopened the same Battenmark project, corrected the defects,
   independently audited the exported 3MF and proved persistence/reopen.
4. OpenCode with a local LLM independently created authoritative CAD through
   Battenmark and produced STL/3MF artifacts that a real desktop slicer accepted.
5. A second local-model stress test preserved valid CAD execution while exposing
   a lower ceiling in organic/aesthetic design quality, separating model
   intelligence from Battenmark execution quality.
6. ChatGPT Work then reopened that same organic project and used visual feedback
   to perform iterative corrections while preserving authoritative validity,
   export integrity and fresh-process persistence.
7. The local model then reopened the ChatGPT Work-edited project again, found the
   operative final cutters in an 83-feature history, made exact numeric edits,
   exported STL/3MF/STEP and reproduced the final OCC state across repeated
   worker restarts.
8. Hermes separately provides stock-client protocol interoperability evidence.

Together these results support Battenmark as a persistent, client-neutral CAD
execution layer rather than a private CAD session coupled to one hosted model.
They also show why client/model reasoning, multimodal feedback and CAD-kernel
execution quality should be reported separately.

## Claim discipline

Use the narrowest accurate statement:

- **Do say:** “Claude is a validated Battenmark MCP client and completed a nontrivial 50-revision FreeCAD/OpenCascade enclosure workflow.”
- **Do say:** “ChatGPT Work completed the corrected Orange Pi enclosure as a full-fidelity Battenmark benchmark and also has physical-print proof on macOS.”
- **Do say:** “OpenCode with the tested local-LLM setup created validated FreeCAD/OpenCascade CAD through Battenmark and produced artifacts that ELEGOO Slicer successfully sliced.”
- **Do say:** “The local-model dog-holder stress test passed CAD execution while showing weaker organic visual/form reasoning.”
- **Do say:** “ChatGPT Work reopened the same persisted dog-holder project, used render feedback to iteratively correct it, and finished with one valid persisted OCC solid plus verified STL/3MF exports.”
- **Do say:** “The tested local model subsequently reopened that ChatGPT Work-edited project, identified the operative final feature chain, made exact numeric edits, exported STL/3MF/STEP and preserved the result across multiple worker restarts.”
- **Do say:** “Hermes has stock-client MCP interoperability evidence.”
- **Do not say:** “Every LLM/agent works with Battenmark.”
- **Do not say:** “All local LLMs are validated with Battenmark.”
- **Do not equate:** protocol discovery with autonomous CAD quality.
- **Do not equate:** slicer ingestion with physical fit or product-quality ergonomics.
- **Do not equate:** valid B-rep geometry with strong visual/aesthetic design.
- **Do not equate:** a model's visual self-assessment with an objective aesthetic score.
- **Do not equate:** valid B-rep geometry with specification-correct engineering design.
- **Do not hide:** detected worker-sync or modeling failures merely because a final recovery succeeds.

As new clients are tested, add them here with the exact evidence level rather
than broadening a generic compatibility claim.
