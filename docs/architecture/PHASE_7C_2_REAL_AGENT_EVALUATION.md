# Phase 7C.2 — Real-agent A/B + evaluation-only provider seam

**Status:** Implementation on Phase 6.2 baseline
**Base:** `b96494b172c79aa10cb657373f91793afb839e1e`
**Scope:** evaluation-only. No CAD backend, no embedded agent runtime, no MCP skill discovery.

Provider ID (`BATTENMARK_EVAL_PROVIDER`) and model ID (`BATTENMARK_EVAL_MODEL`) are separate.
A model name is not a credential. CI is credential-free. Real 18-run A/B is manual (`--authorize-paid`).
