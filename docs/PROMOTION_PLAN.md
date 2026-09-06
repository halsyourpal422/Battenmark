# Battenmark Public Promotion & Adoption Plan

Status date: 2026-09-06

This plan intentionally separates **verified Battenmark evidence** from future
compatibility targets. Public claims should describe what has actually been
proven, then label broader provider/client support as architecture or future
validation work.

## Current verified story

The strongest current end-to-end proof is:

**ChatGPT Work on macOS → Battenmark → FreeCAD 1.1.3 / OpenCascade → validated CAD exports → physical 3D print.**

The path has been exercised with geometry creation, parametric rebuilds,
worker restart/recovery, validation, and FCStd / STEP / STL / 3MF export. A
60 × 25 × 4 mm calibration coupon with nominal 3 / 4 / 5 mm through-holes was
successfully printed.

Do not claim that Claude, Gemini, Grok, Codex, local models, or other clients
have been proven end-to-end through Battenmark until separate evidence exists.
Provider-neutral architecture is a design property; validated client
interoperability is an evidence claim.

## Launch sequence

### P0 — complete before broad promotion

- [x] Repository is public.
- [x] Apache-2.0 license, notices, security and contribution docs exist.
- [x] Canonical demo evidence is in the repository.
- [x] GitHub hero media exists.
- [x] Social-preview media exists.
- [x] README now displays the GitHub hero at the top.
- [x] README distinguishes the proven GPT Work path from general client-neutral architecture.
- [ ] Approved geometric Battenmark B mark uploaded into `media/brand/`.
- [ ] Approved mark integrated into hero/social assets.
- [ ] Harder real-world GPT Work → Battenmark → FreeCAD test completed.
- [ ] Hard-test result documented with exact prompt, validation, exports and screenshots.
- [ ] Physical print added when useful to the proof.

### P1 — launch package

- [ ] Flagship 60–90 second demo video produced.
- [ ] 3–5 polished public demo pages selected.
- [ ] `Made with Battenmark` gallery created.
- [ ] Public benchmark/result format finalized.
- [ ] Simple Battenmark landing page published.
- [ ] GitHub social preview updated with approved brand asset.
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

> The currently published end-to-end client proof is ChatGPT Work on macOS using Battenmark to drive FreeCAD/OpenCascade, export real CAD files, and produce a physical 3D print.

Avoid broad claims such as “works with every LLM” until those paths have been
validated through Battenmark itself.

## Demo hierarchy

1. **Physical proof:** calibration coupon — simple, understandable, printed.
2. **Hard real-world part:** enclosure or mechanically meaningful parametric part.
3. **Iterative CAD edit:** requirement change followed by rebuild and validation.
4. **Round-trip engineering:** import → inspect → modify → export.
5. **Assembly / diagnostics:** constrained multi-part example where supported.

Every public demo should preserve:

- exact prompt or task definition;
- Battenmark version/SHA;
- client/runtime used;
- FreeCAD version;
- validation results;
- produced file formats;
- screenshots or render evidence;
- physical-print evidence when applicable;
- known limitations or corrections.

## Community post strategy

Posts should read like engineering reports, not advertisements. Lead with the
problem, show the actual CAD result, explain how Battenmark sits between the
agent and CAD backend, and invite reproducible testing.

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
export success and tester notes.

## Promotion guardrails

- Evidence before claim.
- Battenmark is the interface under test; direct FreeCAD control is not a substitute.
- Keep public compatibility claims provider-neutral unless the specific client path is validated.
- Do not hide failed tests; useful failures become benchmark material.
- Do not over-polish before the hard real-world proof exists.
- Do not spend on ads before developer/community adoption signals appear.
