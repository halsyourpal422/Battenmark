# Changelog

Public product name: **Battenmark**. Internal engineering identifier `cad-service`
and the historical `AgentCad*` compatibility prefixes remain in code and protocols.
Schema versions are independent of package versions.

## Unreleased — Phase 7C.2 (EvalProvider + real-agent A/B)

- Evaluation-only OpenAI-compatible provider seam under `scripts/evals/providers/`.
- Provider ID and model ID are separate configuration fields.
- Credential-free provider, redaction, and mock agent-loop tests in required CI.
- Real 18-run A/B remains manual (`--authorize-paid`); no paid calls in CI.

## 0.1.0-alpha.1 — Battenmark public alpha (2026-08-22)

First public release. Ships the Phase 5.5.1 verified universal CAD foundation.
See prior history in this file for Phases 6–7C and 5.x.
