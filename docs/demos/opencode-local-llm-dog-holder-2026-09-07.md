# OpenCode + Local LLM Dog-Shaped Xbox Holder Stress Test — 2026-09-07

## Result

**PASS for CAD execution and slicer ingestion; PARTIAL for visual/form quality.**

This second OpenCode/local-LLM test was intentionally harder than the earlier box-geometry Xbox holder. It asked the local model to combine functional controller-holder geometry with a recognizable dog-shaped form.

```text
OpenCode + local LLM
        │
        ▼
    Battenmark
        │
        ▼
FreeCAD / OpenCascade
        │
        ├── STL
        └── 3MF
        │
        ▼
   ELEGOO Slicer
```

The useful outcome is the separation between **tool execution quality** and **model design quality**. Battenmark successfully executed the model's geometric plan into valid CAD and export artifacts, while the resulting organic/aesthetic form was much less convincing than the mechanical geometry.

## Requested / reported geometry

The model reported a dog-shaped Xbox controller holder with:

- overall envelope: approximately **190 × 178 × 110 mm**;
- rounded controller grip wells: two approximately **50 mm** sockets in the saddle/back;
- USB cable tunnel: approximately **18 mm** vertical passage from a front base slot through the back;
- head: sphere-based construction with snout, nose and eyes;
- ears: two vertical cylindrical primitives;
- tail: sphere-based rear feature;
- front paws: cylindrical primitives;
- body cavity: boolean-subtracted internal volume intended to reduce material;
- reported feature count: **17 features / 15 boolean operations**.

The authoritative FreeCAD rebuild was reported as:

- valid solids: **1**;
- solid volume: **873,640 mm³**;
- STL export: **PASS**;
- 3MF export: **PASS**.

## ELEGOO Slicer evidence

The exported artifact was opened and successfully sliced in ELEGOO Slicer for an **ELEGOO Centauri, 0.4 mm nozzle**, using the visible **0.20 mm Standard** profile.

Observed slicer result from the screenshot:

- complete toolpath preview: **PASS**;
- model filament: **98.04 m / 294.78 g**;
- total filament: **102.63 m / 308.58 g**;
- support material: approximately **13.38 g**;
- model printing time: **6 h 40 min**;
- total estimated time: **6 h 40 min**.

The earlier local-model estimate of roughly 1.1 kg of PLA was therefore not reliable. For FDM material consumption, the slicer's toolpath estimate is the stronger downstream authority.

## Visual/form assessment

The slicer preview confirms that the exported geometry is real, coherent and printable enough to generate a complete toolpath. However, the result does **not** read as a polished or convincing dog sculpture. It is better described as a functional controller-holder block with dog-like primitive cues.

That distinction matters. The local model successfully handled:

- coordinates and dimensional placement;
- constructive solid geometry;
- boolean unions/subtractions;
- cavities, holes and routing passages;
- one-solid FreeCAD/OpenCascade output;
- STL/3MF export;
- downstream slicer ingestion.

It was much weaker at:

- organic proportion;
- cohesive animal anatomy;
- aesthetic surface/form continuity;
- visual judgment of whether the assembled primitives actually resemble the intended subject.

## Evidence interpretation

This test supports the conclusion that Battenmark can function as a real CAD execution engine even when driven by a comparatively limited local model. It also shows that **valid CAD execution does not imply strong visual-design intelligence**.

For mechanical and engineering CAD, a text/reasoning model can often rely heavily on dimensions, constraints, coordinates and explicit feature logic. For aesthetic or organic CAD, model-side visual/spatial capability becomes much more important.

A stronger future loop for this class of task is:

```text
visual/design intent
      ↓
model creates geometric plan
      ↓
Battenmark → FreeCAD/OpenCascade
      ↓
render / slicer preview
      ↓
vision critique
      ↓
measured correction pass
```

That feedback loop tests the model's ability to inspect and revise its own 3D result rather than designing effectively blind.

## Evidence classification

- **OpenCode/local-LLM Battenmark execution:** PASS;
- **authoritative FreeCAD/OpenCascade rebuild:** PASS;
- **one valid solid:** PASS;
- **STL/3MF export:** PASS;
- **real downstream slicer ingestion:** PASS;
- **organic/aesthetic fidelity:** PARTIAL;
- **material-use estimate from local model:** FAILED / superseded by slicer estimate;
- **physical print:** NOT PERFORMED;
- **real Xbox controller fit:** NOT VALIDATED.

## Claim discipline

This test should not be presented as a failed Battenmark CAD run. Battenmark executed the requested feature plan and produced valid, slicer-ingestible geometry. The limitation exposed here is primarily the **driving model's visual/form reasoning**, plus a poor pre-slice material estimate.

It also should not be used to claim that all local LLMs can design useful mechanical parts or aesthetically strong 3D objects. The evidence applies to the tested OpenCode/local-model setup and this specific workflow.

See also:

- [`docs/demos/opencode-local-llm-xbox-holder-2026-09-07.md`](opencode-local-llm-xbox-holder-2026-09-07.md)
- [`docs/CLIENT_VALIDATION.md`](../CLIENT_VALIDATION.md)
