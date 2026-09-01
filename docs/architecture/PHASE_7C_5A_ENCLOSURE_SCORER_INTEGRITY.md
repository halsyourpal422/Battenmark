# Phase 7C.5A — Enclosure Scorer Integrity

**Status:** PASS; credential-free verification complete

**Date:** 2026-09-01

**Branch:** `phase-7c5a-enclosure-scorer-integrity`

**Baseline:** `0f3aa05307e5130af36078d2b151fe93539438c9`

## Executive decision

Phase 7C.4's enclosure scorer used the same subtractive operation as evidence
for both the main internal cavity and the connector opening. That measurement
was mechanically invalid. Phase 7C.5A replaces operation-name counting with a
narrow scenario-specific evidence classifier. A cavity and a USB opening must
now have appropriate geometry and different feature/call identities.

No scenario, skill, CAD implementation, FreeCAD worker, score weight, hard cap,
classification band, backend-recovery rule, or trace schema changes in this
phase.

## Existing architecture and GPIA mapping

The evaluation path remains:

```text
scenario -> condition envelope -> replaceable EvalProvider
         -> public evaluation executor -> versioned trace
         -> deterministic scorer -> checkpoint / summary
```

| GPIA responsibility         | Status                 | Phase 7C.5A treatment                                          |
| --------------------------- | ---------------------- | -------------------------------------------------------------- |
| Authoritative CAD domain    | PRESENT                | Protected and unchanged                                        |
| Public capability boundary  | PRESENT                | Read to establish legitimate public operation semantics        |
| Replaceable AI provider     | PRESENT                | Unchanged; no provider call made                               |
| Deterministic rules/policy  | PARTIAL → STRENGTHENED | Enclosure feature roles are now mechanically distinct          |
| Durable evidence/provenance | PRESENT                | Preserved traces validated and read only                       |
| Versioning                  | PARTIAL → STRENGTHENED | Explicit enclosure scorer semantics enters experiment identity |
| Audit/observability         | PRESENT                | Evidence IDs are exposed in scorer metrics                     |
| Tests                       | PARTIAL → STRENGTHENED | E1–E10 and exact historical-pattern regression added           |

The highest-risk gap was scorer correctness, not product architecture. The
smallest coherent repair therefore stays under `scripts/evals/**`.

## Defect discovery

The preserved Phase 7C.4 with-skill enclosure traces each contain one outer
box, one front-wall sketch, one 12 × 6 rectangle, one approximately 2 mm USB
pocket, validation, preview, and export—but no separately evidenced main
interior cavity.

The old predicates were effectively:

```text
cavity_present  = any boolean OR pocket
opening_present = any create_hole OR boolean OR pocket
```

The single USB pocket therefore received two mechanically different credits.
The historical scorer reported all three with-skill rows as 100.

## RED regression proof

The focused test suite was added before implementation and run against the old
scorer. Result: **4/11 passed; 7/11 failed**.

The failing cases were:

- E1: one USB pocket was incorrectly credited as both opening and cavity;
- E2: one cavity boolean was incorrectly credited as both cavity and opening;
- E4: one connector boolean was incorrectly credited as both roles;
- E5: two unrelated small pockets incorrectly proved a cavity;
- E9: duplicate evidence identity was double-counted;
- E10: deleted cavity evidence remained credited;
- sanitized Phase 7C.4 pattern: one USB pocket still scored 100 with both checks.

The exact observed historical-pattern RED result was:

```text
score=100
cavity_present=true
opening_present=true
```

## Corrected semantics

### Main cavity

A successful cavity boolean must be subtractive, reference a separately
created tool box, match the scenario interior footprint of 73 × 53 mm, use the
13.5 mm interior depth, and start at `(2, 2, 2)` mm so the side walls and floor
remain.

An interior pocket may qualify only when its rectangle is 73 × 53 mm, begins at
the 2 mm wall inset on an XY sketch, and has 13.5 mm depth. Arbitrary or
connector-sized pockets cannot qualify.

### Connector opening

A pocket qualifies only when its rectangle matches 12 × 6 mm, its depth matches
the 2 mm wall, its associated sketch/pocket names express USB, connector, or
opening intent, and the sketch is on a vertical XZ or YZ plane.

