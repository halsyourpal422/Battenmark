# Phase 7C.5B — Corrected-Trace Skill Remediation

**Status:** PASS; credential-free remediation verification complete

**Date:** 2026-09-01

**Branch:** `phase-7c5b-skill-remediation`

**Baseline:** `4c49044afa5ed4f10f656d8e6897e8044f63f99c`

## Executive decision

The corrected Phase 7C.4 traces support one minimal instruction change:

- assembly: unchanged because the only failed with-skill run ignored an already
  explicit export instruction;
- enclosure: revise the workflow so the main internal cavity is an explicit,
  independently verified subtractive feature completed before connector
  openings and final export;
- backend diagnostics: unchanged because the existing skill already requires
  recovery, retry, and public re-verification, while none of the six traces
  performed the required corrected-reference retry.

This is instruction remediation, not score remediation. The production CAD
domain, public operation schemas, scenarios, scorer, trace/checkpoint
infrastructure, and preserved evidence remain unchanged.

## Corrected scorer and evidence baseline

Phase 7C.5A established:

```text
enclosure scorer: battenmark.phase7c.enclosure-scorer.v2
trace schema: battenmark.eval.trace.v1
backend recovery: battenmark.phase7c.backend-recovery.v2
```

The source experiment is
`94cc29c06defdaff9ee0908d7beb62f7181fb47795bed582f37ff925ec0323bd`
at Battenmark SHA `0f3aa05307e5130af36078d2b151fe93539438c9`.
The canonical reader validated 18 completed traces, 18 unique matrix rows,
their stored SHA-256 values, checkpoint links, row identities, trace schema,
and backend semantics. The read-only v2 re-score reproduced:

| Scenario            | No skill      | With skill  |
| ------------------- | ------------- | ----------- |
| assembly            | 100, 100, 100 | 99, 100, 40 |
| enclosure           | 57, 57, 57    | 92, 92, 92  |
| backend-diagnostics | 51, 51, 51    | 52, 52, 51  |

**OBSERVED TRACE FACT:** The original enclosure `100` values remain immutable
v1 outputs. The corrected `92` values are derived, read-only forensic results,
not a new real-agent experiment.

## Existing architecture and GPIA mapping

The path remains:

```text
static advisory skill -> replaceable model -> typed public operation catalog
                      -> authoritative CAD service/domain -> versioned trace
                      -> deterministic scorer/checkpoint
```

| GPIA responsibility          | Status  | Phase 7C.5B treatment                                                  |
| ---------------------------- | ------- | ---------------------------------------------------------------------- |
| Authoritative CAD domain     | PRESENT | Protected; skills cannot redefine or bypass it                         |
| Application/service boundary | PRESENT | Public typed operations remain the only executable path                |
| Durable evidence/provenance  | PRESENT | Historical traces and checkpoint are validated read-only               |
| Rules/policy                 | PRESENT | Scorer v2 and safety boundaries are protected                          |
| Capability registry          | PRESENT | Skill operation names are checked against live `TOOL_NAMES`            |
| MCP/API parity               | PRESENT | No transport-specific instruction introduced                           |
| Replaceable AI adapter       | PRESENT | No provider request; skills remain provider-neutral advice             |
| Audit/observability          | PRESENT | Ordered messages, calls, results, usage, and scores analyzed           |
| Versioning                   | PRESENT | Skill content hash participates in future experiment identity          |
| Tests                        | PARTIAL | Add a narrow enclosure workflow contract; real effect remains unproven |

The highest-leverage gap is the enclosure instruction's compressed treatment
of shell creation. No new architecture layer is warranted.

## Assembly forensics

### Six-trace comparison

All three no-skill runs and with-skill runs 1–2 created the project and two
parts, created the assembly, defined components and instances, grounded `a1`,
applied the planar face mate, inspected the assembly at three remaining DOF,
checked interference, and exported an assembly artifact.

With-skill run 3 completed the same successful workflow through
`check_interference` but stopped after 14 successful public calls. It never
called `rebuild_assembly` or `export_assembly`, produced no artifact, failed
`artifact_exported`, triggered `missing_export_claim`, and was hard-capped at 40. There was no failed call, constraint conflict, overconstraint, or incorrect
DOF result.

### Skill mapping and causality

