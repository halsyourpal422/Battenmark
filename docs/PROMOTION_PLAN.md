# Battenmark Public Promotion & Adoption Plan

Status date: 2026-09-07

This plan separates **verified Battenmark evidence** from future compatibility
targets. Public claims should describe what has actually been proven, then label
broader provider/client support as architecture or future validation work.

## Current verified story

Battenmark now has two strong client paths plus one completed hard benchmark:

1. **ChatGPT Work on macOS → Battenmark → FreeCAD 1.1.3 / OpenCascade → CAD exports → physical 3D print.**
   - geometry creation;
   - parametric rebuilds;
   - worker restart/recovery;
   - validation;
   - FCStd / STEP / STL / 3MF export;
   - successful physical print of a **60 × 25 × 4 mm** calibration coupon with nominal **3 / 4 / 5 mm** holes.

2. **Claude via MCP → Battenmark → FreeCAD 1.1.3 / OpenCascade.**
   - 75-tool discovery smoke proof;
   - valid **20 × 15 × 5 mm / 1,500 mm³** OCC solid;
   - full initial two-piece Orange Pi 4 Pro workflow through Battenmark only;
   - persistence/reopen across a 50-revision engineering session.

3. **Corrected Orange Pi 4 Pro full-fidelity benchmark — PASS.**
   - final corrected lid rim: **90.6 × 57.6 mm outer, 85.8 × 52.8 mm inner, 2.4 mm walls**;
   - six true **2.4 × 55 mm** through-vents;
   - final 3MF: **2 watertight manifold objects**;
   - base mesh volume: **28,142.686683 mm³**;
   - lid mesh volume: **13,138.560000 mm³**;
   - analytical lid target: **13,138.56 mm³**;
   - combined mesh volume: **41,281.246683 mm³**;
   - Battenmark export volume: **41,281.356 mm³**;
   - difference: **0.109317 mm³ / 0.000265%**;
   - persistence/reopen through a fresh stdio MCP process: PASS;
   - direct FreeCAD bypass: NO;
   - overall benchmark: **PASS**.

Hermes also has stock-client MCP interoperability evidence, while Agent Zero
remains source-assessed rather than directly validated. See
[`docs/CLIENT_VALIDATION.md`](CLIENT_VALIDATION.md).

Do not claim that every LLM, agent framework, IDE agent or local model has been
proven through Battenmark. Provider-neutral architecture is a design property;
validated client interoperability is an evidence claim.

## Launch sequence

### P0 — technical proof / repo readiness

- [x] Repository is public.
- [x] Apache-2.0 license, notices, security and contribution docs exist.
- [x] Canonical demo evidence is in the repository.
- [x] Approved geometric Battenmark B mark is in `media/brand/`.
- [x] Approved horizontal Battenmark lockup is integrated at the top of the README.
- [x] GitHub hero uses corrected Orange Pi PASS evidence.
- [x] Social-preview media uses approved branding and corrected benchmark evidence.
- [x] README distinguishes validated client paths from general client-neutral architecture.
- [x] ChatGPT Work physical-output proof completed.
- [x] Claude tiny MCP interoperability proof completed.
- [x] Claude 50-revision hard enclosure workflow completed through Battenmark only.
- [x] Initial PARTIAL hard-test audit documented rather than hidden.
- [x] Solid lid plug corrected to hollow perimeter friction rim.
- [x] Blind vents corrected to true through-vents.
- [x] Corrected enclosure rebuilt, inspected and freshly exported through Battenmark only.
- [x] Corrected enclosure passed geometry and specification-fidelity checks.
- [x] Final 3MF independently audited: two watertight manifold objects, no phantom geometry.
- [x] Fresh-process persistence/reopen verified.
- [x] Hard benchmark promoted to **PASS**.
- [x] Issue #26 wording corrected after the focused real-FreeCAD regression on current `main`.
- [ ] Verify CI/checks on the latest promotion-branch head.
- [ ] Merge PR #25 when current-head CI and mergeability are green.

A physical Orange Pi enclosure print is useful next-stage fit/assembly evidence,
but it is **not required to establish the CAD execution benchmark**, because the
final CAD, analytical geometry, export and persistence evidence already pass.

### P1 — launch package

- [ ] Flagship 60–90 second demo video produced.
- [ ] 3–5 polished public demo pages selected.
- [ ] `Made with Battenmark` gallery created.
- [x] Public benchmark/result format separates geometry, export, persistence and spec-fidelity scoring.
- [ ] Simple Battenmark landing page published.
- [ ] Repository topics finalized: `freecad`, `cad`, `3d-printing`, `llm`, `ai`, `open-source`, `mcp`, `agents`, `opencascade`.

### P2 — community launch

- [ ] FreeCAD community introduction.
- [ ] Reddit engineering posts tailored by community.
- [ ] Show HN launch.
- [ ] Initial technical tester group recruited.
- [ ] Build-in-public cadence begins.

