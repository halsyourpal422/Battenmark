# Phase 7 — Donor Architecture Assessment

Status: **ASSESSMENT COMPLETE** · Date: 2026-08-25
Baseline: `BATTENMARK_PHASE_6_1_1_BASELINE=a188f21a2bb1de19d7cd446ba82bad72cfa8e7d9` (tag `phase-6.1.1-baseline`)
Decision record: [docs/adr/0004-agent-runtime-boundary.md](../adr/0004-agent-runtime-boundary.md)

No donor code was imported, vendored, or submodule-linked during this phase. This document contains decisions and evidence only.

---

## 1. Donors inspected (pinned)

| Donor | Repository | SHA inspected | License | Last commit at inspection | Inspection date |
| --- | --- | --- | --- | --- | --- |
| Agent Zero | https://github.com/agent0ai/agent-zero | `b22a144bf59f15b1516084c9e7b88133ba92c8a9` | MIT (© 2025 Agent Zero, s.r.o) | 2026-08-19 | 2026-08-25 |
| Hermes Agent | https://github.com/NousResearch/hermes-agent | `5908c577f9048a0adcdd80fc467501b0f1e60b1b` (v0.20.5) | MIT (© 2025 Nous Research) | 2026-08-25 | 2026-08-25 |

Both upstreams, no forks. Both repository licenses are plain MIT; no vendored third-party trees, bundled model weights, or separately-licensed asset packages were found at the pinned revisions (Agent Zero ships its webui inside the same repo under the same license; Hermes declares `license-files = ["LICENSE"]` in pyproject). Dependency licenses are the usual PyPI ecosystem mix and would be re-audited per-component before any future adoption; nothing adopted here carries obligations beyond MIT attribution, because nothing is being copied.

## 2. Battenmark architecture map (assessed first)

| Subsystem | Location | Responsibility | Status | Pain points / extension points |
| --- | --- | --- | --- | --- |
| Typed operation registry | `src/cad/schema.ts` | Single source of truth: 75 ops, schema v2, MCP 5.0.0 constants, required-field contracts | Stable, CI-guarded (`test:schema`) | Additive evolution only (VERSIONING.md policy) |
| MCP server | `src/cad/mcp/create-server.ts`, `stdio.ts`, `http.ts` | Registers `TOOL_CATALOG` 1:1 on official MCP SDK; stdio + HTTP transports | Stable, transport-parity tested | Standard-protocol boundary — the intended universal seam |
| HTTP / CLI / Python client | `src/cad/service/run-http-tests.ts`, `src/cad/cli/main.ts`, `python/agentcad/client.py` | Same contract over other transports | Stable, parity-tested (`direct=cli=http=mcp=48000`) | — |
| Service dispatcher | `src/cad/service/agentcad.ts::executeTool` | Validation → dispatch → envelope `{ok, data, error}` with transport context | Stable | Natural choke point; anything calling this is "just another client" |
| Domain model / operations | `src/cad/document.ts`, `operations.ts`, `evaluate.ts`, `types.ts` | CAD IR, parametric evaluation | Stable | — |
| Selectors & stable refs | `src/cad/selectors.ts` + gref system | Semantic faces/edges; persistent references with explicit lost/ambiguous errors | Stable | — |
| Assembly system | `src/cad/assembly/{solver,mutations,transforms}.ts` | Constraints, six-column DOF solver, rank diagnostics | Stable; permanent goldens since 6.1.1 (`DofA`–`DofF`, `P611-six-column-rank`) | — |
| FreeCAD worker | `src/cad/kernel/freecad.server.ts` + `freecad-worker/` | Authoritative OCC B-rep via serialized JSON-lines worker; kill/restart recovery | Stable, crash-tested | — |
| Backend registry & probes | `src/cad/backend/{registry,capabilities}.ts` | Role-derived backend selection; capability discovery (`BACKEND_UNSUPPORTED`) | Stable; Phase 6.2 WIP adds build123d conformance | The neutrality seam donor work must stay above |
| Preview | `src/cad/preview/` (JSCAD) | Fast non-authoritative previews | Stable | — |
| Import/export | STEP/FCStd/STL/JSON ops | Interchange | Stable, restart-persistence tested | — |
| Error model | Structured codes (`SCHEMA_MISMATCH`, `GEOMETRY_REFERENCE_LOST`, `CONSTRAINT_CONFLICT`, `BACKEND_UNSUPPORTED`, `PRIVILEGED_DENIED`, …) | Deterministic machine-readable failures | Stable | Already agent-friendly |
| Persistence | Project/revision model | Durable documents + revision history | Tested | Single source of truth for CAD state |
| Test architecture | Bespoke runners wired into `.github/workflows/ci.yml` (7 jobs) | Regression battery incl. permanent DOF goldens | Strong | — |

