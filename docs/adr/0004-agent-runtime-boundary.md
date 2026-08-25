# ADR-0004: Agent runtime boundary

Status: Accepted (2026-08-25)
Context baseline: `phase-6.1.1-baseline` (`a188f21`)
Assessment evidence: [docs/architecture/PHASE_7_DONOR_ASSESSMENT.md](../architecture/PHASE_7_DONOR_ASSESSMENT.md)

## Context

Battenmark is an agent-operable CAD platform: brains (LLM clients, agents, apps) connect through one typed contract (MCP / HTTP / CLI / Python) over a backend-neutral service. Donor frameworks Agent Zero (`agent0ai/agent-zero@b22a144`, MIT) and Hermes Agent (`NousResearch/hermes-agent@5908c57`, MIT) were assessed at source level to answer: should Battenmark embed, adapt, or merely interoperate with an external agent framework — or build its own agent runtime?

Facts that constrain the decision:

- Every CAD workflow is already expressible through the 75-operation typed surface; any conformant MCP/HTTP client drives the full chain (proven by transport-parity and stdio smoke tests).
- Battenmark persists CAD truth in projects/revisions; conversation state belongs to whichever brain is driving.
- The platform deliberately owns no LLM provider SDKs and no general-purpose execution surface (`PRIVILEGED_DENIED`).
- Hermes demonstrates strong patterns (pluggable `ContextEngine(ABC)`, iteration budgets, per-session dangerous-command approvals, capability providers with tested failover, audited skills); Agent Zero demonstrates persona hierarchy and self-exposure as an MCP/A2A server, coupled to a Flask/webui stack and Docker-centric execution.

## Decision

**Battenmark remains a pure agent-operable CAD platform (Model A). It will not contain an agent runtime today, and will not take a dependency on Agent Zero or Hermes.**

Concretely:

1. The MCP/HTTP/CLI/Python contract stays the single universal seam; it must keep working for any conformant client unchanged.
2. Interoperability with donors is pursued as *clients of Battenmark* (Hermes already has MCP client support: `tools/mcp_oauth.py`; Agent Zero exposes rather than consumes). A live interop verification harness (slice 7A) is the designated follow-up.
3. If a hosted optional agent is ever justified by demonstrated product need, it must be **Option 1**: a small native package acting strictly as another client above `executeTool`, borrowing Hermes' architectural patterns (iteration budget + grace, guardrail/approval gates, pluggable context-engine seam, skill governance ledger/provenance/audit) without importing its runtime.
4. Skills evolve docs-first (`skills/cad-*` markdown instruction packs), not as executable plugins.

## Alternatives considered

- **Option 2 — donor adapters:** adopted passively; adapters are unnecessary because standard MCP already provides the adapter surface. Recipes may be documented (slice 7E).
- **Option 3 — selectively embedded donor components:** rejected; even isolated modules drag dependency weight (LangChain/faiss/litellm in AZ's orbit), platform assumptions (Docker-centric execution), and upgrade coupling disproportionate to any single capability.
- **Option 4 — framework-centric (donor owns the loop, Battenmark as plugin):** rejected; reverses product ownership, shrinks the universal-client universe, couples Mac-first distribution to donor release cadence.

## Consequences

- No agent-specific code enters `src/cad/**`; the CAD core stays donor-free by default.
- Battenmark gains nothing "agentic" for free: multi-step planning remains the client's job. This is accepted — it is the product's universality trade.
- Future slices (7A verify harness, 7B skill packs, 7D approval gate) are pre-scoped in the assessment and remain need-gated.

## Revisit conditions

Revisit this ADR when any of the following becomes true:

1. A paying/integrated use-case demands a first-party guided CAD experience that clients cannot deliver with existing ops + skill packs.
2. The operation surface grows destructive/batch classes needing human approval gates (triggers slice 7D).
3. Both donors' MCP client behavior changes such that interoperability regresses (triggers 7A re-run).
4. A concrete donor subsystem appears with clean boundaries AND negligible dependencies AND a demonstrated Battenmark need — reopening Option 1 on evidence, not enthusiasm.

Smallest experiment if revisited: slice 7C design doc + failing-first acceptance tests before any implementation.
