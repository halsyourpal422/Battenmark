# Concurrent Same-Prompt Dog-Holder Fix Test — 2026-09-07

## Correction

This test was previously described as a sequential cross-client round trip. That was incorrect.

The actual chronology was:

1. An earlier OpenCode/local-LLM run created the dog-shaped Xbox controller holder.
2. The **same fix prompt** was then given to **ChatGPT Work and the local LLM at the same time**.
3. Both clients worked against the same persisted Battenmark project/document, `doc_qrnre7`.
4. ChatGPT Work finished first at `rev_tlcbkg`.
5. The local-LLM run took longer because of a timeout and later finished at `rev_85czot`.

Therefore the later local result must **not** be described as an intentional sequence of “GPT Work edits first, then the local model reopens GPT Work’s finished project.”

## Shared-project caveat

Because both clients targeted the same persisted Battenmark project concurrently, this was not a clean isolated A/B comparison.

The local report itself observed `rev_tlcbkg` — the ChatGPT Work completion revision — as an intermediate state before its own final `rev_85czot`. That means the two runs could interact through shared project state.

Accordingly:

- the GPT Work result is a valid completed Battenmark run;
- the local-LLM result is also a valid completed Battenmark run;
- but the two final artifacts should **not** be treated as fully independent outcomes from identical isolated starting states;
- exact attribution of every later local geometry change to only the local model is not possible from this shared-state run alone.

This is still useful evidence: it shows two different clients can operate on the same persisted Battenmark project and that the project remained recoverable/exportable, but it also demonstrates why isolated branches/copies or revision locking are required for a rigorous model-vs-model benchmark.

## ChatGPT Work outcome

ChatGPT Work completed its vision-assisted correction at:

- document: `doc_qrnre7`;
- final revision: `rev_tlcbkg`;
- verified checkpoint: `rev_t6xro2`;
- valid solids: **1**;
- OCC volume: **748,166.214 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- STL: **2,019,584 bytes / 40,390 triangles**;
- 3MF: **458,728 bytes / 40,390 triangles**;
- fresh-process reopen: **PASS**;
- direct FreeCAD bypass: **NO**.

ELEGOO Slicer later showed approximately:

- model filament: **237.19 g**;
- total filament: **254.21 g**;
- total estimated print time: **5 h 46 min**.

## Local-LLM outcome

The longer-running local session ultimately finished at:

- document: `doc_qrnre7`;
- final revision: `rev_85czot`;
- feature count: **83**;
- valid solids: **1**;
- OCC volume: **730,934.359 mm³**;
- bbox: **(0, -14, 0) → (190, 182, 92) mm**;
- STL: **1,972,384 bytes / 39,446 triangles**;
- 3MF: **443,038 bytes**;
- STEP: **300,169 bytes**;
- repeated worker-restart persistence: **PASS**;
- direct FreeCAD bypass: **NO**.

Its final edits included operative grip wells at **Ø54 mm**, a USB tunnel at **Ø22 mm**, and a **22 × 30 × 4 mm** strain-relief recess. The run also identified that later `Final` cutters, rather than earlier legacy/`Recut2` cutters, controlled exported geometry.

ELEGOO Slicer showed approximately:

- model filament: **249.32 g**;
- total filament: **260.80 g**;
- total estimated print time: **5 h 54 min**.

## Correct evidence classification

This test supports:

- ChatGPT Work Battenmark correction workflow: **PASS**;
- local-LLM Battenmark correction workflow: **PASS**;
- authoritative OCC validation/export for both observed outcomes: **PASS**;
- shared persisted-project survivability under two-client activity: **observed**;
- clean independent same-prompt A/B comparison: **NOT ESTABLISHED**;
- intentional sequential cross-client handoff: **NOT ESTABLISHED**.

## Next rigorous comparison

For a true same-prompt model comparison, clone the same starting revision into two isolated Battenmark projects or branches, run one client per copy, and compare:

- final geometry/spec fidelity;
- number of corrective operations;
- OCC validity;
- export integrity;
- slicer results;
- visual/form quality where applicable;
- elapsed time and recovery behavior.

The shared-state run should be kept as a useful concurrency/persistence observation, not presented as an isolated model-quality benchmark.