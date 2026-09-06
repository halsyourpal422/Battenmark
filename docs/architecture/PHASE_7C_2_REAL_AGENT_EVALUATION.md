# Phase 7C.2 — Real-agent A/B + evaluation-only provider seam

**Status:** Pacing and checkpoint/resume tooling complete. Authorized real 18-run A/B pending.
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

## Rate-limit-aware pacing

The provider retains only the latest non-secret request/token limit, remaining,
reset-duration, and observation-time fields. Before the next request it waits
when reported token capacity is below a conservative reservation consisting of
the serialized messages/tools estimate (four characters per token), the frozen
4096-token output allowance, and a 512-token buffer. It also waits when reported
request capacity is zero. Reset values support `ms`, `s`, `m`, and `h` segments
(including values such as `1.5s` and `1m30s`); waits include a 250 ms safety
margin. Missing or invalid headers do not block requests. Temporary 429 timing
prefers `Retry-After`, then token/request reset headers, then bounded backoff.

## Row checkpoint and explicit resume

Real-agent runs atomically replace `scripts/evals/results/agent-checkpoint.json`
with an empty checkpoint before a fresh matrix, then fsync and atomically replace
it after every fully scored row. `--resume` is explicit and fails closed unless
the checkpoint experiment identity exactly matches the requested Git SHA,
provider, model, temperature, output budget, scenario and skill hashes,
conditions, repetitions, 12-turn agent budget, and public tool-catalog hash.
Matrix keys use `<scenario>|<condition>|<run>`. Corrupt, duplicate, unexpected,
or structurally invalid rows are rejected before any missing row executes.

The canonical `agent-summary.json` is written only after all 18 unique real-agent
rows validate. The checkpoint is then retained with `status: complete`. A fresh
run without `--resume` deliberately replaces stale checkpoint rows; a resume
executes only exact missing keys.

## CI (credential-free)

```bash
npm run eval:provider:test
npm run eval:provider:redaction
npm run eval:checkpoint:test
npm run eval:agent:mock
npm run eval:agent:integrity
```

Zero paid model calls. Zero secrets required.

## Manual paid A/B

```bash
npm run eval:agent -- --condition both --repeats 3 --authorize-paid
```

Resume an interrupted matching experiment explicitly:

```bash
npm run eval:agent -- --condition both --repeats 3 --authorize-paid --resume
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
