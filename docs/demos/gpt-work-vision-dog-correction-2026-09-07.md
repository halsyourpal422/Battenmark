# ChatGPT Work Vision-Assisted Dog Holder Correction — 2026-09-07

## Result

**PASS — vision-assisted iterative correction, authoritative OCC validation, export and fresh-process persistence.**

This benchmark reused the existing `dog-xbox-controller-holder` project created earlier through the OpenCode/local-LLM path. ChatGPT Work did not recreate the holder from scratch. It reopened the persisted Battenmark project, visually inspected generated renders, iteratively corrected the geometry through Battenmark, and then verified the result through the authoritative FreeCAD/OpenCascade backend.

No direct FreeCAD manipulation or bypass was used.

## Why this test matters

The earlier local-model stress test had already shown that Battenmark could execute the requested CAD operations correctly while the resulting organic/aesthetic form remained only partially convincing. This follow-up intentionally held the CAD execution layer constant and changed the driving model capability: ChatGPT Work was allowed to use rendered visual feedback while modifying the same persisted project.

The test therefore probes a different question from ordinary interoperability:

> Can a vision-capable agent use Battenmark not only to create valid geometry, but also to visually inspect, critique and iteratively improve an existing design?

The answer for this run was **yes**.

## Visual/form correction

ChatGPT Work reported that the corrected holder reads more clearly as a stylized dog through:

- a broader rounded head;
- muzzle and nose relief;
- paired floppy ears;
- rounded chest and shoulders;
- forelegs;
- haunch-like side masses;
- a lower, less block-like back silhouette.

The top view was reported to show the dog face and paired controller wells most clearly, while the isometric view showed the reduction in block mass and stronger rounded canine silhouette.

This visual conclusion came from ChatGPT Work's render-inspection loop. A separate human-side before/after screenshot comparison was not archived with this text-only repo update, so the repo should treat the result as **vision-assisted correction evidence**, not as a quantified aesthetic benchmark.

## Revision / persistence evidence

The existing project was edited in place.

- design checkpoint pass 1: `rev_k28of6`;
- design checkpoint pass 2: `rev_j32je7`;
- design checkpoint pass 3: `rev_nf1ym9`;
- labeled verified checkpoint: `rev_t6xro2`;
- current persisted revision: `rev_tlcbkg`;
- reopened document: `doc_qrnre7`.

A fresh Battenmark process reopened the persisted document and reproduced the same authoritative OCC result.

## Final authoritative geometry

Fresh-process FreeCAD/OpenCascade validation:

- rebuild: **PASS**;
- shape: `Solid`;
- valid solids: **exactly 1**;
- volume: **748,166.214 mm³**;
- bbox min: **(0, -14, 0) mm**;
- bbox max: **(190, 182, 92) mm**;
- overall envelope: **190 × 196 × 92 mm**;
- flat printable bottom: **Z = 0**.

The persisted final model retained:

- both controller grip-well cuts;
- body cavity;
- USB tunnel/channel;
- base trim;
- facial-relief cuts.

## Export evidence

Both final exports were generated from `rev_tlcbkg`.

### STL

- path: `/Volumes/3D Printing/Battenmark/Workspace/projects/dog-xbox-controller-holder/exports/dog-xbox-controller-holder.stl`;
- size: **2,019,584 bytes**;
- triangles: **40,390**;
- Battenmark artifact: `art_0i3ttp`.

### 3MF

- path: `/Volumes/3D Printing/Battenmark/Workspace/projects/dog-xbox-controller-holder/exports/dog-xbox-controller-holder.3mf`;
- size: **458,728 bytes**;
- vertices: **20,631**;
- triangles: **40,390**;
- Battenmark artifact: `art_dy574v`;
- archive integrity: **PASS**.

Battenmark reported valid OCC geometry and one solid for the exported revision.

## Recovery evidence

The iterative visual-edit loop also exercised failure handling rather than succeeding only on the first attempt.

Initial authoritative OCC rebuilds returned an empty result after too many accumulated boolean unions. ChatGPT Work then tested stylizing unions independently and retained only the OCC-safe subset.

Seven rounded shoulder/head/chest/ear/foreleg unions were retained.

Nine attempted unions were rejected and rolled back:

- right foreleg;
- both added haunches;
- tail stem;
- tail tip;
- four alternate forward-head components.

All final grip, cavity, cable, facial-relief and flat-base cuts passed individual authoritative rebuilds.

The first preview attempt also used the wrong workspace root and returned `PROJECT_NOT_FOUND`. It caused no model mutation and the workflow recovered correctly.

Battenmark's preview evaluator continued to emit its generic boolean-CSG non-manifold warning, but authoritative OCC validation and both final exports reported no issues.

## Evidence classification

This run qualifies as:

- persisted-project reopen/edit: **PASS**;
- vision-assisted iterative correction: **PASS**;
- authoritative FreeCAD/OpenCascade rebuild: **PASS**;
- exactly one valid solid: **PASS**;
- STL export: **PASS**;
- 3MF export/integrity: **PASS**;
- fresh-process persistence/reopen: **PASS**;
- direct FreeCAD bypass: **NO**;
- physical print: **NOT PERFORMED**;
- physical Xbox-controller fit: **NOT VALIDATED**;
- independently quantified aesthetic quality: **NOT ESTABLISHED**.

## Interpretation

Together with the earlier OpenCode/local-model dog-holder test, this produces a useful controlled comparison:

- same Battenmark execution layer;
- same underlying project lineage;
- same FreeCAD/OpenCascade authoritative backend;
- different driving-model capability and feedback loop.

The local-model run demonstrated valid CAD execution but weaker organic-form quality. The ChatGPT Work run then used visual feedback to iteratively alter that same project while preserving valid geometry, export integrity and persistence.

This supports the narrower claim that **Battenmark can expose enough geometry/edit/validation capability for model intelligence and multimodal feedback quality to become a meaningful differentiator in design quality**.

It does not prove that any particular model will always outperform another, nor does it convert subjective visual quality into an objective benchmark score.

## Claim discipline

Safe public wording:

> ChatGPT Work reopened the same Battenmark dog-holder project created by a local model, visually inspected rendered output, iteratively corrected the design through Battenmark, and finished with one valid persisted FreeCAD/OpenCascade solid plus verified STL/3MF exports.

Avoid:

> Battenmark itself improved the dog design.

The design improvement came from the driving agent's visual reasoning and correction loop; Battenmark remained the CAD execution, persistence and validation layer.
