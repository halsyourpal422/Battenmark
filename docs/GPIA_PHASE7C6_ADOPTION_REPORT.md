# GPIA Adoption Report

Repository: Battenmark
Branch: `phase-7c6-agent-protocol-integrity`
Baseline commit: `a7d7a5693b241fbe0cd57b578a9b7c465fed1f6f`
Date: 2026-09-02

## Existing Architecture

Battenmark's typed public operation catalog and canonical CAD service are the authoritative product boundary. FreeCAD/OpenCascade remains the authoritative geometry backend, while `scripts/evals/` is a separate, provider-neutral evaluation harness. `EvalProvider` is the model-provider seam. Forensic traces and checkpoints bind evaluated rows to frozen inputs and semantics.

## GPIA Mapping

| Responsibility                             | Status  | Existing equivalent / Phase 7C.6 scope                                                                         |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| Domain core                                | PRESENT | Typed CAD document, operations, selectors, and assembly semantics under `src/cad/`                             |
| Application/workflow services              | PRESENT | Canonical `AgentCadService`; evaluation calls public operations only                                           |
| Durable/hard memory                        | PRESENT | Persistent projects plus atomic evaluation checkpoints and traces                                              |
| Knowledge/provenance model                 | PARTIAL | Evaluation traces preserve ordered evidence and experiment identity; this phase preserves that boundary        |
| Rules/policy                               | PRESENT | Public schemas, backend capabilities, scorer invariants, and frozen experiment rules                           |
| Authentication / authorization             | PRESENT | HTTP scopes and tokens; evaluation rejects privileged tools                                                    |
| Entitlements                               | N/A     | No product-plan entitlement model is needed for this local evaluation change                                   |
| Approval / safety / consequential controls | PRESENT | Paid evaluation requires explicit authorization; this phase is credential-free                                 |
| API/service boundary                       | PRESENT | HTTP, CLI, MCP, and Python use the canonical service                                                           |
| Capability registry                        | PRESENT | Public typed tool catalog and backend registry                                                                 |
| MCP boundary                               | PRESENT | Narrow public CAD operations; no arbitrary shell, SQL, or filesystem tool                                      |
| AI provider adapter boundary               | PRESENT | `EvalProvider` registry and normalized request/result contracts                                                |
| Audit trail                                | PRESENT | Atomic, redacted, ordered evaluation traces                                                                    |
| Structured errors                          | PRESENT | Public error codes/details retained for recovery scoring                                                       |
| Versioning                                 | PARTIAL | Existing checkpoint/trace versions are bound; protocol semantics must advance for this change                  |
| Observability                              | PARTIAL | Tool/model events are traced, but zero-tool continuation decisions are not yet explicit                        |
| Tests                                      | PARTIAL | Strong checkpoint/trace/provider tests exist; result-feedback and bounded-continuation regressions are missing |

## Highest-Risk Gaps

1. The evaluator stores useful sanitized public result state but sends only terse observations to the next model turn.
2. Every text-only assistant response terminates immediately, even when it explicitly says tool work remains.
3. The changed protocol would contaminate resumable evidence unless its semantics identifier changes.

## Highest-Leverage Improvements

1. Build a bounded deterministic model-facing envelope from the already-sanitized public result fields.
2. Add one provider-neutral continuation allowance for explicit pending-action text, with an auditable decision event and a specific exhausted termination.
3. Bind the new protocol to `battenmark.phase7c.agent-protocol.v3` and prove old checkpoints fail closed.

## Proposed Implementation Phases

1. Add envelope construction, size limits, and secret-redaction tests.
2. Add continuation classification and trace events without fabricating or executing tool calls.
3. Add credential-free historical-shape fixtures and checkpoint mutation tests.
4. Run the full requested verification matrix and re-hash preserved evidence.

## Compatibility / Migration Risks

- Model context grows with structured result feedback, so envelopes must have deterministic depth, field, array, string, and total-size bounds.
- One continuation allowance may not cover every stochastic provider behavior; increasing it would also increase cost and change semantics.
- A backwards-compatible `continuation_decision` event needs no trace schema bump because event kinds are open and the event representation is unchanged.
- Existing Phase 7C.4/7C.5 checkpoints must not resume under the new semantics.

## Verification Plan

Use deterministic mock providers for result visibility, continuation, bounded failure, genuine final output, empty output, structured recovery errors, and synthetic secret redaction. Then run all Phase 7C and repository checks requested for this phase, targeted formatting/lint, diff review, protected-path review, and byte-for-byte evidence hash comparison.

## Intentional Exceptions

- No production CAD, backend, MCP, scorer-weight, scenario, or skill changes.
- No paid or hosted model calls.
- No broad GPIA restructuring: existing equivalents remain authoritative.

## Implementation Outcome

Implemented on this branch. Model-facing results now use the bounded, redacted `battenmark.eval.tool-result.v1` envelope; zero-tool decisions are classified and traced; explicit pending work receives at most one continuation; and evaluation semantics is `battenmark.phase7c.agent-protocol.v3`. The trace schema remains `battenmark.eval.trace.v1` because the additive event kind uses the existing open event representation. All required credential-free tests, static checks, authoritative macOS/FreeCAD checks, protected-path review, and preserved-evidence hash comparison passed.

## CI Proof Hardening

Pull-request CI now runs on stacked bases without temporarily retargeting the PR. The existing jobs retain the default `actions/checkout` behavior and therefore continue to test GitHub's merge ref. A separate evaluation-integrity job explicitly checks out the pull request's head SHA, prints both the expected and actual SHA, fails on any mismatch, and runs the Phase 7C.6 credential-free protocol, integrity, checkpoint, trace, backend-recovery, redaction, and historical skill-contract gates.

The evaluation-only public executor now sets `state.feature_applied = true` for the public aliases `boolean_cut`, `boolean_union`, and `boolean_intersect`, matching the canonical `boolean` operation. This is generic alias consistency, not scenario-specific state. Because `state.feature_applied` is a scorer input when a scenario requires the `feature_applied` check, the state change can influence such a scenario's score. None of the frozen real-agent scenarios (`assembly`, `enclosure`, or `backend-diagnostics`) requires that check, so the upcoming frozen 18-row experiment is not directly score-biased by this alias-state change. The generic evaluation-state semantic difference remains isolated from older experiments by `battenmark.phase7c.agent-protocol.v3`.