## 3. Does Battenmark need an internal agent runtime?

**Answered first, per mandate: not today.**

Battenmark's product goal is universal agent-operability (§6 of the phase brief): ChatGPT/Claude/Codex/Grok/OpenCode/local agents/custom MCP clients all drive the same typed contract. Evidence from our own runs: a raw JSON-RPC stdio client completed the full chain (project → modeling → constraints → DOF query → interference → export) against `tools/list` = 75 ops with zero agent-specific affordances. Every workflow an embedded agent would perform is already expressible as tool sequences by *any* external brain.

- **Model C (agent-first)** rejected outright — reverses product ownership, shrinks the client universe.
- **Model B (platform + bundled optional agent)** deferred: no demonstrated requirement today (see §4). If it ever exists, it must be a thin package that talks to Battenmark through `executeTool` like every other client.
- **Model A (CAD platform only)** is the current, evidence-backed stance.

## 4. Actual problems identified (evidence-based)

| Candidate problem | Verdict | Basis |
| --- | --- | --- |
| Long-running multi-step CAD planning inside Battenmark | **NO CURRENT REQUIREMENT** | External agents already compose our ops; nothing in the product requires us to host the loop. |
| Tool selection / discovery | Solved | `inspect_backend_capabilities` + `tools/list` (75 typed ops) exist; parity-tested. |
| Session/task persistence for CAD work | Solved natively | Project/revision persistence; restart-persistence and imported-definition-restart tests prove it. |
| Worker crash recovery | Solved natively | Kill→respawn race fixed + regression-tested (`crash`, `restart-race`). |
| Error semantics for agents | Solved natively | Structured error codes are the contract; `FILLET_FAILED`-style messages verified end-to-end. |
| Skill/workflow packs (enclosure, DFM, printing) | **Future probable requirement** | Repeated agent guidance (how to design an enclosure) is currently re-explained per session. Markdown instruction packs would solve this without runtime plugins. Donor evidence informs governance (below). |
| Context growth from large CAD outputs | Nice-to-have / conditional | Only matters if Battenmark itself hosts conversations — it does not today. Clients own their context. |
| Human approval gates for destructive/batch ops | Future probable requirement | Current op surface is conservative; if bulk-destructive ops arrive, adopt an approval-gate pattern (donor evidence below). |
| Provider abstraction | **Not currently needed — intentionally absent** | Battenmark speaks to brains through MCP/HTTP; owning provider SDKs would couple the platform to vendors. |
| Observability of agent runs | NO CURRENT REQUIREMENT | Runs live in clients; Battenmark logs operations server-side already. |
| Sandboxed general-purpose execution | **Anti-goal for core** | Battenmark refuses privileged eval (`PRIVILEGED_DENIED` test). No shell surface to secure. |

## 5. Agent Zero findings (pinned `b22a144`)

