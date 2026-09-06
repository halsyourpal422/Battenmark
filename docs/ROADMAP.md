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

## Current

- **Phase 7C integration closeout — PR #18.** Consolidate the completed evaluation
  lineage against `main`, preserve the frozen evaluated source SHA and evidence,
  verify normal PR CI plus exact-head evaluation-integrity CI, and complete an
  independent production/evaluation-boundary review before any merge decision.
- Historical stacked Phase 7C PRs remain audit trail only and must not be merged
  independently while PR #18 is the integration path.

## Next after Phase 7C integration

- **Topology/reference robustness — deepen persistent geometry-reference (`gref`)
  guarantees across edit, rebuild, inspection, and export paths.** This is the next
  core CAD reliability priority because stable references directly affect agent
  correctness and downstream assembly/edit workflows.
- Add regression fixtures that intentionally mutate geometry/topology and prove
  public selectors either retain identity or fail with structured, recoverable
  reference errors instead of silently drifting.
- Keep Phase 7D MCP skill discovery deferred. The current v4 A/B evidence does not
  demonstrate a reliable measurable skill benefit, and the forensic review does not
  justify more paid reruns or another skill rewrite simply to improve the recorded
  result.

## Later candidates

1. Constraint breadth beyond the rigid subset (screw/gear/path joints)
2. Nested assemblies & assembly-level patterns
3. Structured STEP product hierarchy guarantees
4. Second authoritative-family backend (build123d/CadQuery) as an optional adapter
5. Packaging / dependency hygiene (unused frontend/auth/db packages in package.json)

A second backend remains intentionally later: backend neutrality is already closed,
and Battenmark should improve the reliability of its current authoritative path before
adding another production geometry family.
