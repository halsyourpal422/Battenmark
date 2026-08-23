# Changelog

Public product name: **Battenmark**. Internal engineering identifier `cad-service`
and the historical `AgentCad*` compatibility prefixes remain in code and protocols.
Schema versions are independent of package versions.

## 0.1.0-alpha.1 — Battenmark public alpha (2026-08-22)

First public release. Ships the Phase 5.5.1 verified universal CAD foundation:

- Typed backend-neutral CAD operations over MCP / HTTP / CLI / Python transports.
- FreeCAD/OpenCascade authoritative B-rep backend; JSCAD preview backend.
- Dynamic backend registry with role-derived selection and capability discovery;
  test-only `mockcad` proves third-backend pluggability.
- Parametric expressions with dependency evaluation; semantic face/edge selectors;
  persistent geometry references with explicit `GEOMETRY_REFERENCE_LOST` /
  `GEOMETRY_REFERENCE_AMBIGUOUS` errors.
- Through/blind/counterbore/countersink holes; fillets; chamfers; linear and
  rectangular patterns; STEP/FCStd/STL interchange; four-view PNG previews.
- Platforms: macOS Apple Silicon Tier 1 (**hardware verified**: arm64,
  macOS 26.6.2, FreeCAD 1.1.3 — full E2E + regression battery green); Linux x86_64
  headless validated; Windows unverified.
- Hardware-validation fixes: worker kill→respawn registration race; FreeCAD 1.1
  LinearPattern `Mode` enum compatibility; transport-test runner lifecycle cleanup.

The internal engineering version (`CAD_SERVICE_VERSION = "0.5.6"`) is retained by
design; see docs/VERSIONING.md.

## Unreleased — Phase 6.1 (constraint hardening)

- `set_parallel` / `set_perpendicular` constraints (minimal deterministic rotation; translation preserved).
- Rank-based rigid-body DOF diagnostics: per-instance remaining freedoms with axis labels,
  `constraint_state` (fully_constrained / underconstrained / conflicted / unsolved),
  per-constraint `removed_dof` and post-solve residuals.
- Authoritative `check_interference`: OCC B-rep `common()` volumes, AABB broad-phase,
  contact-vs-penetration semantics, pair limits.
- Instance efficiency: App::Link-based definition sharing with automatic shape-copy fallback
  (representation is a backend detail; public IR unchanged).

## Unreleased — Phase 6 (assemblies)

Backend-neutral assemblies on the frozen foundation:

- `create_assembly`, `define_component`, `create_instance`, `fix_instance`,
  `set_instance_transform`, `set_definition_parameter`, `mate_faces`,
  `align_axes` (+`concentric`), `set_distance`, `set_angle`,
  `remove_constraint`, `inspect_assembly`.
- Deterministic rigid resolver with honest state reporting
  (`applied/redundant/deferred`, remaining-DOF, world bbox).
- Authoritative FreeCAD output: `App::Part` hierarchy, per-instance placements,
  volumes preserved; FCStd + STEP export.
- Assembly preview rendering at solved transforms.
- Imported component definitions (STEP/FCStd) build authoritatively via the
  existing secured importer; non-parametric by contract. Axis refs accept
  coordinate axes or feature/body names (structured axis objects unsupported).
- Schema stays 2 (additive `assemblies[]`); new error codes
  (`ASSEMBLY_*`, `CONSTRAINT_*`); granular `assembly.*` capabilities.

## 0.5.6 — Phase 5.5.1

Backend registry, open backend IDs, dynamic roles, synthetic `mockcad` pluggability proof, foundation freeze.

- `BackendId` is no longer `"freecad" | "jscad"`.
- Capability reports derive `roles.authoritative` / `roles.preview` from registration.
- Test-only `mockcad` registers without touching the public operation schema.
- Errors: `BACKEND_NOT_FOUND`, `BACKEND_ROLE_CONFLICT`, `BACKEND_REGISTRATION_CONFLICT`.
- Apple Silicon proof runner exists; it SKIPs on non-darwin/arm64 hosts.

## 0.5.5 — Phase 5.5

Architecture cleanup, backend capability contracts, open-source foundations.

- Canonical schema version **2** (single source: `src/cad/version.ts`). MCP server version **5.0.0**.
- HTTP no longer leaks `agentcad_schema_version: 1`. Unknown versions return `SCHEMA_MISMATCH`.
- `inspect_backend_capabilities` / `GET /api/v1/capabilities`.
- FreeCAD is the first authoritative backend; JSCAD remains preview.
- Circular patterns fail with `BACKEND_UNSUPPORTED` (`pattern.circular=false`).
- macOS Apple Silicon discovery for FreeCAD.app bundles; Homebrew optional.
- Package identity `cad-service@0.5.5` (replaces builder-workspace metadata).
- Apache-2.0 for the service; FreeCAD/OCC remain LGPL runtime dependencies.

## 0.5.0 — Phase 5

Semantic parametric CAD: expressions, selectors, persistent `gref`, PartDesign holes/patterns where eligible, enclosure wall 2.4 → 3.0.

## 0.4.0 — Phase 4

Rendered PNG previews, STEP/FCStd import, artifact handles.

## 0.3.0 — Phase 3

MCP / HTTP / CLI / Python transports on one `AgentCadService`. Persistence, revisions, idempotency.

## 0.2.0 — Phase 2

Headless FreeCAD/OpenCascade worker. Authoritative B-rep. JSCAD preview split.
