# Battenmark Public Promotion & Adoption Plan

Status date: 2026-09-06

This plan intentionally separates **verified Battenmark evidence** from future
compatibility targets. Public claims should describe what has actually been
proven, then label broader provider/client support as architecture or future
validation work.

## Current verified story

Battenmark now has two different kinds of strong client evidence:

1. **ChatGPT Work on macOS → Battenmark → FreeCAD 1.1.3 / OpenCascade → CAD exports → physical 3D print.**
   - geometry creation;
   - parametric rebuilds;
   - worker restart/recovery;
   - validation;
   - FCStd / STEP / STL / 3MF export;
   - successful physical print of a **60 × 25 × 4 mm** calibration coupon with nominal **3 / 4 / 5 mm** holes.

2. **Claude via MCP → Battenmark → FreeCAD 1.1.3 / OpenCascade → 50-revision hard enclosure workflow.**
   - 75-tool discovery smoke proof;
   - valid **20 × 15 × 5 mm / 1,500 mm³** OCC solid in the tiny interoperability test;
   - full two-piece Orange Pi 4 Pro workflow through Battenmark only;
   - persistence/reopen across **50 revisions**;
   - 3MF export audit with **2 manifold objects**;
   - exported 3MF combined volume **58,737.036 mm³** vs audited mesh sum **58,736.927 mm³** — **0.109 mm³** discrepancy;
   - hard benchmark remains **PARTIAL / CAD_CORRECTION_REQUIRED** because the lid uses a solid plug instead of a hollow friction rim and the vents are blind instead of through-cut.

Hermes also has stock-client MCP interoperability evidence, while Agent Zero
remains source-assessed rather than directly validated. See
[`docs/CLIENT_VALIDATION.md`](CLIENT_VALIDATION.md).

Do not claim that every LLM, agent framework, IDE agent or local model has been
proven through Battenmark. Provider-neutral architecture is a design property;
validated client interoperability is an evidence claim.

## Launch sequence

### P0 — complete before broad promotion

- [x] Repository is public.
- [x] Apache-2.0 license, notices, security and contribution docs exist.
- [x] Canonical demo evidence is in the repository.
- [x] GitHub hero media exists.
- [x] Social-preview media exists.
- [x] Approved geometric Battenmark B mark uploaded into `media/brand/`.
- [x] Approved horizontal Battenmark lockup integrated at the top of the README.
- [x] README distinguishes validated client paths from general client-neutral architecture.
- [x] ChatGPT Work physical-output proof completed.
- [x] Claude tiny MCP interoperability proof completed.
- [x] Hard two-piece Orange Pi 4 Pro real-world test completed through Battenmark only.
- [x] Hard-test audit documented with revision, geometry, volume, export and failure evidence.
- [x] 3MF export fidelity audited: two manifold objects, no phantom geometry, mesh/export volume agreement to 0.109 mm³.
- [x] Public benchmark classification kept honest: **PARTIAL / CAD_CORRECTION_REQUIRED**.
- [ ] Correct Orange Pi lid **solid plug → hollow perimeter friction rim**.
- [ ] Correct Orange Pi **blind vents → through-vents**.
- [ ] Rebuild, inspect and re-export the corrected enclosure through Battenmark only.
- [ ] Confirm the corrected enclosure passes both geometry and specification-fidelity checks.
- [ ] Refresh GitHub hero/social-preview around the corrected hard benchmark and approved branding.
- [ ] Physical-print the corrected enclosure if the print adds useful fit/assembly evidence.

### P1 — launch package

- [ ] Flagship 60–90 second demo video produced.
- [ ] 3–5 polished public demo pages selected.
- [ ] `Made with Battenmark` gallery created.
- [ ] Public benchmark/result format finalized around separate geometry/export/spec-fidelity scores.
- [ ] Simple Battenmark landing page published.
- [ ] GitHub social preview updated with approved brand asset and strongest corrected benchmark.
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

> ChatGPT Work has a physical-output Battenmark proof on macOS, and Claude has completed both a direct MCP interoperability proof and a 50-revision Battenmark-only Orange Pi 4 Pro enclosure workflow through FreeCAD/OpenCascade. The enclosure benchmark is intentionally published as PARTIAL until its lid rim and vents are corrected.

Avoid broad claims such as “works with every LLM” until those paths have been
validated through Battenmark itself.

## Demo hierarchy

1. **Physical proof:** calibration coupon — simple, understandable, printed.
2. **Hard real-world benchmark:** Orange Pi 4 Pro two-piece enclosure — currently PARTIAL; correction run is the next proof target.
3. **Iterative CAD edit:** requirement change followed by rebuild and validation.
4. **Round-trip engineering:** import → inspect → modify → export.
5. **Assembly / diagnostics:** constrained multi-part example where supported.

Every public demo should preserve:

- exact prompt or task definition;
- Battenmark version/SHA;
- client/runtime used;
- FreeCAD version;
- validation results and warnings;
- geometry measurement source (B-rep, mesh, analytical, or multiple);
- specification-fidelity result;
- produced file formats;
- screenshots or render evidence;
- physical-print evidence when applicable;
- known limitations or corrections.

If a body carries non-manifold-edge warnings, do **not** automatically treat the
raw OpenCascade B-rep volume integral as ground truth. Cross-check mesh and/or
analytical volume and publish the discrepancy.

## Community post strategy

Posts should read like engineering reports, not advertisements. Lead with the
problem, show the actual CAD result, explain how Battenmark sits between the
agent and CAD backend, and invite reproducible testing.

The PARTIAL Orange Pi result is useful evidence because it demonstrates the
difference between:

- client/tool interoperability;
- CAD execution;
- B-rep warnings and measurement reliability;
- export fidelity;
- and actual engineering/specification correctness.

Target communities after P0 closes:

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
- Do not broad-launch the Orange Pi enclosure as a success until the rim/vent correction run passes.
- Do not spend on ads before developer/community adoption signals appear.
