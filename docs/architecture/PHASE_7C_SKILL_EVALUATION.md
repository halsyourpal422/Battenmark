# Phase 7C — CAD Skill Evaluation Harness

**Status:** Complete (harness + reference layer)  
**Date:** 2026-08-25  
**Baseline:** Phase 7B `914d2308d45ad0b7feae2da389e8e067c3f63f31`  
**Branch:** `phase-7c-skill-evaluation-harness`

## 1. Hypothesis

Versioned instruction/workflow packs (Phase 7B skills) improve how external agents perform CAD work through Battenmark's public typed operations — especially verification discipline, mechanical correctness, and recovery — without introducing an agent runtime or executable plugins.

## 2. What is under test

```text
variable = NO SKILL vs WITH SKILL
not      = model ranking
```

## 3. Two layers

### Layer A — Deterministic reference / conformance (CI-required)

- Scenario metadata + required checks
- Reference oracles execute known-correct Battenmark workflows
- Scorer grades observable traces against Battenmark state
- No LLM dependency

### Layer B — Real-agent A/B (optional / manual)

- Same task prompt; skill mode injects `skills/<id>/SKILL.md`
- Identical tool set, temperature, and client defaults
- Requires credentials; SKIP in CI when absent
- Preferred client: Hermes or other MCP-capable harness with a capable model
- Agent Zero not primary (no direct MCP client at assessed pin)

## 4. Scoring

Weights (default): task correctness 40%, verification discipline 25%, API/schema 15%, recovery 10%, efficiency 10%.

Hard failures: wrong DOF, missing export when complete claimed, private backend/schema bypass, constraint conflict, universal manufacturing constants as laws.

Verdicts: PASS | PARTIAL | FAIL

Δ bands: ≥15 CLEAR BENEFIT, ≥5 MIXED, >−5 NO MEASURABLE BENEFIT, ≤−5 REGRESSION.

## 5. Scenarios

| Scenario | Skill | Core invariant |
|----------|-------|----------------|
| basic-part-001 | basic-part | parametric solid + verify + export |
| enclosure-001 | enclosure | measured envelope + cavity + opening |
| assembly-planar-001 | assembly | planar mate remaining_dof = 3 |
| backend-diagnostics-001 | backend-diagnostics | structured error → public recovery |
| fdm-dfm-001 | fdm-dfm | labeled contextual DFM review |

## 6. Commands

```bash
npm run eval:skills:reference
npm run eval:skills:score
```

## 7. Production impact

```text
agent runtime added: NO
executable skills added: NO
MCP discovery added: NO
production runtime changes: NONE
```

## 8. Discovery implication

MCP skill-resource discovery is deferred until Layer B A/B evidence shows material skill benefit.
