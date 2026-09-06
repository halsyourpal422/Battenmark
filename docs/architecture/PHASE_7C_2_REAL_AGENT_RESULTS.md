# Phase 7C.2 Real-Agent A/B Results

**Evidence status:** Complete 18-row Layer-B matrix; independently verified 2026-08-31

**Battenmark SHA:** `00f2f27e88e75fa09ad5bde3205831764a0eb209`

**Experiment ID:** `3bef3927fefa3e3695b3b5630ad3bfb43c9b3b500c1cea804b0e7073b0abeca6`

**Scope:** Historical evidence record. This document does not revise scenarios, scoring, provider behavior, or skills.

## Evidence identity

The following are observed facts from the canonical summary and checkpoint:

| Field                      | Observed value                                 |
| -------------------------- | ---------------------------------------------- |
| Evidence kind              | `real-agent`                                   |
| Execution mode             | `real-agent`                                   |
| Provider                   | `openai-compatible`                            |
| Model                      | `gpt-4o`                                       |
| Temperature                | `0`                                            |
| Maximum output tokens      | `4096`                                         |
| Agent turn budget          | `12`                                           |
| Conditions                 | `no-skill`, `with-skill`                       |
| Repetitions                | `3` per condition                              |
| Scenarios                  | `assembly`, `enclosure`, `backend-diagnostics` |
| Target/result/Layer-B rows | `18 / 18 / 18`                                 |
| Unique matrix keys         | `18`                                           |
| Duplicate/missing keys     | `0 / 0`                                        |
| Checkpoint status          | `complete`                                     |

The checkpoint experiment ID matches the summary experiment ID. A canonical
JSON digest confirms that its 18 `completed_rows` are structurally identical to
the summary's 18 `results` rows. All current skill file SHA-256 values match the
skill hashes captured in the checkpoint.

## Preserved evidence

Exact external copies already existed, so no historical file was overwritten.
The repository runtime copies and external JSON copies compare equal.

| Evidence            | External file                                     | SHA-256                                                            |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Canonical summary   | `Phase-7C2-agent-summary-20260831-014635.json`    | `5ec293423a225cd3d0151753f68337fbdd24c74af1ce9a91f361af72864aa436` |
| Complete checkpoint | `Phase-7C2-agent-checkpoint-20260831-014635.json` | `94e894cacd1640fca99cf4e0c64dabe7f924b29f21084fb7bf07901560cf287c` |
| Process log         | `Phase-7C2-Real-Agent-18run-20260831-014635.log`  | `00dfa73ddcacca48cc65f21a1444f1ca1ae0f2838f5579d3ea6a42e64a487629` |

The external files are under `/Volumes/3D Printing/Battenmark/Backups/`.
No credential, authorization header, organization secret, or billing data is
included here.

## Exact score rows

| Scenario            | Condition  | Run | Score | Verdict | Turns | Calls / failed | Termination      | Hard failures          |
| ------------------- | ---------- | --: | ----: | ------- | ----: | -------------- | ---------------- | ---------------------- |
| assembly            | no-skill   |   1 |   100 | PASS    |     9 | 13 / 0         | `model_stop`     | none                   |
| assembly            | no-skill   |   2 |   100 | PASS    |    10 | 13 / 0         | `model_stop`     | none                   |
| assembly            | no-skill   |   3 |   100 | PASS    |    10 | 13 / 0         | `model_stop`     | none                   |
| assembly            | with-skill |   1 |    40 | FAIL    |    10 | 15 / 4         | `model_stop`     | `missing_export_claim` |
| assembly            | with-skill |   2 |    99 | PASS    |    10 | 15 / 2         | `model_stop`     | none                   |
| assembly            | with-skill |   3 |   100 | PASS    |     9 | 13 / 0         | `model_stop`     | none                   |
| enclosure           | no-skill   |   1 |    57 | PARTIAL |     7 | 10 / 0         | `empty_response` | none                   |
| enclosure           | no-skill   |   2 |   100 | PASS    |     7 | 9 / 0          | `model_stop`     | none                   |
| enclosure           | no-skill   |   3 |    57 | PARTIAL |     7 | 10 / 0         | `empty_response` | none                   |
| enclosure           | with-skill |   1 |   100 | PASS    |     8 | 13 / 0         | `model_stop`     | none                   |
| enclosure           | with-skill |   2 |    57 | PARTIAL |     4 | 7 / 0          | `empty_response` | none                   |
| enclosure           | with-skill |   3 |    57 | PARTIAL |     4 | 7 / 0          | `empty_response` | none                   |
| backend-diagnostics | no-skill   |   1 |    18 | FAIL    |     1 | 0 / 0          | `model_stop`     | none                   |
| backend-diagnostics | no-skill   |   2 |    18 | FAIL    |     1 | 0 / 0          | `model_stop`     | none                   |
| backend-diagnostics | no-skill   |   3 |    18 | FAIL    |     1 | 0 / 0          | `model_stop`     | none                   |
| backend-diagnostics | with-skill |   1 |    60 | PARTIAL |     2 | 2 / 0          | `model_stop`     | none                   |
| backend-diagnostics | with-skill |   2 |    60 | PARTIAL |     2 | 2 / 0          | `model_stop`     | none                   |
| backend-diagnostics | with-skill |   3 |    79 | PARTIAL |     3 | 3 / 0          | `model_stop`     | none                   |

