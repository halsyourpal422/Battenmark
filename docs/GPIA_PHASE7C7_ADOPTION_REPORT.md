# GPIA Adoption Report

Repository: Battenmark
Branch: `phase-7c7-eval-identity-integrity`
Baseline commit: `27cc18cd647d009be707948aafbbcb211fabb035`
Date: 2026-09-02

## Existing Architecture

Battenmark's typed public operation catalog, canonical CAD operations, assembly mutations, and `AgentCadService` define the authoritative public contract. The provider-neutral harness under `scripts/evals/` simulates those public operations for controlled A/B evaluation. Phase 7C.6 added bounded, redacted structured tool-result feedback and exact-head CI without changing production CAD behavior.

## GPIA Mapping

| Responsibility                             | Status  | Existing equivalent / Phase 7C.7 scope                                                    |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| Domain core                                | PRESENT | Typed CAD document and assembly invariants under `src/cad/`                               |
| Application/workflow services              | PRESENT | `AgentCadService` wraps canonical operations and result shapes                            |
| Durable/hard memory                        | PRESENT | Persisted projects plus atomic evaluation checkpoints and traces                          |
| Knowledge/provenance model                 | PARTIAL | Traces bind rows to ordered calls/results and frozen experiment identity                  |
| Rules/policy                               | PRESENT | Public schemas, structured CAD errors, scorer checks, and experiment gates                |
| Authentication / authorization             | PRESENT | Service permissions and explicit paid-evaluation authorization                            |
| Entitlements                               | N/A     | No product-plan entitlement change is involved                                            |
| Approval / safety / consequential controls | PRESENT | Paid execution remains separately authorized and out of scope                             |
| API/service boundary                       | PRESENT | Public HTTP, CLI, MCP, and evaluator tool catalog share canonical schemas                 |
| Capability registry                        | PRESENT | `TOOL_CATALOG` is the public capability authority                                         |
| MCP boundary                               | PRESENT | Narrow CAD operations call the shared application service                                 |
| AI provider adapter boundary               | PRESENT | `EvalProvider` is replaceable and provider-neutral                                        |
| Audit trail                                | PRESENT | Redacted ordered traces and checkpoint linkage                                            |
| Structured errors                          | PARTIAL | Production validates references; the evaluation executor currently does not               |
| Versioning                                 | PARTIAL | v3 binds result-feedback semantics but predates identity fidelity                         |
| Observability                              | PRESENT | Model requests, responses, tool calls/results, and continuation decisions are traced      |
| Tests                                      | PARTIAL | Protocol tests exist; public identity and fabricated-reference denial coverage is missing |

## Highest-Risk Gaps

1. The evaluator reduces identity-bearing public results to generic success, so the model cannot reliably chain body, assembly, component, and instance references.
2. The evaluator accepts nonexistent assembly references and sets success state, allowing schema-valid guessed identifiers to receive credit.
3. Existing assembly constraint and export score checks can count a failed call rather than requiring successful execution.

## Highest-Leverage Improvements

1. Mirror the canonical public result fields with deterministic evaluation identities, keeping the production layer authoritative.
2. Maintain a bounded evaluation-only registry and enforce the production reference chain before setting success state.
3. Require successful constraint and export calls for scorer credit, then bind the semantic change to v4.

## Proposed Implementation Phases

1. Add deterministic public project, document, body, feature, assembly, component, instance, constraint, and artifact identities justified by canonical result shapes.
2. Add structured reference failures and bounded public inspection payloads without backend internals.
3. Add Phase 7C.7 identity, fabricated-reference, full-chain, historical-shape, envelope, and checkpoint mutation tests.
4. Run the complete credential-free verification matrix and re-verify both historical evidence archives.

## Compatibility / Migration Risks

- More realistic rejection can lower scores for guessed references; this is intentional measurement hardening, not scorer weakening.
- Identity-bearing result payloads add bounded model context but remain inside the existing `battenmark.eval.tool-result.v1` limits and redaction policy.
- v3 checkpoints and rows must fail closed under `battenmark.phase7c.identity-integrity.v4`.

## Verification Plan

Use deterministic mock providers to prove returned-identity chaining, rejected fabricated references, correct full assembly completion, repaired historical inspection behavior, bounded envelope visibility, and unchanged secret handling. Run all requested evaluation, skill, type, repository, neutrality, macOS, and Phase 6 checks; then review the tracked diff and compare both preserved evidence trees byte-for-byte with their external archives.

## Intentional Exceptions

- No production CAD/service, skill, frozen scenario, turn-budget, or provider changes.
- No hosted-model or paid calls.
- No scenario-specific loop breaker; identity fidelity is repaired first.

## Forensic Root Cause

All six preserved assembly traces created the project and two boxes successfully, but their result envelopes contained only generic state flags and no `data`. Five then spent every remaining turn repeating `inspect_document`, `project_inspect`, or `project_open`; the sixth did so until turn 9. Those inspections also returned no object data. The model messages explicitly sought body identities needed for the assembly chain. The only high-scoring no-skill row eventually guessed component and instance identifiers, which the old executor accepted without registry evidence. The assembly skill describes the correct operation order and does not direct this inspection loop.