A subtractive connector boolean qualifies only when its tool dimensions match
the 2 × 12 × 6 mm wall aperture and its semantic name identifies USB,
connector, or opening intent.

### Evidence identity and validity

Evidence identity prefers resulting CAD feature ID, evaluation detail feature
ID, public tool-call ID, then a stable call order/index fallback. The cavity
identity is reserved before selecting opening evidence. An opening candidate
with the same identity is rejected. Creation order does not matter. A later
successful `delete_feature` targeting the feature identity invalidates stale
evidence.

Scorer metrics now record:

```text
cavity_evidence_id
opening_evidence_id
evidence_distinct
```

## GREEN regression proof

| Test                           | Expected result                             | Result    |
| ------------------------------ | ------------------------------------------- | --------- |
| E1 one USB pocket              | opening only                                | PASS      |
| E2 cavity only                 | cavity only                                 | PASS      |
| E3 cavity + USB pocket         | both, distinct IDs                          | PASS      |
| E4 one connector boolean       | opening only                                | PASS      |
| E5 two unrelated small pockets | no cavity                                   | PASS      |
| E6 cavity + connector boolean  | both, distinct IDs                          | PASS      |
| E7 opening before cavity       | both                                        | PASS      |
| E8 cavity before opening       | both                                        | PASS      |
| E9 duplicate evidence ID       | not both                                    | PASS      |
| E10 deleted cavity             | cavity absent                               | PASS      |
| Phase 7C.4 sanitized pattern   | opening true, cavity false, score below 100 | PASS (92) |

## Reference-oracle correction

The old reference oracle also relied on the defect. Its cavity boolean could
soft-fail, it manually asserted cavity state anyway, and its opening was a round
6 mm hole rather than the specified 12 × 6 mm rectangle.

The corrected evaluation oracle creates a 77 × 57 × 15.5 mm outer box, a
73 × 53 × 13.5 mm cavity tool at `(2, 2, 2)`, a successful subtractive cavity
boolean using actual body IDs, and an independent 12 × 6 × 2 mm rectangular USB
pocket. The corrected reference enclosure scores **100 PASS** with distinct
successful feature evidence.

## Scorer version and experiment identity

The historical scorer is labeled retrospectively as the implicit:

```text
battenmark.phase7c.enclosure-scorer.v1
```

Future experiments explicitly bind:

```text
battenmark.phase7c.enclosure-scorer.v2
```

as `enclosure_scorer_semantics` in the checkpoint experiment definition and
canonical summary. This field participates in the canonical experiment hash.
Legacy definitions omit it, preserving validation of immutable old
checkpoints. Requesting resume with v2 produces
`CHECKPOINT_EXPERIMENT_MISMATCH` before any provider call.

Backend semantics remain `battenmark.phase7c.backend-recovery.v2`. Trace schema
remains `battenmark.eval.trace.v1`.

## Phase 7C.4 trace re-score under enclosure-scorer-v2

**OFFLINE RE-SCORE — NOT A NEW REAL-AGENT EXPERIMENT**

The utility validates all 18 trace hashes and identities through the canonical
Phase 7C.4 trace path, reconstructs scorer inputs from ordered events, and never
writes the checkpoint, summary, traces, or backups.

| Scenario            | Condition  | Run | Original historical score | Offline corrected score | Difference |
| ------------------- | ---------- | --: | ------------------------: | ----------------------: | ---------: |
| assembly            | no-skill   |   1 |                       100 |                     100 |          0 |
| assembly            | no-skill   |   2 |                       100 |                     100 |          0 |
| assembly            | no-skill   |   3 |                       100 |                     100 |          0 |
| assembly            | with-skill |   1 |                        99 |                      99 |          0 |
| assembly            | with-skill |   2 |                       100 |                     100 |          0 |
| assembly            | with-skill |   3 |                        40 |                      40 |          0 |
| enclosure           | no-skill   |   1 |                        57 |                      57 |          0 |
| enclosure           | no-skill   |   2 |                        57 |                      57 |          0 |
| enclosure           | no-skill   |   3 |                        57 |                      57 |          0 |
| enclosure           | with-skill |   1 |                       100 |                      92 |         -8 |
| enclosure           | with-skill |   2 |                       100 |                      92 |         -8 |
| enclosure           | with-skill |   3 |                       100 |                      92 |         -8 |
| backend-diagnostics | no-skill   |   1 |                        51 |                      51 |          0 |
| backend-diagnostics | no-skill   |   2 |                        51 |                      51 |          0 |
| backend-diagnostics | no-skill   |   3 |                        51 |                      51 |          0 |
| backend-diagnostics | with-skill |   1 |                        52 |                      52 |          0 |
| backend-diagnostics | with-skill |   2 |                        52 |                      52 |          0 |
| backend-diagnostics | with-skill |   3 |                        51 |                      51 |          0 |