## Offline reproduction

Every stored row score was independently recomputed from its stored checks,
weights, failed-call count, and hard-failure cap. There were zero mismatches.
Condition means, deltas, and unchanged Phase 7C classifications also reproduced
exactly.

Population standard deviation is reported only as a descriptive diagnostic; it
does not alter the official classification.

| Scenario            | No-skill scores | With-skill scores | No-skill mean | With-skill mean |  Delta | Classification        | Median, min-max, population SD (no / with) |
| ------------------- | --------------- | ----------------- | ------------: | --------------: | -----: | --------------------- | ------------------------------------------ |
| assembly            | 100, 100, 100   | 40, 99, 100       |        100.00 |           79.67 | -20.33 | REGRESSION            | 100, 100-100, 0.00 / 99, 40-100, 28.05     |
| enclosure           | 57, 100, 57     | 100, 57, 57       |         71.33 |           71.33 |   0.00 | NO MEASURABLE BENEFIT | 57, 57-100, 20.27 / 57, 57-100, 20.27      |
| backend-diagnostics | 18, 18, 18      | 60, 60, 79        |         18.00 |           66.33 | +48.33 | CLEAR BENEFIT         | 18, 18-18, 0.00 / 60, 60-79, 8.96          |

## Run-level forensics

Only fields retained in the canonical evidence are shown. The evaluation loop
constructed full messages and a trace containing tool names, arguments, order,
errors, and final state in memory, but returned and persisted only the scored
row. Consequently, exact call names/arguments/order, model text, individual
error details, and final geometry are unavailable for retrospective inspection.

The `usage` field is the provider usage from the final model response only; it
is not cumulative usage for the full multi-turn run.