| Skill instruction                                   | Intended behavior          | Runs 1–2 | Run 3                  | Confidence                            |
| --------------------------------------------------- | -------------------------- | -------- | ---------------------- | ------------------------------------- |
| Incremental constraints and inspection              | Apply mate and inspect DOF | Followed | Followed               | High                                  |
| `check_interference`                                | Verify collisions          | Followed | Followed               | High                                  |
| **REQUIRED** `rebuild_assembly` → `export_assembly` | Produce final artifact     | Followed | Ignored; model stopped | High observation, low skill causality |

**OBSERVED TRACE FACT:** The failed model stopped before an explicit required
step that two other runs receiving identical text completed.

**CAUSAL HYPOTHESIS:** Intermittent hosted-model termination caused the failure.

**REMAINING UNCERTAINTY:** Six traces cannot establish a general termination
rate, but they provide no repeated skill-level mechanism.

**SKILL CHANGE:** None. Assembly skill causality is **NOT SUPPORTED**.

## Enclosure six-trace reconstruction

| Run | Condition  | Outer solid                      | Main cavity | USB feature                                       | Inspect  | Validate | Preview | Export | Termination    | Corrected score |
| --: | ---------- | -------------------------------- | ----------- | ------------------------------------------------- | -------- | -------- | ------- | ------ | -------------- | --------------: |
|   1 | no-skill   | 77 × 57 × 15.5 expression box    | none        | none                                              | none     | no       | no      | no     | empty response |              57 |
|   2 | no-skill   | parameterized 77 × 57 × 15.5 box | none        | none                                              | none     | no       | no      | no     | empty response |              57 |
|   3 | no-skill   | parameterized 77 × 57 × 15.5 box | none        | sketch begun only                                 | none     | no       | no      | no     | empty response |              57 |
|   1 | with-skill | 77 × 57 × 15.5 expression box    | none        | YZ sketch, 12 × 6 rectangle, depth-2 pocket       | document | yes      | yes     | STEP   | model stop     |              92 |
|   2 | with-skill | parameterized 77 × 57 × 15.5 box | none        | YZ sketch, 12 × 6 rectangle, depth-2 named pocket | document | yes      | yes     | STEP   | model stop     |              92 |
|   3 | with-skill | parameterized 77 × 57 × 15.5 box | none        | YZ sketch, 12 × 6 rectangle, depth-2 pocket       | document | yes      | yes     | STEP   | model stop     |              92 |

Every with-skill model explicitly announced that its remaining steps were the
USB opening followed by validation, preview, and export. Each later claimed
that the enclosure was complete. No trace contains a 73 × 53 × 13.5 cavity
tool at the 2 mm inset, an XY cavity pocket, or a successful subtract boolean
for a main cavity. Scorer v2 therefore finds opening evidence but no distinct
cavity evidence in all three runs.

### Skill-text mapping

| Skill instruction                                   | Intended behavior               | With-skill run 1                          | Run 2               | Run 3               | Causality confidence          |
| --------------------------------------------------- | ------------------------------- | ----------------------------------------- | ------------------- | ------------------- | ----------------------------- |
| Define size, wall, and clearance parameters         | Parametric dimensions           | Five parameters                           | Five parameters     | Five parameters     | High positive                 |
| “Model cavity from measured component + clearances” | Derive interior volume          | No cavity operation                       | No cavity operation | No cavity operation | Medium defect signal          |
| “outer shell + cavity via `create_box` / `boolean`” | Two solids plus subtract        | One box treated as shell; no boolean      | Same                | Same                | High ambiguity signal         |
| Preserve connector openings                         | Independent port                | 12 × 6 × 2 pocket                         | Same                | Same                | High positive                 |
| “cavity extents match”                              | Verify cavity                   | No cavity inspection; validation accepted | Same                | Same                | High insufficient-gate signal |
| validate → preview → rebuild → export               | Finalize only complete geometry | Performed after USB opening               | Same                | Same                | High ordering signal          |

**OBSERVED TRACE FACT:** Three of three with-skill models follow the same
incomplete branch: outer solid → USB opening → validation/export.

**CAUSAL HYPOTHESIS:** Combining “outer shell + cavity” into one instruction
allows “shell” to be interpreted as the initial solid rather than the result of
a separate cavity subtraction. The verification gate mentions cavity extents
but does not require proving that the cavity feature exists independently of a
connector opening before completion.