| Aspect | Finding (source-cited) |
| --- | --- |
| Runtime | Python; Flask UI entry `run_ui.py`; ~171 endpoint modules under `api/`; bundled `webui/` component frontend — **strong UI/runtime coupling**. |
| Dependencies (heavy) | `requirements.txt`: `docker==7.1.0`, `faiss-cpu==1.11.0`, `langchain-core/-community/-unstructured`, `litellm==1.88.1`, `openai==2.41.1`, `openai-whisper`, `kokoro>=0.9.2` (TTS), `fastmcp==3.2.4`, `fasta2a==0.5.0`, `flask[async]`, `GitPython`, `duckduckgo-search`. Full-ecosystem weight. |
| Agent loop | `agent.py::Agent.monologue()` (`while True` turn loop); `AgentContext` with pause/intervention machinery (`agent.py:51`, `:268`). Loop logic interleaved with UI intervention concerns. |
| Tools | `tools/*.py`, each paired with a `.dox.md` doc (e.g. `tools/call_subordinate.py(.dox.md)`, `parallel.py`, `scheduler.py`, `knowledge_tool._py`). Doc-file convention is nice; schemas are lighter-weight than Battenmark's required-field contracts. |
| Memory | `plugins/_memory/tools/memory_{save,load,forget,delete}.py` over `faiss-cpu` embeddings — vector memory owned by the agent runtime. |
| Personas/subagents | Persona directories `agents/{default,developer,researcher,...}`; profile-validated subordinates (`tools/call_subordinate.py::_validate_subordinate_profile`). |
| Execution sandbox | Docker-centric: `helpers/docker.py` (docker SDK init) — code execution assumes containers; host fallback paths are secondary. Linux-container orientation. |
| Provider abstraction | `models.py` → `helpers/providers.get_provider_config`; litellm-mediated. Configurable but framework-owned. |
| MCP | Exposes itself as an MCP server (`fastmcp`; security test `tests/test_fastmcp_openapi_security.py`); also A2A via `fasta2a`. Acting as an MCP *client* toward third-party servers: not established from source at this pin. |
| Tests | Present but distributed across `plugins/*/tests` and `tests/*` — moderately proven, not uniformly deep. |
| License | MIT throughout; no separate-license assets found at pin. |

**Net:** valuable as a *design reference* (persona hierarchy, per-tool dox docs, exposing oneself as MCP/A2A server). Direct reuse would drag Flask/webui coupling, the LangChain/litellm stack, Docker assumptions, and a UI-owned loop into Battenmark — exactly the coupling inversion the invariant forbids.

## 6. Hermes findings (pinned `5908c57`, v0.20.5)

| Aspect | Finding (source-cited) |
| --- | --- |
| Runtime | Python ≥3.11,<3.14; uv-managed; `run_agent.py`/`cli.py` entries; desktop app under `apps/desktop`; Termux constraint file signals portability focus. |
| Dependencies (deliberately lean core) | Core deps exact-pinned with written supply-chain rationale in `pyproject.toml` (Mini Shai-Hulud worm note); provider-specific SDKs lazy-installed via `tools/lazy_deps.py`. Small blast radius philosophy. |
| Agent loop | `agent/conversation_loop.py:2017`: `while (api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:` — explicit iteration budget with grace mechanics; `iteration_budget.py`; MoA variant (`moa_loop.py`). |
| Context management | **Pluggable engine seam**: `agent/context_engine.py::class ContextEngine(ABC)` with abstract `compress()` (:163); concrete `agent/context_compressor.py::ContextCompressor` (~5.8k lines, summarization-based); plus `native_compaction.py`, `conversation_compression.py`. The ABC is the transferable idea — not the 5.8k-line implementation. |
| Memory | `agent/memory_provider.py` — pluggable providers (`'builtin' | 'honcho' | 'hindsight'`, :110) with drift-prevention comments vs classifier plugins; Honcho arrives as a lazy external service dep (`lazy_deps.py:193`). Memory is a swappable *provider*, not baked in. |
| Skills | Full governance stack: `tools/skills_hub.py`, `skill_ledger.py`, `skills_ast_audit.py` (AST-level audit of skill code), `skill_provenance.py`, `skills_sync*.py`. Treats skills as a supply chain to be audited. |
| Checkpointing | `tools/checkpoint_manager.py` — git **shadow repo per working directory** (`_shadow_repo_path`, `_normalize_path`, `_project_hash`): resumable, hash-validated task checkpoints. |
| Approvals | `tools/approval.py`: "Dangerous command approval — detection, prompting, and per-session state." |
| Defense-in-depth | `agent/file_safety.py`, `tool_guardrails.py`, `estop.py` (emergency stop), `empty_response_guard.py`, `bounded_response.py`, `error_classifier.py`, plus `tools/tirith_security.py` tool scanning; SECURITY.md names a load-bearing trust boundary. |
| Provider resilience | Capability-provider pattern per modality (`browser_provider.py`, `tts_provider.py`, `memory_provider.py`, …) + vendor adapters (`anthropic_adapter.py`, `bedrock_adapter.py`, `gemini_native_adapter.py`); provider failover with primary-recovery surfaced in `chat_completion_helpers.py`/`agent_runtime_helpers.py` — added **with dedicated tests** in the pinned HEAD's parent commit (`tests/run_agent/test_provider_fallback.py`, `test_primary_runtime_restore.py`, `test_retry_status_buffer.py`). |
| MCP | Client-side integration: `tools/mcp_oauth.py`, tool `registry.py`, `tool_search.py` — Hermes consumes external MCP servers (with OAuth). |
| Tests | **3,360 test files** under `tests/` including failure-mode suites — exceptionally mature. |
| License | MIT; pyproject declares `license-files=["LICENSE"]`; no foreign-licensed bundles found at pin. |

