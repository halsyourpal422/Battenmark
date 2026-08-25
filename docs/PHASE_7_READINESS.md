# Phase 7 readiness — Donor Architecture Assessment

Status: **READY** — declared 2026-08-25 after Phase 6.1 merge closeout and
clean-room verification.

## Baseline

```text
BATTENMARK_PHASE_6_1_BASELINE=2f545f79a7c3ac70ef5ba565bbce1c3f7cd870b5
```

Tag: `phase-6.1-baseline` (merge of PR #3; reviewed head `5a6633f`; Phase 6
base `2ee68ea`). Phase 7 must build from this exact immutable commit.

## Objective

Evaluate open-source agent frameworks for **selective architectural reuse** —
not to turn Battenmark into a wrapper around another agent. Likely candidates:
Agent Zero, Hermes Agent, potentially other narrowly justified repositories.

For every donor subsystem, record exactly one verdict with evidence:

```text
ADOPT | ADAPT | REFERENCE ONLY | REJECT
```

Candidate questions cover agent loop, task decomposition, tool orchestration,
context handling, memory, subagents, error recovery, execution supervision.

## Boundary that must remain Battenmark-native

- CAD domain model and typed geometry operations
- stable-reference system (gref) and semantic selectors
- FreeCAD worker and authoritative OCC validation
- backend-neutral CAD/service contract and backend registry
- assembly semantics (six-state DOF solver, constraints, interference)
- MCP CAD contract

## Architecture invariant

```text
Battenmark → backend-neutral CAD/service contract → authoritative geometry backends
```

Any proposal that inverts this into

```text
third-party agent framework → Battenmark as plugin
```

requires an explicit later architectural review proving otherwise. No donor
system is accepted simply because it has more features.

## Verification evidence at baseline

Legacy geometry (`test:cad` 11/11; FreeCAD worker suite 11/11 incl. the
80×50×12 mm box golden V = 48000 mm³); Phase 6 assemblies (24 unit +
15 authoritative checks incl. multi-feature FCStd golden ≈ 46,837.404 mm³);
six-state DOF behavior (free 6 / fixed 0 / planar 3 / concentric 2 /
concentric+stop transition 1 / fully constrained 0, with mechanically correct
free axes) is protected by **permanent CI fixtures** as of Phase 6.1.1:
unit goldens `DofA`–`DofF` plus `P611-six-column-rank` in `test:assembly`,
and `p611-dof-goldens-public-path` through `executeTool` → `inspect_assembly`
in `test:assembly-freecad`. OCC interference battery (separated / contact /
shallow / deep / rotated / App::Link instances); schema suite (10/10,
including parallel/perpendicular required-field agreement across schema,
service, Python client and MCP); MCP stdio smoke through real transport.
Post-merge CI on the baseline SHA: success (run 32633334800). Platform claims
unchanged: macOS Apple Silicon Tier 1, Linux validated where CI exists,
Windows unsupported.

## Hardened baseline

Phase 7 starts from the Phase 6.1.1 regression-hardened baseline (tag
`phase-6.1.1-baseline`), which includes the permanent DOF goldens above.
`phase-6.1-baseline` remains the immutable historical runtime checkpoint.