**SKILL CHANGE:** Make the subtractive order explicit and general: derive a
cavity tool from component clearance and wall/floor requirements, subtract it
from the outer body, inspect the remaining walls/floor, then create connector
openings as separate downstream subtractive features. Gate final
validation/export on both feature classes.

**REMAINING UNCERTAINTY:** Static text tests can preserve this distinction but
cannot prove a model will follow it. A fresh paid A/B is required.

## Battenmark-native enclosure workflow

The live schema supports the following provider-neutral sequence:

1. `project_create` or `project_open`; define measured parameters.
2. `create_box` for the outer body.
3. Derive cavity length/width from measured component plus clearance; derive
   cavity depth so the intended floor remains.
4. `create_box` for a distinct cavity tool, inset from the outer body's side
   walls and floor.
5. `boolean` with `operation: "subtract"`, using the outer body as
   `target_body_id` and cavity body as `tool_body_id`.
6. Inspect the result and confirm an open top plus intended wall/floor
   thickness.
7. Create connector openings independently, for example with
   `create_sketch` → `add_rectangle` → `pocket` on the appropriate wall.
8. `validate` → `render_preview` → `rebuild` → `export_step` or
   `export_fcstd` only after both the cavity and required openings exist.

These are live public operation names and match the corrected reference oracle.
No scenario-specific dimensions are embedded in the reusable instruction.

## Backend-recovery-v2 forensics

The fixture injected exactly one failed `query_geometry` before turn 1 in each
trace. Every model saw the same `GEOMETRY_REFERENCE_LOST` payload naming
`gref_missing`, entity `face`, body `diagnostic_fixture`, and the suggestion to
inspect faces and retry with a current selector such as `top_face`.

| Run | Condition  | Post-error workflow                                             | Corrected retry | Re-verification | Score |
| --: | ---------- | --------------------------------------------------------------- | --------------- | --------------- | ----: |
|   1 | no-skill   | `kernel_status` → capabilities → asks for IDs                   | none            | none            |    51 |
|   2 | no-skill   | `kernel_status` → capabilities → asks for IDs                   | none            | none            |    51 |
|   3 | no-skill   | `kernel_status` → capabilities → asks for IDs                   | none            | none            |    51 |
|   1 | with-skill | status → capabilities ×2 → `inspect_faces` with placeholder IDs | none            | none            |    52 |
|   2 | with-skill | status → capabilities ×2 → `inspect_faces` with placeholder IDs | none            | none            |    52 |
|   3 | with-skill | status → capabilities → asks for IDs                            | none            | none            |    51 |

All six satisfy `error_observed`, status/capability inspection,
`public_ops_only`, and `no_private_bypass`. All six fail
`recovery_attempted`, `recovery_succeeded`, and `re_verified`. The two
`inspect_faces` calls return a generic successful observation but do not use
the fixture's actual body ID, do not supply a changed selector to an allowed
correction operation, and are not followed by a retry or verification.

### Exact 51-versus-52 explanation

The seven boolean recovery checks are identical in all six traces: four pass
and three fail. The only score difference is the global efficiency term:

```text
efficiency = 1 - failed_calls / tool_calls
```

The three-call rows have one injected failure, yielding `1 - 1/3 = 0.6667`.
The five-call rows still have one failure, yielding `1 - 1/5 = 0.8`. Applied
to the existing 10-point efficiency weight and rounded with the otherwise
identical components, these become 51 and 52. The extra calls did not satisfy
any recovery check.

### Backend skill decision

The current skill already says:

- structured error is primary evidence;
- recover by retry, capability-aware alternative, or supported restart;
- re-run minimal public verification;
- report failure if public recovery cannot complete.

The scenario itself is even more explicit about correcting the reference,
retrying, and re-verifying. The traces show models describing that plan but not
executing it. Adding the same instruction again would be score chasing.

**SKILL CHANGE:** None. Backend skill causality is low-confidence and **NOT
SUPPORTED** as a generalizable missing-instruction defect.

**REMAINING UNCERTAINTY:** The synthetic fixture returns intentionally sparse
inspection observations. A future evaluation may need a richer public fixture,
but changing the protected scenario or scorer is outside this phase.