**Net:** the strongest donor by engineering discipline. Still, adopting it wholesale would embed a conversation-runtime with desktop-app ambitions into a CAD platform — unnecessary. Its *patterns* are the treasure.

## 7. Normalized terminology

| Concept | Battenmark | Agent Zero | Hermes | Notes |
| --- | --- | --- | --- | --- |
| Public operation | typed op in `schema.ts` (75) | tool class in `tools/` (+dox.md) | toolset member via `registry.py` | Battenmark's are wire-schema-authoritative; donor tools are runtime-registered |
| Tool invocation | `executeTool(op, args)` envelope | tool call inside `monologue()` | guarded dispatch (`tool_dispatch_helpers.py`) | semantic overlap high |
| Session/project | project + revisions | chat/session JSON | session + checkpoint shadow repo | ownership differs: BM persists CAD truth, donors persist conversation |
| Agent run | *(none — external)* | `monologue()` cycle | conversation_loop turn cycle | BM deliberately has no equivalent |
| Skill | *(none)* | skill prompts/extensions | audited/provenanced skills | BM future: docs-first packs |
| Memory | project state only | faiss plugin | pluggable providers | do not duplicate |
| Artifact | artifact store (exports/previews) | workdir files | workspace files | BM artifacts are typed + addressed |
| Approval | *(none yet)* | UI interventions | `approval.py` per-session gates | pattern transferable |
| Context | *(client-owned)* | prompt extras + history | `ContextEngine(ABC)` | seam idea transferable |

## 8. Per-subsystem decisions

| Domain | Battenmark today | Agent Zero | Hermes | Decision | Source donor | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Agent loop | none (external-driven) | UI-coupled monologue | budgeted loop, tested | **REFERENCE ONLY** | Hermes | Loop shape/budget/grace worth imitating if an optional agent ever ships; zero need today |
| Tool orchestration | typed 75-op registry | dox-documented tools, looser schemas | registry + guardrails + search | **REJECT** (keep native) | — | Typed schema authority *is* the product; donor orchestration would weaken guarantees and duplicate MCP |
| Skills | none | prompt-pack skills | governed: ledger/provenance/AST-audit/sync | **ADAPT** (docs-first, Hermes governance ideas) | Hermes | Start with markdown `skills/cad-*` instruction packs (no runtime plugins); import governance checklist (provenance + audit) when/if executable skills ever arrive |
| Memory | project/revision persistence | faiss plugin | pluggable providers (builtin/Honcho/hindsight) | **REJECT** | — | One source of truth for CAD state; conversation memory belongs to clients |
| Context management | n/a (stateless ops) | prompt extras | `ContextEngine(ABC)` + compressor impl | **REFERENCE ONLY** | Hermes | Adopt the ABC seam shape in a future optional agent; reject the 5.8k-line compressor |
| Subagents | n/a | persona subordinates | async delegation/MoA | **REJECT** (no current requirement) | — | Tool-based decomposition suffices; specialists = future skill packs first |
| Error recovery | structured codes + worker restart/recovery | generic | `error_classifier`, tested provider failover | **REFERENCE ONLY** | Hermes | BM's domain recovery is already deterministic + regression-tested; classification-taxonomy idea noted |
| Human approval | none yet | UI interventions | dangerous-command gating, per-session state | **REFERENCE ONLY** | Hermes | Pattern to reuse when destructive/batch ops appear; harmless CAD ops must stay approval-free |
| Provider abstraction | intentionally absent | litellm config | capability-provider + tested failover | **REJECT** (core); optional-layer-only concern | Hermes | Platform stays provider-neutral; brains connect via MCP/HTTP |
| Persistent sessions | project/revision model | chats JSON | shadow-git checkpoint manager | **REJECT** (keep native) | Hermes | Do not create competing truth; BM revisions already checkpoint geometry. Shadow-checkpoint idea applies only to a future agent's *own* scratch state |
| MCP interoperability | authoritative MCP server | exposes itself as MCP server | MCP **client** with OAuth (`mcp_oauth.py`) | **KEEP NATIVE / INTEROP** | — | Standard boundaries win; see §10 |
| Security/sandboxing | no exec surface (`PRIVILEGED_DENIED`) | Docker sandbox for its exec | guardrails + approvals + estop + AST audit + trust doc | **REFERENCE ONLY** (taxonomy) | Hermes | Never inherit unrestricted execution; copy the *checklist*, not the machinery |
| Observability | server-side operation logs | websocket event stream to UI | monitoring module | **REJECT** (for now) | — | Clients own run observability; NO CURRENT REQUIREMENT |

