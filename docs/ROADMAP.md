# Roadmap

Chronology of the current program (evidence-driven; do not skip gates).

## Complete

- Phase 6 / 6.1 / 6.1.1 — assemblies, constraint hardening, six-state DOF goldens
- Phase 6.2 — backend-neutrality closeout; public contract, registry, capabilities,
  and routing remain backend-neutral without shipping a second production CAD engine
- Phase 7A — MCP interoperability (Hermes client path)
- Phase 7B — CAD skills / workflow packs (instruction-only)
- Phase 7C — skill evaluation harness (Layer A reference oracles, CI-enforced)
- Phase 7C.2 through 7C.7 — provider seam, credentialed real-agent A/B,
  trace/recovery integrity, enclosure scorer integrity, targeted skill remediation,
  bounded continuation protocol, and evaluation identity/referential integrity
- Phase 7C.8 evidence closeout — frozen v4 18-row GPT-4o run plus credential-free
  forensic qualification. Canonical A/B evidence is preserved; no additional paid
  rerun or skill/scorer rewrite is justified by the current traces.
- Phase 7C integration closeout — PR #18 merged; historical stacked PRs retired.
- Topology/reference robustness — gref audit, mutation test matrix (16 families),
  public-path regressions, minimum root fix (auto-populate geometryRefs[]),
  serialization round-trip proofs, contract documentation.

## Current

- **Gref resilience hardening.** Add fingerprint fallback to JSCAD envelope path
  (assembly solver), implement identity-based grefs (non-positional), and add
  automated regression tests that verify gref stability after topology mutations
  across all backend paths.
- Phase 7D MCP skill discovery remains deferred.

## Next after topology/reference robustness

- **Gref resilience hardening.** Add fingerprint fallback to JSCAD envelope path
  (assembly solver), implement identity-based grefs (non-positional), and add
  automated regression tests that verify gref stability after topology mutations
  across all backend paths.
- Phase 7D MCP skill discovery remains deferred — current evidence does not
  justify another paid rerun or skill rewrite.

## Later candidates

1. Constraint breadth beyond the rigid subset (screw/gear/path joints)
2. Nested assemblies & assembly-level patterns
3. Structured STEP product hierarchy guarantees
4. Second authoritative-family backend (build123d/CadQuery) as an optional adapter
5. Packaging / dependency hygiene (unused frontend/auth/db packages in package.json)

A second backend remains intentionally later: backend neutrality is already closed,
and Battenmark should improve the reliability of its current authoritative path before
adding another production geometry family.