## Token and context analysis

Token counts are sums of per-turn provider usage recorded in the traces.

| Scenario            | Condition  | Mean prompt tokens | Mean completion tokens | Mean turns | Mean tool calls | Mean failed calls |
| ------------------- | ---------- | -----------------: | ---------------------: | ---------: | --------------: | ----------------: |
| assembly            | no-skill   |         176,487.00 |                 892.00 |      11.00 |           15.00 |              0.00 |
| assembly            | with-skill |         161,848.33 |                 850.00 |       9.67 |           14.33 |              0.67 |
| enclosure           | no-skill   |          95,791.67 |                 307.00 |       6.00 |            7.67 |              0.00 |
| enclosure           | with-skill |         143,320.00 |                 813.67 |       8.67 |           14.00 |              0.00 |
| backend-diagnostics | no-skill   |          47,939.00 |                 159.33 |       3.00 |            3.00 |              1.00 |
| backend-diagnostics | with-skill |          71,284.00 |                 277.67 |       4.33 |            4.33 |              1.00 |

Assembly's lower with-skill means are confounded by the early-stop run and do
not demonstrate efficiency. Enclosure's extra context corresponds to
consistent useful continuation and five additional completed outcome classes,
but still omits the cavity. Backend skill context produces extra diagnostic
behavior in two runs without measurable recovery improvement.

## Cross-skill design lessons

- Battenmark-specific public operation knowledge is useful when it is tied to
  a mechanical invariant, not presented as a generic CAD noun.
- Similar subtractive features need explicit role and ordering distinctions.
- Completion gates should verify required intermediate geometry before export.
- Repeating an already explicit instruction is not evidence-driven repair.
- Inspect-before-mutate and structured-error recovery remain useful, but
  diagnostic calls alone are not successful recovery.
- Rigid recipes can overfit; derive dimensions from measured inputs and design
  intent instead of embedding evaluation constants.

## Exact enclosure revision

Before:

```text
Model cavity from measured component + clearances; keep parametric.
outer shell + cavity via create_box / boolean (expression-driven).
Critical dimensions are parameters with sources; validate clean; cavity extents match.
```

After, in reusable rather than scenario-specific terms:

```text
Derive the main internal cavity from measured dimensions and clearances.
Create a distinct cavity tool with create_box and subtract it from the outer
body with boolean operation subtract, preserving the open top, walls, and floor.
Create connector openings as separate downstream features.
Before final validation/export, confirm the outer body, main cavity, intended
walls/floor, and independent connector openings all exist.
```

The skill metadata version changes from `1.0.0` to `1.0.1`. Assembly and
backend-diagnostics content and metadata remain byte-for-byte unchanged.

## Regression and future evaluation

A narrow static contract requires the enclosure instruction to distinguish
the main cavity from connector openings, derive the cavity from clearances and
wall/floor requirements, name only live public operations, and gate export on
independent feature verification. It cannot establish LLM effectiveness.

The contract was first run against the old text: 2/7 checks passed and 5/7
failed. After the minimal revision, 10/10 checks pass, including live-operation
validation and checkpoint identity isolation.

The preserved enclosure skill SHA-256 was
`22a5801c5ea5298b8ac622ca8e82a80c5509ce8679d5d92c5565d35677308f79`.
The revised `SKILL.md` SHA-256 is
`3bc622dc1aef21f45dc362fdfe6c2f5e50747eeba8f5b4e2ebd5df27ec3263fd`.
Holding the historical experiment definition constant except for that skill
hash changes the canonical experiment ID from
`94cc29c06defdaff9ee0908d7beb62f7181fb47795bed582f37ff925ec0323bd`
to `b2409fbbb6c8e6c7b82703cdf7abb3c6271a20bc16547bfcf840c0beae4aeb07`.
Canonical resume rejects the preserved checkpoint with
`CHECKPOINT_EXPERIMENT_MISMATCH` before row execution.

All required scorer, trace, backend recovery, checkpoint, mock agent, provider,
redaction, neutrality, typecheck, core, macOS FreeCAD, Phase 6, formatting, and
lint checks pass. The read-only historical re-score remains exactly unchanged.
The next real A/B must be fresh, must not use `--resume`, and requires separate
paid authorization.
