# OpenCode + Local LLM Cross-Client Round-Trip Benchmark — 2026-09-07

## Result

**PASS — persisted cross-client project reopen, numeric edit, export, multi-restart persistence, and final slicer ingestion.**

This benchmark continues the same `dog-xbox-controller-holder` project after it had already been created through the OpenCode/local-model path and then visually corrected in ChatGPT Work.

The local model then reopened the ChatGPT Work-edited project and performed a precise engineering revision through Battenmark only.

```text
OpenCode + local LLM
        │
        ▼
    Battenmark
        │
        ▼
FreeCAD / OpenCascade
        │
        ▼
 persisted project
        │
        ▼
 ChatGPT Work visual correction
        │
        ▼
 persisted project
        │
        ▼
OpenCode + local LLM numeric edit
        │
        ▼
 STL / 3MF / STEP
        │
        ▼
 ELEGOO Slicer
```

No direct FreeCAD, FreeCADCmd, Python FreeCAD module, or manual CAD-file bypass was used.

## Starting project

- project: `dog-xbox-controller-holder`
- document: `doc_qrnre7`
- ChatGPT Work corrected checkpoint: `rev_tlcbkg`
- final local-model revision: `rev_85czot`
- final feature count: **83**

The document had evolved substantially from the original local-model artifact. The local model correctly detected that legacy and intermediate cutters no longer controlled the final exported geometry and identified the later operative `Final` cutters instead of blindly editing stale features.

## Requested edits

The local model made the following persisted edits in place:

- left/right grip wells: radius **25 → 27 mm** (**Ø50 → Ø54 mm**), centers preserved;
- USB cable tunnel: radius **9 → 11 mm** (**Ø18 → Ø22 mm**), centerline preserved;
- new strain-relief recess: **22 × 30 × 4 mm** box cut from the main body;
- body margin adjustment: length **178 → 182 mm**, x-position **6 → 4 mm**, preserving wall thickness around the enlarged wells.

Final operative feature changes included:

- `feat_1rb56d` / `feat_i69wca` — final left/right grip-well cutters;
- `feat_ey1vio` — final USB tunnel cutter;
- `feat_oezbid` cut through `Boolean016` / `feat_yyt2hd` — strain-relief recess;
- `feat_zkfwld` — body margin adjustment.

## Important feature-history discovery

The persisted project contained multiple generations of cutters. Earlier `legacy` and `Recut2` cutter features were resized first, but inspection showed that the final export chain was still controlled by later `Final` cutters.

The local model then corrected the operative features instead of treating the first matching feature names as authoritative.

This is useful evidence for long-lived CAD projects because it shows the client can inspect feature history and determine which persisted features actually drive exported geometry.

## Authoritative geometry

### Start / intermediate / final rebuilds

| Stage | Volume mm³ | Solids | Issues |
| --- | ---: | ---: | ---: |
| start `rev_nzkpr1` | 873,639.599 | 1 | 0 |
| phase-2 edits | 863,037.394 | 1 | 0 |
| ChatGPT Work corrected state `rev_tlcbkg` | 748,166.214 | 1 | 0 |
| final local edit `rev_85czot` | **730,934.359** | **1** | **0** |

Final authoritative result:

- shape: **Solid**;
- valid solids: **exactly 1**;
- volume: **730,934.359 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- authoritative FreeCAD/OpenCascade rebuild: **PASS**;
- issues: `[]`.

The volume decrease is directionally consistent with the larger grip wells and larger cable tunnel removing additional material.

## Persistence / worker-restart proof

The benchmark exercised three distinct worker restarts:

1. pre-edit restart — project reopened and rebuilt byte-identically at **873,639.599 mm³**;
2. post-ChatGPT-Work state restart — project reopened and rebuilt byte-identically at **748,166.214 mm³**;
3. post-final-local-edit restart — project reopened at **83 features / `rev_85czot`** and rebuilt byte-identically at **730,934.359 mm³**.

All edits therefore live in the persisted Battenmark project rather than depending on one live FreeCAD worker process.

## Export evidence

All final exports were regenerated from `rev_85czot`.

| Format | Artifact ID | Size | Structural verification |
| --- | --- | ---: | --- |
| STL | `art_5u2xge` | 1,972,384 bytes | 39,446 triangles; binary STL size/header valid |
| 3MF | `art_6h9f89` | 443,038 bytes | ZIP valid; required 3MF entries present; no archive errors |
| STEP | `art_har9x3` | 300,169 bytes | valid STEP / ISO header present |

Every export reported the same authoritative result:

- one solid;
- **730,934.359 mm³**;
- bbox **(0, -14, 0) → (190, 182, 92) mm**;
- no authoritative OCC issues.

## Final ELEGOO Slicer confirmation

The final local-model revision was subsequently opened in ELEGOO Slicer and successfully sliced on the visible **ELEGOO Centauri / 0.4 mm nozzle / 0.20 mm Standard** setup.

Observed final toolpath result:

- complete slicer preview: **PASS**;
- model filament: **82.92 m / 249.32 g**;
- total filament: **86.74 m / 260.80 g**;
- support: approximately **11.11 g** plus **0.37 g support interface**;
- model printing time: **5 h 53 min**;
- total estimated time: **5 h 54 min**.

The recognizable dog form introduced during the ChatGPT Work visual-correction pass remained intact after the local model's subsequent numeric engineering edits. This is important: the local client was able to modify operative persisted features without visually destroying the cross-client design state.

The slicer numbers also reinforce that CAD solid volume and FDM filament usage are different measurements. The final authoritative OCC solid volume decreased from the ChatGPT Work state, while the visible slicer model-filament estimate did not decrease proportionally. Perimeters, infill, cavities, support, and toolpath generation affect real print-material estimates, so slicer/toolpath data should remain the authority for print consumption rather than raw B-rep volume alone.

## Failures and recovery

Two failure classes were preserved rather than hidden:

1. **Transient empty exports** immediately after boolean operations produced tiny placeholder files and the message `Body 'Body' did not produce a solid.` Rebuilding the document first and exporting from the settled revision resolved the issue.
2. A separate generic `validate` path continued to report a pre-existing non-manifold CSG warning. The authoritative OCC rebuild remained `valid: true` with `issues: []`, and final STL/3MF/STEP exports were produced successfully.

These are recorded as distinct observations rather than collapsed into one success/failure signal.

## Evidence classification

This benchmark qualifies as:

- local-model persisted-project reopen: **PASS**;
- cross-client continuation of a ChatGPT Work-edited project: **PASS**;
- feature-history inspection / operative-feature identification: **PASS**;
- exact numeric engineering edit: **PASS**;
- authoritative OCC rebuild: **PASS**;
- STL export: **PASS**;
- 3MF export: **PASS**;
- STEP export: **PASS**;
- final downstream slicer ingestion: **PASS**;
- visual form preserved across local numeric edit: **PASS**;
- multi-restart persistence: **PASS**;
- direct FreeCAD bypass: **NO**.

## Why this matters

The strongest result is not the individual +2 mm diameter edits. It is the project continuity:

> a local model created the project, ChatGPT Work reopened and visually corrected the same persisted project, then the local model reopened that revised project again, identified the operative feature chain, made exact numeric edits, exported standard CAD/print formats, reproduced the final geometry after multiple worker restarts, and produced a final artifact that a real desktop slicer accepted without losing the revised visual form.

That is strong evidence for Battenmark as a persistent client-neutral CAD execution layer rather than a model-specific transient session.

For the overall client matrix, see [`docs/CLIENT_VALIDATION.md`](../CLIENT_VALIDATION.md).