### P3 — expansion

- [ ] Publish additional validated client/provider results.
- [ ] Expand benchmark coverage.
- [ ] Outreach to agent-framework maintainers and CAD/AI developers.
- [ ] Product Hunt only after the technical launch material is proven and polished.
- [ ] Paid ads remain deferred until organic adopter signal exists.

## Public positioning

Preferred short description:

> Battenmark is open, backend-neutral CAD infrastructure that lets AI agents and software create, modify, validate and export authoritative CAD through FreeCAD/OpenCascade and interchangeable backends.

Preferred proof statement:

> ChatGPT Work has a physical-output Battenmark proof on macOS, Claude is a validated Battenmark MCP client that completed the original 50-revision Orange Pi workflow, and the corrected two-piece Orange Pi 4 Pro enclosure now passes geometry, specification-fidelity, export and persistence checks entirely through Battenmark.

Avoid broad claims such as “works with every LLM” until those paths have been
validated through Battenmark itself.

## Demo hierarchy

1. **Hard real-world benchmark:** corrected Orange Pi 4 Pro two-piece enclosure — **PASS**.
2. **Physical proof:** calibration coupon — simple, understandable, physically printed.
3. **Iterative CAD edit:** requirement change followed by rebuild and validation.
4. **Round-trip engineering:** import → inspect → modify → export.
5. **Assembly / diagnostics:** constrained multi-part example where supported.

Every public demo should preserve:

- exact prompt or task definition;
- Battenmark version/SHA or project revision IDs;
- client/runtime used;
- FreeCAD version;
- validation results and warnings;
- geometry measurement source (B-rep, mesh, analytical, or multiple);
- specification-fidelity result;
- produced file formats;
- screenshots or render evidence;
- physical-print evidence when applicable;
- known limitations, failures and recovery steps.

If a body carries non-manifold-edge warnings, do **not** automatically treat the
raw OpenCascade B-rep volume integral as ground truth. Cross-check mesh and/or
analytical volume and publish the discrepancy.

## Engineering investigation preserved from the PASS

The corrected benchmark exposed an important discrepancy during the vent edit,
but the broad original diagnosis has been narrowed by PR #27.

A focused real-FreeCAD regression on current `main` proves that changing an
existing pocket from 3 mm to 6 mm through `set_feature_param` correctly updates
the IR, fresh FreeCAD rebuild, STEP, 3MF and post-restart result. No production
code change was required.

Therefore public material must **not** call issue #26 a confirmed generic worker
synchronization defect. The remaining investigation is specific to the Orange Pi
feature chain: the six-profile vent sketch, `Plug_Hollow`, feature ordering and
related pocket direction/placement semantics. Recreating the vent pocket at the
end of the feature history changed more than depth alone.

This is still valuable benchmark evidence: the final enclosure PASS is real, the
original discrepancy remains documented, and the project distinguishes an
observed failure from an unproven root-cause claim.

## Community post strategy

Posts should read like engineering reports, not advertisements. Lead with the
problem, show the actual CAD result, explain how Battenmark sits between the
agent and CAD backend, show the failure/correction history, and invite
reproducible testing.

The Orange Pi story is stronger because it includes both a PARTIAL stage and a
corrected PASS. It demonstrates the difference between:

- client/tool interoperability;
- CAD execution;
- feature-history semantics;
- B-rep warnings and measurement reliability;
- export fidelity;
- actual engineering/specification correctness;
- and recovery from detected modeling failures.

Target communities after P0 presentation checks close:

- FreeCAD forum/community spaces;
- CAD and 3D-printing communities;
- open-source developer communities;
- AI-agent and local-model communities where relevant;
- Hacker News / Show HN.

## Early tester program

Give testers concrete tasks rather than asking for generic impressions.
Suggested starter set:

- dimensioned mounting bracket;
- electronics enclosure with ports and screw bosses;
- iterative dimension change after initial build;
- imported STEP modification;
- export to STEP + STL/3MF;
- deliberate worker restart and recovery.

Record pass/fail, number of corrective turns, geometry validity, rebuild status,
export success, **specification fidelity**, measurement source and tester notes.

## Promotion guardrails

- Evidence before claim.
- Battenmark is the interface under test; direct FreeCAD control is not a substitute.
- Keep public compatibility claims at the exact evidence level achieved by each client.
- Protocol/tool discovery is not autonomous CAD quality.
- Valid B-rep geometry is not the same as a correct mechanical design.
- Export fidelity is not the same as specification correctness.
- Do not hide failed tests; useful failures become benchmark material.
- Do not convert an observed discrepancy into a root-cause claim before reproduction.
- Preserve issue #26 as an open feature-history investigation until the complex benchmark chain is reproduced.
- Do not spend on ads before developer/community adoption signals appear.
