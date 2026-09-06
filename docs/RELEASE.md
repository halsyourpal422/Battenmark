# Release checklist

Battenmark is public pre-1.0 software. Use this checklist for a deliberate release candidate; do not publish a tag merely because `main` is green.

## Candidate identity

1. Freeze and record the exact post-merge `main` SHA that is being qualified.
2. If any source or documentation change lands after the SHA is frozen, create a new candidate SHA and rerun the exact-SHA gates.
3. Record the candidate SHA in the release notes and demo evidence.

## Automated verification

4. Run the full credential-free CI matrix on the exact candidate SHA.
5. Require typecheck, FreeCAD/Linux installation, CAD/holes/patterns/enclosure/parity, FreeCAD worker Python tests, service/persistence/HTTP/CLI/MCP/transport parity, schema/discovery/registry/parametric/selectors/conformance, evaluation integrity, and gref mutation/public-path regressions to pass.
6. Do not use paid/provider-dependent evaluation calls as a release gate.

## Supported-platform proof

7. Re-run the README Quickstart from a clean supported macOS Apple Silicon environment before a public release that claims Tier 1 macOS support.
8. Verify FreeCAD discovery against the documented macOS `FreeCAD.app` paths without relying on an undisclosed developer-only override.
9. Linux x86_64 may be described as headless/development validated when the documented AppImage/CI path passes.
10. Windows and macOS Intel remain unsupported/unverified until explicitly tested and documented.

## Capability and dogfood proof

11. Keep capability claims aligned with `README.md`, `docs/LIMITATIONS.md`, and backend capability discovery.
12. Current assembly claims are limited to the documented rigid subset; do not imply nested assemblies, assembly patterns, advanced joint families, or motion simulation.
13. Circular patterns and helical solid threads remain unsupported.
14. JSCAD is preview/envelope support; FreeCAD/OpenCascade is authoritative for B-rep geometry claims.
15. Run at least one practical end-to-end Battenmark dogfood task through the public operation surface and preserve the exact prompt, trace, candidate SHA, validation result, previews, and CAD exports.

## Repository hygiene and legal

16. Scan the candidate tree for live tokens, cookies, private keys, personal filesystem paths, `.env` files, generated caches, `.FCBak` files, temporary evaluation artifacts, and machine-specific files.
17. Confirm `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are present and consistent with the release.
18. Battenmark repository code is Apache-2.0; FreeCAD/OpenCascade licensing and the separate-process boundary are documented in NOTICE/third-party notices.
19. Do not publish npm/PyPI packages unless a separate packaging decision explicitly approves that release channel.

## Launch-facing material

20. `CHANGELOG.md` and release notes must accurately describe the candidate without implying unsupported features.
21. README quickstart, limitations, branding, demo links, and public screenshots must match the exact release candidate.
22. Evaluation messaging must describe the Phase 7C evidence as engineering/evaluation evidence, not broad model-superiority proof.
23. Public assets should use Battenmark branding. Historical `AgentCAD` identifiers remain only where required for compatibility.

## Final decision

Release only when the exact candidate SHA is green, clean-Mac qualification passes, repository hygiene/legal checks pass, and the practical dogfood/demo evidence is captured. Any release-blocking fix creates a new candidate and restarts the relevant qualification gates.