## Canonical Public Identity Contract

| Public operation     | Canonical public result / validation mirrored by the evaluator                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `project_create`     | `project_id`, `document_id`, name, and slug                                                                          |
| `create_body`        | stable body `id` and name                                                                                            |
| `create_box`         | feature `id` and name plus `body_id`, `body_name`, and summary                                                       |
| `create_assembly`    | stable `assembly_id` and name                                                                                        |
| `define_component`   | `assembly_id`, stable `component_id`, source, parametric flag, and bounded counts; unmatched native body scope fails |
| `create_instance`    | `assembly_id`, stable `instance_id`, `component_id`, and transform; unknown components fail                          |
| `fix_instance`       | acknowledged assembly/instance identities and fixed state; unknown instances fail                                    |
| assembly constraints | `assembly_id` and stable `constraint_id`; unknown assemblies or instances fail                                       |
| `inspect_assembly`   | bounded definitions, instances, constraints, status, and remaining DOF; unknown assemblies fail                      |
| `export_assembly`    | stable artifact identity and format; unknown assemblies fail                                                         |

`inspect_document` and the document inside `project_inspect` expose the bounded public body/feature identities that production inspection exposes. `project_open` remains a project-handle summary and does not fabricate a body registry.

## Implementation Outcome

The evaluation executor now keeps a deterministic registry behind a non-serialized symbol. It contains only evaluation representations of public project, document, body, feature, assembly, component, instance, constraint, and artifact identities. Create-operation responses expose the same identity field names used by the public contract through the existing bounded and redacted `battenmark.eval.tool-result.v1` envelope. Inspection constructs explicit public snapshots rather than dumping the registry or backend objects.

Reference-dependent assembly operations return structured public-style `PROJECT_NOT_FOUND`, `UNKNOWN_BODY`, `EMPTY_SKETCH`, `ASSEMBLY_NOT_FOUND`, `COMPONENT_NOT_FOUND`, `INSTANCE_NOT_FOUND`, or `CONSTRAINT_NOT_FOUND` failures as applicable. Failed references do not set scorer state. Assembly constraint and export checks now require successful calls, closing the remaining guessed-ID credit path without changing weights or scenarios.

The semantics identifier is `battenmark.phase7c.identity-integrity.v4`; v3 checkpoints fail closed before provider execution. Deterministic tests reproduce the historical missing-identity decision point and show that the corrected results allow the chain to continue without repeated inspection. No generic no-progress policy was added because identity fidelity removed the demonstrated cause.

## Independent Review Remediation

Independent review accepted the core v4 identity repair and found three remaining public-contract fidelity gaps before any paid evidence is created:

1. The evaluator advertises a studio-style tool catalog to an external agent, omitting the canonical `project_id` requirement on `needsProject` operations, and the executor lacks a central project guard.
2. `set_instance_transform` validates identity but reports success without applying the requested transform.
3. Native component definitions do not snapshot document parameters, so arbitrary parameter names can report false success.

The remediation keeps production code authoritative: derive the external catalog from `toOpenAiTool(entry, true)`, enforce project context centrally from catalog metadata before mutation, reuse canonical Euler-to-quaternion math, and retain bounded public parameter snapshots. Evaluation semantics remain v4 because no paid v4 run exists; the changed commit and tool-catalog hash provide checkpoint separation. Verification must cover denied project references, complete returned-identity chaining, transform/parameter state visibility, prior-catalog checkpoint rejection with zero provider calls, and all existing credential-free gates.

### Remediation Outcome

- The provider-facing catalog now derives each definition through `toOpenAiTool(entry, true)`. Every live `needsProject` tool therefore requires `project_id`; project-free operations retain their canonical schemas.
- A single catalog-driven executor guard rejects missing project context with `MALFORMED_REQUEST` and mismatched project/slug references with `PROJECT_NOT_FOUND` before registry or scorer state changes.
- Deterministic agent fixtures capture `project_id` from `project_create` results and carry it through the complete project → body → assembly → component → instance → constraint → artifact chain.
- `set_instance_transform` now preserves unspecified translation axes, uses canonical Euler XYZ-to-quaternion conversion, persists the new transform, and exposes it through later assembly inspection.
- Document parameters are stored as bounded public records. Native definitions snapshot them, valid definition edits update existing parameters while preserving component identity, and unknown/imported parameter edits fail with `UNKNOWN_PARAMETER`.
- The reviewed-head catalog hash `4fbdd518c661fb7a993d4ed1716d7f933e2b1109e12f084e54bbfdd4fd9dfc74` changes to `047c67ef9374e6406c3072bf172b122d52e8829254095626e9f5596d6b270c84`. A v4 checkpoint frozen to the reviewed hash fails closed before provider execution.

No production, skill, scenario, scorer-weight, turn-budget, hosted-provider, or paid-execution behavior changed.
