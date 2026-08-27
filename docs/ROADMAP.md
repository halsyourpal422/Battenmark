# Roadmap

Chronology of the current program (evidence-driven; do not skip gates).

## Complete

- Phase 6 / 6.1 / 6.1.1 — assemblies, constraint hardening, six-state DOF goldens
- Phase 7A — MCP interoperability (Hermes client path)
- Phase 7B — CAD skills / workflow packs (instruction-only)
- Phase 7C — skill evaluation harness (Layer A reference oracles, CI-enforced)

## Current

- **Phase 6.2 — backend-neutrality closeout** (this closeout): public contract,
  registry, capabilities, and routing stay backend-neutral. Does **not** ship a
  second production CAD engine.

## Next after 6.2

- Rebase/cherry-pick recovered EvalProvider (`recovery/phase-7c2-eval-provider`)
  onto the Phase 6.2 baseline
- **Phase 7C.2** — credentialed real-agent A/B (18 primary trials)
- Then exactly one:
  - Phase 7D — MCP skill discovery, if skills show useful benefit
  - Phase 7C.3 — skill content hardening, if benefit is weak/mixed

MCP skill discovery is deferred until A/B evidence exists.

## Later candidates

1. Second authoritative-family backend (build123d/CadQuery) as an optional adapter
2. Topology/reference robustness — deepen persistent gref guarantees
3. Constraint breadth beyond the rigid subset (screw/gear/path joints)
4. Nested assemblies & assembly-level patterns
5. Structured STEP product hierarchy guarantees
6. Packaging / dependency hygiene (unused frontend/auth/db packages in package.json)