## 9. Architecture options scored

Scale: 1 (poor) – 5 (excellent). Scores are judgments grounded in the cited findings, not arithmetic destiny.

| Criterion | Opt 0: no donor runtime (today) | Opt 1: small native optional agent | Opt 2: donor adapters | Opt 3: embed donor modules | Opt 4: framework-centric |
| --- | --- | --- | --- | --- | --- |
| Battenmark independence | 5 | 5 | 4 | 3 | 1 |
| Backend neutrality | 5 | 4 | 4 | 3 | 1–2 |
| Universal client compatibility | 5 | 4 | 5 | 4 | 2 |
| Mac-first compatibility | 5 | 4 | 4 | 2–3 (AZ Docker/Linux tilt) | 2 |
| Implementation effort (lower=better) | 5 (nothing) | 3 | 4 | 2 | 1 |
| Maintenance burden | 5 | 3 | 4 | 2 | 1 |
| Dependency weight | 5 | 4 | 4 | 2 (AZ: langchain/faiss/whisper…) | 1 |
| Security surface | 5 | 3–4 | 4 | 2 | 1–2 |
| Testability | 5 | 3 | 4 | 2 | 2 |
| Replaceability | 5 | 4 | 4 | 3 | 1 |
| Agent capability (BM-hosted) | 1 | 4 | 3 (capability lives in donor) | 3–4 | 5 |
| Long-term extensibility | 3 | 5 | 4 | 2 | 2 |
| **Judgment** | **Correct today** | **The only path if a hosted agent is ever justified** | **Cheap interoperability win — pursue passively** | Reject | Reject |

