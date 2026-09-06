# Phase 7C / 7C.2 — CAD Skill Evaluation Harness

Compares CAD task performance **without** vs **with** Battenmark skill guidance.

## Modes

| Mode | Command | CI |
|------|---------|-----|
| `reference` | `npm run eval:skills:reference` | Required |
| scorer tests | `npm run eval:skills:score` | Required |
| provider tests | `npm run eval:provider:test` | Required |
| secret redaction | `npm run eval:provider:redaction` | Required |
| mock agent A/B | `npm run eval:agent:mock` | Required |
| real agent A/B | `npm run eval:agent -- --authorize-paid` | Manual |

## Configuration

```text
BATTENMARK_EVAL_PROVIDER=openai-compatible
BATTENMARK_EVAL_MODEL=<model-id>
BATTENMARK_EVAL_API_KEY_ENV=OPENAI_API_KEY
OPENAI_API_KEY=<secret>
```

A model name is not a credential. Paid runs also require `--authorize-paid`.

## 18-run A/B

```bash
npm run eval:agent -- --condition both --repeats 3 --authorize-paid
```

Scenarios: assembly, enclosure, backend-diagnostics.

Results write to `scripts/evals/results/` (gitignored JSON summaries).

## Architecture

Skills load from `skills/<id>/SKILL.md`. Scoring uses the Phase 7C scorer.
No embedded agent runtime, no executable skills, no MCP discovery.

See `docs/architecture/PHASE_7C_2_REAL_AGENT_EVALUATION.md`.
