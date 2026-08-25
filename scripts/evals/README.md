# Phase 7C — CAD Skill Evaluation Harness

Compares CAD task performance **without** vs **with** Battenmark skill guidance.

## Modes

| Mode | Purpose | CI |
|------|---------|-----|
| `reference` | Deterministic oracle workflows + scoring | Required |
| `score` tests | Scorer unit tests + mutation proof | Required |
| `agent` | Real-agent A/B (Hermes / MCP client) | Manual / optional |

## Commands

```bash
npm run eval:skills:reference
npm run eval:skills:score
npm run eval:skills -- --mode reference --scenario assembly
```

Agent A/B requires credentials (`BATTENMARK_EVAL_MODEL` + provider key). Without them, agent mode SKIPs cleanly.

## Architecture

```text
scenario JSON  →  reference oracle OR agent adapter
                         ↓
                      Trace
                         ↓
                   scoreTrace()
                         ↓
              score / PASS|PARTIAL|FAIL
```

- Skills loaded from `skills/<id>/SKILL.md`
- Scorer uses Battenmark state + tool traces, not agent prose
- No agent runtime, no executable skills, no MCP discovery

## Scenarios

- basic-part, enclosure, assembly (dof=3), backend-diagnostics, fdm-dfm

See `docs/architecture/PHASE_7C_SKILL_EVALUATION.md`.