**Recommendation:** Option 0 is today's correct answer and remains the default. Option 2 costs nothing (standard MCP both directions — see §10) and should simply be kept true. Option 1 is pre-approved *in principle* only as a small, optional, client-shaped package **if** a demonstrated product need appears; it must borrow Hermes' patterns (budget/guardrails/approval/pluggable-context seams) rather than its runtime. Options 3–4 rejected on dependency weight (AZ: LangChain/faiss/whisper/Flask stack), coupling inversion, and Mac-first friction (AZ's container-centric execution).

## 10. MCP interoperability (kept strictly separate from integration)

Battenmark-side facts (verified in Phases 6.1/6.1.1): standard MCP SDK server on stdio + HTTP; 75 typed tools; raw JSON-RPC conformance proven end-to-end by `run-mcp-tests.ts`, `transport-parity` (mcp=48000), and the closeout smoke (initialize → tools/list → full CAD chain).

Donor-side facts (source-cited): **Hermes is an MCP client** (`tools/mcp_oauth.py` OAuth handling; `tools/registry.py`, `tools/tool_search.py` MCP-aware) — it can consume external MCP servers, so `Hermes → MCP → Battenmark` requires no Battenmark change beyond keeping the standard surface healthy. **Agent Zero exposes itself as an MCP server** (`fastmcp`, `tests/test_fastmcp_openapi_security.py`); whether its client side can mount third-party MCP servers was **not established** at pin `b22a144` — flagged for a live verification harness rather than assumed either way.

Live pairwise interop execution was **not performed** in this phase (no donor runtime launched); this is recorded honestly as the smallest follow-up experiment (roadmap slice 7A-verify). Nothing discovered suggests architectural obstacles: both sides speak standard MCP.

## 11. Anti-patterns observed (do not import)

- Prompt-markdown-as-architecture: Agent Zero's behavior/protocol lives in `prompts/*.md` — fine for its product, fatal where Battenmark relies on typed schemas.
- UI-owned agent loop: intervention/pause machinery woven through `Agent.monologue()`.
- Framework-owned vector memory (faiss plugin) duplicating state the platform already persists.
- Heavy mandatory stacks (LangChain + litellm + whisper/TTS) for capabilities unrelated to CAD.
- Container-required execution defaults conflicting with Mac-first local experience.
- Unrestricted autonomous execution surfaces without per-session approval state (Hermes shows the disciplined version of this; Agent Zero's hacker persona illustrates the casual version).

## 12. Interaction with Phase 6.2 (analysis only; WIP untouched)

Phase 6.2 WIP (branch `phase-6.2-backend-neutrality` @ `2f545f7`, uncommitted: `b23d/` build123d worker, `src/cad/kernel/b23d.server.ts`, `run-backend-neutrality.ts` conformance runner, capabilities/registry/types edits) establishes a **second authoritative-family backend with cross-backend golden conformance** ("Same Battenmark IR → FreeCAD/OCC and build123d → equivalent geometry", per the runner header).

- Conflict with Phase 7: **none.** Every decision here keeps donor influence out of the CAD core; an eventual optional agent layer would consume the public contract only.
- Complementarity: Phase 6.2 hardens exactly the neutrality seam a donor-influenced agent layer must sit above.
- Sequencing: **land Phase 6.2 before any Phase 7 implementation slice** that adds an agent-facing surface, so the agent layer targets an already-proven multi-backend contract. No Phase 7 documentation depends on it landing.

## 13. Proposed implementation slices (defined, NOT implemented)

| Slice | Goal | Scope | Depends on | Donor source | Acceptance gate | Risk | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7A — interop verification harness | Prove `Hermes → MCP → Battenmark` and probe `Agent Zero → MCP → Battenmark` live | Ephemeral harness outside production tree; record results in docs | None | — | Both donors complete a 3-op CAD chain over MCP unchanged; results committed as evidence doc | Low | S |
| 7B — skills/cad-\* instruction packs | Docs-first skill packs (enclosure, assembly-design, dfm, freecad-debugging) | `skills/` markdown + index; consumed by any client via context | 6.2 recommended | Hermes governance checklist | Packs reviewed against schema; no runtime code | Low | M |
| 7C — optional agent runtime contract (design only → then build if justified) | `BattenmarkAgentRuntime` as just-another-client above `executeTool` | New optional package; budget/guardrails/approval seams modeled on Hermes patterns; pluggable `ContextEngine(ABC)`-shaped seam | Demonstrated product need + 6.2 landed | Hermes (patterns) | Contract doc + ADR amendment + failing-first acceptance tests | Medium | L — gated |
| 7D — approval gate for destructive/batch ops | Per-session approval state for genuinely destructive operations | Service-layer gate keyed off op risk classes | Product need for such ops | Hermes `approval.py` pattern | Deny-path tests alongside happy paths | Medium | M — need-gated |
| 7E — donor adapter recipes | Documented configs for driving Battenmark from AZ/Hermes | Docs + example configs only | 7A results | — | Recipes reproducible from clean machines | Low | S |

## 14. Compliance summary

If, and only if, future slices copy MIT donor material (currently none do): retain the donor's LICENSE copyright line in an appropriate NOTICE position ("Portions copyright Nous Research / Agent Zero, s.r.o"), and re-run a dependency-license audit scoped to the copied component. Today's deliverables contain no donor code, so no attribution obligations attach beyond this document's citations.
