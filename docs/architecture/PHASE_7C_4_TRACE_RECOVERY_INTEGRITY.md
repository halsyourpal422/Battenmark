# Phase 7C.4 Trace and Backend-Recovery Integrity

**Status:** Complete; credential-free verification passed
**Branch:** `phase-7c4-trace-recovery-integrity`
**Baseline:** `aea05a85a41e3152951dc2ca17fd328baeaaa71f`
**Historical evidence parent:** `00f2f27e88e75fa09ad5bde3205831764a0eb209`

## Why Phase 7C.4 exists

Phase 7C.3 verified the complete Phase 7C.2 evidence matrix but found that its
persisted rows did not retain model messages, assistant text, exact tool calls,
arguments, results, errors, or ordering. The assembly outlier could therefore
be explained at the scorer-check level but not attributed safely to skill text.

It also found that the backend-diagnostics real-agent path never injected the
structured error promised by its scenario. The scorer's old
`recovery_attempted` fallback treated any successful call as recovery. The
historical 18/18/18 versus 60/60/79 result remains evidence of diagnostic-tool
engagement under backend-recovery-v1 semantics, not proof of actual recovery.

The root cause was representational and executable: the scenario contained
only `fixture.injected_error_code`, while the agent loop and public evaluation
executor had no fixture hook. The value therefore informed neither a public
operation result nor the model-message stream.

## Existing architecture and GPIA mapping

The current evaluation seam remains separate from authoritative CAD behavior:

```text
scenario -> condition envelope -> EvalProvider -> public evaluation executor
         -> trace -> scorer -> checkpoint / summary
```

| GPIA responsibility                               | Status                | Phase 7C.4 treatment                                     |
| ------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| Authoritative CAD domain and application services | PRESENT               | Protected; unchanged                                     |
| Public capability registry and typed operations   | PRESENT               | Referenced by hash; unchanged                            |
| Replaceable AI provider boundary                  | PRESENT               | Preserved                                                |
| Structured errors                                 | PARTIAL in evaluation | Add deterministic evaluation-only fixture                |
| Durable evidence/provenance                       | PARTIAL               | Add versioned, hashed per-row traces                     |
| Safety and secret boundaries                      | PRESENT, extended     | Allowlist trace fields and test redaction                |
| Audit/observability                               | PARTIAL               | Persist ordered model/tool evidence                      |
| Versioning                                        | PARTIAL               | Bind semantics and trace schema into experiment identity |
| Tests                                             | PARTIAL               | Add negative trace, tamper, fixture, and recovery tests  |

No new CAD domain layer, service boundary, MCP capability, or provider-specific
product behavior is introduced.

## Intended corrected fixture semantics

`fixture.injected_error_code` represents a lost persistent geometry reference
after a model rebuild. The evaluation fixture performs one deterministic
evaluation-layer `query_geometry` call using:

```json
{
  "body_id": "diagnostic_fixture",
  "entity": "face",
  "selector": { "gref": "gref_missing" }
}
```

That fixture call returns one structured `GEOMETRY_REFERENCE_LOST` error before
the first model turn. The result is appended through the same tool-results
message channel used for model-initiated public calls. Both conditions receive
the identical operation, arguments, code, message, and safe details.

A relevant correction is a later `query_geometry` or `inspect_faces` call with
a non-empty semantic selector that no longer contains `gref_missing`. Recovery
success requires that corrected call to succeed. Re-verification requires a
later successful `validate`, `inspect_document`, or `inspect_assembly` call.
Status/capability inspection remains separately observable and does not itself
count as recovery.

The fixture belongs only to the evaluation executor. Production `src/cad/**`
behavior is unchanged.

## Trace design

Corrected runs use trace schema `battenmark.eval.trace.v1` and evaluation
semantics `battenmark.phase7c.backend-recovery.v2`.

Runtime traces use deterministic per-row files:

```text
scripts/evals/results/traces/<experiment-id>/<scenario>__<condition>__<run>.json
```

Each trace contains allowlisted experiment/row identity, ordered events,
normalized model messages, assistant output, public tool IDs/names/arguments,
safe tool results/errors, per-turn usage, termination, final state, scorer
checks, hard failures, score, and remaining DOF. Partial traces are atomically
updated around model/tool turns. Only complete traces receive a canonical
SHA-256 checkpoint reference.

Provider metadata, request headers, authorization values, credentials, billing
metadata, and environment secrets are not serialization inputs. Recursive key
filtering and string redaction provide defense in depth for allowed fields.

## Comparability and fresh-run requirement

The historical Phase 7C.2 JSON, checkpoint, log, hashes, scores, and results
document are immutable. Corrected backend-recovery-v2 scores measure actual
post-error correction and cannot be compared directly with the historical
backend-recovery-v1 scores as if their semantics were identical.

Evaluation semantics and trace schema versions are explicit experiment-identity
inputs. Old checkpoints cannot resume under the corrected identity. The first
corrected paid experiment must be fresh and separately authorized; Phase 7C.4
itself makes zero paid calls.

The preserved historical artifacts remain byte-for-byte unchanged:

| Evidence            | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Canonical summary   | `5ec293423a225cd3d0151753f68337fbdd24c74af1ce9a91f361af72864aa436` |
| Complete checkpoint | `94e894cacd1640fca99cf4e0c64dabe7f924b29f21084fb7bf07901560cf287c` |
| Process log         | `00dfa73ddcacca48cc65f21a1444f1ca1ae0f2838f5579d3ea6a42e64a487629` |

Their interpretation also remains unchanged in
`PHASE_7C_2_REAL_AGENT_RESULTS.md`.

## Verification plan

- RED then GREEN trace persistence, partial/complete, tamper, and resume tests.
- Deterministic backend fixture parity and isolation tests.
- Post-error correction/recovery/re-verification scorer tests.
- Existing provider, checkpoint, mock-agent, integrity, skill, CAD-neutrality,
  typecheck, core, macOS, and Phase 6 regressions.
- Protected-path and credential scans before completion.

## Verification evidence

Test-first RED was captured before the implementation:

- Trace integrity: `0/14` passed because the trace module did not exist.
- Backend recovery integrity: `1/17` passed. The legacy scorer incorrectly
  credited pre-error success, unrelated post-error success, and success without
  an observed error.

The completed implementation passes:

- Trace integrity: `14/14`.
- Backend recovery integrity: `17/17`.
- Checkpoint/resume integrity: `17/17`, including semantics, trace-schema,
  trace-hash, missing-trace, and tamper fail-closed cases.
- Agent integrity: `9/9`.
- Existing skill scorer suite: all cases passed.

Checkpoint schema `battenmark.eval.checkpoint.v2` binds both evaluation
semantics and trace schema into the experiment identity. Scenario discovery
also excludes ignored macOS AppleDouble `._*.json` metadata so external-storage
filesystem artifacts cannot enter the evaluation matrix.

All Phase 7C.4 development and verification is credential-free. No provider
credential was used and no paid model call was made. The corrected real-agent
matrix remains a separately authorized future run.

## Intentional exceptions

- Partial traces improve diagnosis but do not resume mid-row; the row reruns.
- Tool definitions are represented by the canonical catalog hash and safe tool
  names rather than duplicating the full catalog in every model request event.
- No database is added; traces are bounded per-row JSON files.