| Run                    | Score | Proven successful behavior / state                                       | Failed checks                                                  | Calls / schema errors | Remaining DOF | Final-response tokens (prompt / completion) | Notable retained evidence                                 |
| ---------------------- | ----: | ------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------- | ------------: | ------------------------------------------- | --------------------------------------------------------- |
| assembly no-skill 1    |   100 | all 11 checks                                                            | none                                                           | 13 / 0                |             3 | 16293 / 26                                  | all verification gates                                    |
| assembly no-skill 2    |   100 | all 11 checks                                                            | none                                                           | 13 / 0                |             3 | 16229 / 181                                 | all verification gates                                    |
| assembly no-skill 3    |   100 | all 11 checks                                                            | none                                                           | 13 / 0                |             3 | 16086 / 235                                 | all verification gates                                    |
| assembly with-skill 1  |    40 | project, components, instances, grounding, constraint, inspection, DOF 3 | export; interference                                           | 15 / 4                |             3 | 16972 / 58                                  | completed without export; one of three verification gates |
| assembly with-skill 2  |    99 | all 11 checks                                                            | none                                                           | 15 / 2                |             3 | 16994 / 225                                 | all verification gates                                    |
| assembly with-skill 3  |   100 | all 11 checks                                                            | none                                                           | 13 / 0                |             3 | 16959 / 217                                 | all verification gates                                    |
| enclosure no-skill 1   |    57 | project, parameters, outer shell, dimension discipline                   | validation, preview, export, cavity, opening                   | 10 / 0                |           n/a | 16026 / 1                                   | empty response; zero verification gates                   |
| enclosure no-skill 2   |   100 | all 10 checks                                                            | none                                                           | 9 / 0                 |           n/a | 16021 / 71                                  | all verification gates                                    |
| enclosure no-skill 3   |    57 | project, parameters, outer shell, dimension discipline                   | validation, preview, export, cavity, opening                   | 10 / 0                |           n/a | 16026 / 1                                   | empty response; zero verification gates                   |
| enclosure with-skill 1 |   100 | all 10 checks                                                            | none                                                           | 13 / 0                |           n/a | 16793 / 157                                 | all verification gates                                    |
| enclosure with-skill 2 |    57 | project, parameters, outer shell, dimension discipline                   | validation, preview, export, cavity, opening                   | 7 / 0                 |           n/a | 16465 / 1                                   | empty response; zero verification gates                   |
| enclosure with-skill 3 |    57 | project, parameters, outer shell, dimension discipline                   | validation, preview, export, cavity, opening                   | 7 / 0                 |           n/a | 16465 / 1                                   | empty response; zero verification gates                   |
| backend no-skill 1     |    18 | public-only behavior                                                     | error, status/capability inspection, recovery, re-verification | 0 / 0                 |           n/a | 15901 / 20                                  | stopped without tools                                     |
| backend no-skill 2     |    18 | public-only behavior                                                     | error, status/capability inspection, recovery, re-verification | 0 / 0                 |           n/a | 15901 / 20                                  | stopped without tools                                     |
| backend no-skill 3     |    18 | public-only behavior                                                     | error, status/capability inspection, recovery, re-verification | 0 / 0                 |           n/a | 15901 / 20                                  | stopped without tools                                     |
| backend with-skill 1   |    60 | status/capability inspection; successful calls                           | error, re-verification                                         | 2 / 0                 |           n/a | 16693 / 194                                 | all three gate counters, subject to proxy caveat below    |
| backend with-skill 2   |    60 | status/capability inspection; successful calls                           | error, re-verification                                         | 2 / 0                 |           n/a | 16695 / 196                                 | all three gate counters, subject to proxy caveat below    |
| backend with-skill 3   |    79 | status/capability inspection; re-verification; successful calls          | error                                                          | 3 / 0                 |           n/a | 16878 / 120                                 | all three gate counters, subject to proxy caveat below    |

## Assembly finding

### Observed fact

The 40-point run completed with four failed calls, all classified as schema
errors. It still created the project, components and instances, grounded the
reference, applied a constraint, successfully inspected the assembly, and
reported the expected remaining DOF of 3. It did not satisfy
`check_interference` or `artifact_exported`. Before hard-failure handling its
weighted score was 73.85; because a complete `model_stop` without export raises
`missing_export_claim`, the scorer capped the result at 40.

The 99-point skill run passed every check but lost one rounded point from two
failed calls. The 100-point skill run and all three baselines passed every check.
No run recorded a constraint conflict or wrong DOF.

### Interpretation

The persisted evidence does not identify which four calls or arguments failed,
whether they occurred before the missing verification/export steps, or why the
model stopped. It therefore cannot support a causal claim involving an
unnecessary constraint, selector, mate order, `set_parallel`,
`set_perpendicular`, or any particular skill sentence. One skill-conditioned
outlier alongside 99 and 100 is compatible with hosted-model/tool-selection
variance, but that is a hypothesis rather than proof.

**Decision:** Assembly skill unchanged — insufficient evidence to attribute the
regression to skill content.

## Enclosure finding

### Observed fact

Every 57-point run has the same five failed checks: cavity, opening, validation,
preview, and export. Those runs made no failed calls, then terminated with an
empty response and a one-token final completion. Every 100-point run passed all
ten checks and all three verification gates. Both conditions contain exactly
the same score multiset, median, range, and population standard deviation.

### Interpretation

