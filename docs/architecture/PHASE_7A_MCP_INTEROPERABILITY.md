# Phase 7A — MCP Interoperability Verification

Status: **COMPLETE** · Date: 2026-08-25
Baseline: `phase-6.1.1-baseline` (`a188f21`); Phase 7 assessment merged as `702d3c7` (PR #5).
Decision reference: [ADR-0004](../adr/0004-agent-runtime-boundary.md) · Assessment: [PHASE_7_DONOR_ASSESSMENT.md](PHASE_7_DONOR_ASSESSMENT.md)

**Question:** can Agent Zero and Hermes Agent operate Battenmark as ordinary external MCP clients, with zero Battenmark-specific integration?

## 1. Environment

| Item | Value |
| --- | --- |
| Host | macOS 26.x, Apple Silicon (arm64) |
| Node | v20.20.2 |
| Python | 3.11.14 (Hermes isolated uv venv); system 3.14 not used by donors |
| FreeCAD | 1.1.3 (`/Applications/FreeCAD.app`) |
| Battenmark transport | MCP stdio (`src/cad/mcp/stdio.ts`, official MCP SDK server) |
| Battenmark schema | v2 envelope; MCP 5.0.0; 75 tools |
| Hermes runtime | uv-managed venv, `uv sync --extra mcp` (the `mcp==2.0.0` extra is Hermes' documented optional MCP dependency) |
| Model for agent-mode runs | qwen3-vl:8b via local Ollama (`127.0.0.1:11434/v1`) — no paid APIs |

## 2. Pins

See [`scripts/interop/donors.json`](../../scripts/interop/donors.json): Hermes `5908c577f9048a0adcdd80fc467501b0f1e60b1b` (v0.20.5), Agent Zero `b22a144bf59f15b1516084c9e7b88133ba92c8a9`. Both clean checkouts at pinned SHAs.

## 3. Control run (stock Battenmark, standards-compliant client)

`npm run interop:control` — official MCP SDK client over stdio, two runs from clean state with a fresh server process per run:

```text
initialize                PASS  server=agentcad v5.0.0
discover                  PASS  tools=75
schema-required-fields    PASS  mate_faces required=[project_id,assembly_id,a_instance,a_face,b_instance,b_face]
constrain                 PASS  mate_faces top↔bottom applied
inspect-dof               PASS  planar golden dof=3 freeT=[x,y] freeR=[about_z]
structured-error          PASS  invalid instance ref → isError + structured envelope
error-recovery            PASS  session alive after error
export                    PASS  FCStd artifact created
artifact-nonempty         PASS  ~8.8 KB per export
restart-reconnect         PASS  identical tool count across fresh servers [75,75]
CONTROL INTEROP: ALL PASS (both runs)
```

## 4. Hermes — verdict: FULL INTEROP (protocol/client level)

Classification evidence from `scripts/interop/hermes-direct-driver.py`, which imports **only stock Hermes modules** (`tools.mcp_tool.register_mcp_servers`, `tools.registry.registry.get_entry`) and executes the entire chain through Hermes' own client bridge (`MCPServerTask` → MCP SDK session → Battenmark stdio). Two repeat runs, exit 0 both:

```text
hermes-connect-register   PASS  75 battenmark tools registered by stock client
hermes-discovery-count    PASS  discovered=75
hermes-schema-required    PASS  required fields exact after translation
hermes-schema-description PASS  descriptions survive
hermes-create-project     PASS  project_id returned
hermes-geometry-created   PASS  Anchor + Mover boxes
hermes-assembly-built     PASS  components + instances + grounding
hermes-constraint         PASS  mate_faces applied
hermes-dof-golden         PASS  dof=3 freeT=[x,y] freeR=[about_z]   ← solver-level proof through donor client
hermes-negative-structured PASS invalid instance ref → structured ok:false envelope
hermes-recovery-after-error PASS session functional afterwards
hermes-export-fcstd       PASS  artifact created
hermes-artifact-nonempty  PASS  fcstd bytes≈8.8 KB
13/13 checks passed — twice (project ids hermes-interop-direct-7 and -8)
```

### Agent-mode runs (LLM in the loop, informational)

Three autonomous `cli.py -q` runs (local qwen3-vl:8b) confirmed the full pipeline live: tool discovery surfaced Battenmark ops namespaced as `mcp__battenmark__*`; the agent dispatched real calls (16 tool calls in one run; results consumed across `kernel_status`, `create_box`, `inspect_document`, `rebuild_assembly`). Chain completion was blocked by local-model verbosity (output-token truncation after 4 continuations), i.e. a model-quality limit — not an interoperability limit. With a capable hosted model this is expected to reach FULL agent autonomy; verification with such a model is future work pending credentials.

### Disclosed driver accommodations (upstream quirk, not a Battenmark issue)

When driven embedded outside `cli.py` on macOS, Hermes' `#81995` stdio fast-fail liveness machinery mis-scopes child pids: `_stdio_children_dead()` returned True while four node/tsx processes were verifiably alive. The driver neutralizes exactly those two liveness guards (`_stdio_children_dead`, `_watch_stdio_children`) at runtime; every transport/session/discovery/handler path remains stock Hermes. Inside native `cli.py` runs the same server stayed connected without any accommodation.

### Error taxonomy through Hermes

Battenmark's structured failure survived to the client envelope intact: `{"ok":false,"operation":"set_distance","agentcad_schema_version":2,"project_id":…}` with the inner message — operation name, schema version and project context all preserved. Recoverability metadata rides in Hermes' circuit-breaker text ("auto-retry available in ~59s").

## 5. Agent Zero — verdict: NO DIRECT MCP CLIENT (at pin `b22a144`)

Source probe of the pinned tree: `ClientSession` / `stdio_client` / `fastmcp.Client` patterns appear nowhere outside server-side code. The only fastmcp usage is server exposure (`helpers/mcp_server.py::FastMCP`, plus OpenAPI-provider security tests); remaining `ClientSession` hits are unrelated aiohttp sessions (WhatsApp/Telegram helpers). Agent Zero can *be* an MCP/A2A server; it cannot *consume* an arbitrary external MCP server at this pin.

Per §19/§43 this is a successful finding, not a task failure. A bridge would be donor-side tooling (an AZ extension wrapping an MCP client) — feasible but not justified under the Phase 7 policy given AZ's low coupling value to Battenmark; revisit only if AZ gains native client support or a concrete AZ-first use-case appears.

## 6. Tool-schema fidelity

| Schema feature | Raw Battenmark MCP | Via Hermes client |
| --- | --- | --- |
| Operation names | `mcp__battenmark__<op>` namespacing added | preserved (namespaced) |
| Required fields | exact (incl. MCP-layer `project_id`) | exact — verified on `mate_faces` |
| Optional fields | preserved | preserved |
| Descriptions | full text | survive verbatim (70-char probe shown) |
| Enums/nested objects | `include.body_ids` arrays etc. | consumed correctly (define_component succeeded) |
| Structured errors | typed envelope w/ `operation`, schema version | survives into client result |

No flattening or loosening observed anywhere in the path.

## 7. Artifact & preview handling

FCStd exports round-tripped as addressed artifacts (~8.8 KB) with metadata retrievable through both clients. Preview handling was not exercised (secondary per brief §37); Battenmark's `render_preview` returns image content blocks via MCP which standard clients preserve.

## 8. Operational friction

| Factor | Hermes | Agent Zero |
| --- | --- | --- |
| Setup | clone + `uv sync --extra mcp` (~2 min) | Docker-centric stack, Flask UI, heavier install |
| Dependency weight | lean core, exact pins, lazy provider extras | heavy (langchain/faiss/litellm/whisper/kokoro) |
| Docker | optional | de-facto for its execution sandbox |
| API/model requirement | any provider incl. local Ollama | cloud keys typical |
| MCP configuration | `~/$HERMES_HOME/config.yaml` `mcp_servers:` stdio entry with `cwd` support — trivial | N/A (no client) |
| Mac-first fit | good (native, Termux-grade portability culture) | poor (Linux-container orientation) |

## 9. Impact on Phase 7 architecture decision

**CONFIRMED.** Live evidence strengthens Option 0/Option 2: Battenmark's stock MCP contract is already sufficient for the strongest donor client examined, so there is even less reason to embed anything. Follow-ups recorded: re-run Hermes agent-mode with a capable hosted model when credentials exist (expected to clear the token-truncation limit); revisit AZ only if upstream adds client support.

Harness: `scripts/interop/` (`control.mjs` CI-safe; `hermes.mjs`/`agent-zero.mjs` manual modes with clean SKIP semantics; `donors.json` pins; README with exact reproduction steps). No production source changed.
