# Phase 7C.2 — Real-agent A/B + evaluation-only provider seam

**Status:** Tooling complete on Phase 6.2 baseline. Real 18-run A/B pending credentials.
**Base:** `b96494b172c79aa10cb657373f91793afb839e1e`
**Scope:** evaluation-only. No CAD backend change, no embedded agent runtime, no MCP skill discovery.

## Purpose

Answer whether shipping `skills/<id>/SKILL.md` changes a capable external
agent's CAD performance through Battenmark's public operations.

## Architecture

```text
scenario JSON
    → condition envelope (task ± SKILL.md)
        → EvalProvider (mock | openai-compatible)
            → tool calls
                → public Battenmark operations only
                    → trace
                        → existing Phase 7C scorer
```

Provider/model routing is **not** part of `src/cad/backend`.

`BATTENMARK_EVAL_PROVIDER` selects the implementation.
`BATTENMARK_EVAL_MODEL` selects the model. A model name is not a credential.

## Bounded agent loop

`scripts/evals/run.mjs --mode agent` calls `runAgentLoop()` with a turn budget.
Tool names must be on the live public catalog. Privileged/private tools fail hard.

## NO-SKILL vs WITH-SKILL

Same task, tools, model, temperature, budget. The only intended difference is
whether shipping `skills/<id>/SKILL.md` is injected into the user message.

## Configuration

```text
BATTENMARK_EVAL_PROVIDER=openai-compatible
BATTENMARK_EVAL_MODEL=gpt-4o
BATTENMARK_EVAL_BASE_URL=https://api.openai.com/v1
BATTENMARK_EVAL_API_KEY_ENV=OPENAI_API_KEY
BATTENMARK_EVAL_TEMPERATURE=0
BATTENMARK_EVAL_MAX_TOKENS=4096
BATTENMARK_EVAL_TIMEOUT_MS=30000
OPENAI_API_KEY=<secret, never committed>
```

The OpenAI-compatible evaluation provider retries only HTTP 429 responses whose
provider error code or type is `rate_limit_exceeded`. It honors `Retry-After`
(seconds or HTTP-date), bounded to 8 seconds per wait and 15 seconds total, and
otherwise waits 1, 2, 4, then 8 seconds. After four retries it raises a redacted
`RATE_LIMIT_EXHAUSTED` error. Quota, credit, authentication, and other permanent
errors are not retried.

## CI (credential-free)

```bash
npm run eval:provider:test
npm run eval:provider:redaction
npm run eval:agent:mock
```

Zero paid model calls. Zero secrets required.

## Manual paid A/B

```bash
npm run eval:agent -- --condition both --repeats 3 --authorize-paid
```

Matrix: assembly, enclosure, backend-diagnostics × no-skill/with-skill × 3 = 18.

Without `--authorize-paid`, a configured real provider SKIPs instead of spending.

Bands remain Phase 7C: Δ≥15 CLEAR BENEFIT, ≥5 MIXED, >-5 NO MEASURABLE BENEFIT, ≤-5 REGRESSION.

## Security

Secrets must not appear in traces, errors, summaries, or git. Redaction
regression uses sentinel `BATTENMARK_TEST_SECRET_DO_NOT_LEAK`.

## Remaining evidence gate

Real 18-run A/B is not complete until an authorized credential is supplied.
MCP skill discovery stays deferred until that evidence exists.

## Production impact

None.
