# Phase 7B — CAD Skills / Workflow Pack Architecture

**Status:** Complete  
**Date:** 2026-08-25  
**Baseline:** Phase 7A merged SHA `e21b90abe5cd3a8397dc57b310a2f45245a17069`  
**Branch:** `phase-7b-cad-skills-architecture`  
**Decision reference:** [ADR-0004](../adr/0004-agent-runtime-boundary.md) · Phase 7 assessment · Phase 7A interop

## 1. Executive decision

**Battenmark skills are trusted, versioned instruction/workflow packs.**

They are **not** executable plugins, an agent runtime, a parallel geometry API, donor-specific code, or a mechanism to bypass the typed public contract.

Skills sit **above** the Battenmark typed public contract. The sole executable authority remains the schema/tool registry.

**Executable code policy (v1):** A skill **must not** contain executable code, scripts, hooks, or any automatic-run mechanism.

**Discovery (v1):** Repository-bundled + manual loading. No MCP resource surface, no runtime plugin registry, no automatic third-party download.

**Runtime impact:** Zero. Skills are static files.

## 2. Format decision

| Option | Verdict |
|--------|---------|
| A — Markdown-only | Strong |
| **B — Markdown + skill.json metadata** | **Chosen** |
| C — Executable package | Rejected |

## 3. Skill schema (v1)

```text
skills/<id>/
  SKILL.md          # required
  skill.json        # required for built-ins
```

`skill.json` required fields: id, name, version, description, category, risk_level, recommended_operations, last_verified_against, maintainer, source.

All recommended/optional operations must be subsets of live TOOL_NAMES (schema v2).

SKILL.md required headings: Purpose, Use when, Do not use when, Preconditions, Planning rules, Recommended operation sequence, Geometry / mechanical rules, Verification gates, Failure recovery, Outputs, Platform notes, Examples.

## 4. Governance

- Built-in skills: trusted after repository review; version-controlled; provenance via maintainer/source/last_verified_against + Git.
- Third-party: instruction-only, untrusted by default; no shell, network, private internals, or dependency installation privileges.
- Staleness: validator fails CI if a referenced operation disappears from TOOL_NAMES.
- Risk: low | medium | high — based on external consequence, not in-memory geometry mutation.

## 5. Validation

`npm run skills:validate` — static checks (files, headings, unique IDs, operation names vs live schema, no absolute paths/secrets).

`npm run skills:validate:test` — mutation tests (unknown op, missing heading, clean tree, id mismatch).

## 6. Initial built-in pack

| ID | Purpose |
|----|---------|
| `basic-part` | Parametric solid → inspect → preview → export |
| `enclosure` | Measured-design FDM enclosure |
| `assembly` | Incremental constraints + DOF inspection |
| `fdm-dfm` | FDM manufacturability review (general vs contextual) |
| `backend-diagnostics` | Public-surface recovery; never bypass service layer |

## 7. Discovery decision (v1)

**Repository / manual loading only.** Future MCP resources deferred until evaluation (Phase 7C) proves value.

## 8. Next task

**Phase 7C — CAD Skill Evaluation Harness:** compare tasks WITHOUT vs WITH skill. Do not introduce MCP skill-resource discovery first.

**BATTENMARK SKILLS POLICY:** Trusted, versioned, documentation-first workflow packs. Never executable plugins; never replace schema validation.

**EXECUTABLE SKILLS:** Forbidden in v1.  
**THIRD-PARTY SKILLS:** Instruction-only, untrusted by default.  
**DISCOVERY:** Repository-bundled + manual for v1.