The split is associated with premature empty-response termination before the
cavity/opening/verification/export work, regardless of skill condition. The
retained evidence does not link that termination to a skill sentence. The skill
added context but produced no measurable aggregate benefit or harm in this
sample.

**Decision:** Enclosure skill unchanged — no trace-supported defect.

## Backend-diagnostics finding and evaluation mismatch

### Observed fact

All no-skill runs stopped after one turn with zero tool calls. All skill runs
made successful public calls and performed status or capability inspection;
the 79-point run also made a recognized re-verification call. This is a strong,
repeated behavioral separation in inspection/tool engagement.

However, all six runs failed `error_recorded`. The real-agent loop passes only
the scenario task string to the provider. It does not inject
`fixture.injected_error_code`; that fixture is used only by the reference
oracle. The real agent therefore did not actually receive the structured error
promised by the task.

Additionally, the scorer's `recovery_attempted` fallback is true whenever the
number of failed calls is less than the total call count. Thus any run with a
successful call can receive recovery credit without evidence of a retry or
corrected reference. This also allows the `retry` verification-gate counter to
be hit through that proxy.

### Interpretation

The results support the narrower conclusion that the skill consistently causes
the model to use public diagnostic/status operations and continue beyond a prose
answer. They do not prove successful recovery from the advertised reference
error. This scenario/input/scoring mismatch is reported without changing the
scorer, scenario, or provider. It blocks skill remediation and should be fixed
in a separately approved, comparability-aware follow-up before treating backend
diagnostics as a fully validated recovery positive control.

**Decision:** Backend-diagnostics skill preserved unchanged.

## Cross-skill comparison

| Skill               | Characters / words / approximate tokens injected | Metadata operations (recommended + optional) | Structure observed                                                         | Evidence-aligned conclusion                                                                                        |
| ------------------- | ------------------------------------------------ | -------------------------------------------: | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| assembly            | 3024 / 412 / 756                                 |                                       25 + 5 | Battenmark-specific sequence, DOF table, incremental inspection, recovery  | Operational references are current; one outlier is not attributable to wording without retained calls              |
| enclosure           | 2232 / 292 / 558                                 |                                       20 + 9 | Measurements, parameters, shell/cavity, verification                       | Guidance substantially overlaps the explicit scenario; context added without an aggregate effect                   |
| backend-diagnostics | 2082 / 273 / 521                                 |                                        7 + 3 | Narrow public-only decision sequence with explicit status/capability steps | Specific operation guidance correlates with repeated diagnostic tool engagement, but recovery proof is compromised |

All metadata operation names exist in the current public `TOOL_NAMES` catalog.
Assembly guidance agrees with the current insertion-order, second-instance-moves,
grounding, selector, and 6-DOF semantics. No unsupported operation reference was
found in the three skills.

The final-response prompt-token means were 16202.67 versus 16975.00 for
assembly, 16024.33 versus 16574.33 for enclosure, and 15901.00 versus 16755.33
for backend diagnostics. These differences are not total experiment cost and
must not be interpreted as exact skill-token overhead across all turns. The
deterministic injected context costs above are the reliable context-size measure.

## Scorer and remediation decision

- All stored numerical scores and aggregate classifications reproduce.
- The assembly and enclosure score splits are fully explained at the retained
  check/hard-cap level.
- The exact tool-call trace needed to attribute behavior to skill wording was
  not persisted.
- The backend-diagnostics real input and recovery proxy do not fully implement
  the scenario's stated recovery contract.
- Scenarios, scorer, provider, checkpointing, operation catalog, CAD core, and
  all three skills remain unchanged.

No skill revision is justified from this evidence. A follow-up evaluation
integrity change should first preserve redacted per-run call traces and supply a
real structured-error fixture, with explicit review of how that affects
comparability. Any subsequent paid A/B must be a fresh experiment and requires
separate authorization.

## Caveats

- There are only three repetitions per condition.
- Temperature zero does not make a hosted model perfectly deterministic.
- Assembly's aggregate regression is highly sensitive to one hard-capped run.
- Enclosure's identical score distributions show substantial condition-independent
  termination variance.
- The canonical evidence cannot answer exact tool ordering, argument, selector,
  or model-output questions retrospectively.
- No paid model call was made during this forensic review.