## Corrected aggregate diagnostic

**OFFLINE RE-SCORE — NOT A NEW REAL-AGENT EXPERIMENT**

| Scenario            | No-skill scores | With-skill scores | Means           |  Delta | Classification        |
| ------------------- | --------------- | ----------------- | --------------- | -----: | --------------------- |
| assembly            | 100, 100, 100   | 99, 100, 40       | 100.00 vs 79.67 | -20.33 | REGRESSION            |
| enclosure           | 57, 57, 57      | 92, 92, 92        | 57.00 vs 92.00  | +35.00 | CLEAR BENEFIT         |
| backend-diagnostics | 51, 51, 51      | 52, 52, 51        | 51.00 vs 51.67  |  +0.67 | NO MEASURABLE BENEFIT |

The corrected enclosure result still shows a strong behavioral benefit, but it
means the skill-conditioned agents continued through the independent USB
opening, validation, preview, and export. It does **not** prove that those
historical agents created the main cavity.

## Historical comparability

The original Phase 7C.4 artifacts remain immutable. Their enclosure 100s are an
accurate record of what the v1 scorer emitted, but not valid evidence of full
enclosure correctness. The offline v2 re-score is derived forensic evidence;
it does not replace the canonical Layer-B experiment.

A future A/B must be fresh because the Git SHA and scorer semantics change
experiment identity. It must not resume the Phase 7C.4 checkpoint and requires
separate paid authorization.

## Affected and unaffected behavior

- Enclosure scoring predicates: corrected.
- Enclosure reference oracle: mechanically corrected.
- Assembly scoring: unchanged; all six historical scores reproduce exactly.
- Backend-recovery-v2 scoring: unchanged; all six historical scores reproduce.
- Global weights, bands, and hard caps: unchanged.
- Trace persistence/schema: unchanged.
- Production CAD, FreeCAD worker, scenarios, and skills: unchanged.

## Verification plan

- Focused E1–E10 enclosure scorer integrity tests.
- Existing scorer/reference suite.
- Read-only 18-row Phase 7C.4 re-score with canonical trace validation.
- Checkpoint mismatch and frozen real-experiment identity tests.
- Phase 7C.4 trace, backend recovery, provider, checkpoint, mock-agent,
  redaction, skills, neutrality, typecheck, core, macOS, and Phase 6 tests.
- Targeted formatting/lint, protected-path diff, secret scan, and clean-tree
  verification.

## Verification evidence

- Existing scorer/reference suite: 17 checks passed; enclosure reference 100.
- Enclosure scorer integrity: 11/11 passed.
- Trace integrity: 14/14 passed.
- Backend recovery integrity: 17/17 passed.
- Checkpoint/resume: 18/18 passed, including scorer-semantics mismatch.
- Mock agent A/B: 9 checks passed.
- Agent integrity: 9/9 passed.
- Provider: 26/26 passed.
- Provider redaction: 7 checks passed.
- Skill validation: 5 skills; 4 mutation tests passed.
- Backend neutrality: 6/6 passed.
- Typecheck: passed.
- Core tests: 9/9 parametric, 13/13 selectors, 14/14 registry.
- macOS proof: 10 checks passed.
- Phase 6: 31/31 assembly and 16/16 assembly-FreeCAD passed.
- Read-only Phase 7C.4 re-score: 18/18 validated and re-scored.
- Targeted ESLint, Prettier, and `git diff --check`: passed.

## Intentional exceptions

- The evaluator remains conservative when numeric expressions cannot be
  resolved from trace arguments. It does not promote semantic names alone into
  mechanical cavity evidence.
- No new hard cap or score weight is introduced; the missing cavity flows
  through existing scoring weights.
- The offline re-score is read-only and is not persisted into the historical
  result directory.
