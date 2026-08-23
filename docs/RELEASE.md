# Release checklist

Do **not** publish until a public name is chosen. This file is the dry run.

1. Version constants in `src/cad/version.ts` match `package.json`.
2. `CHANGELOG.md` has the release notes.
3. `npm run typecheck` and the geometry/service suites pass.
4. Capability table is honest (no circular / assembly / helical / Windows claims).
5. Secret scan: no live tokens, cookies, or personal paths.
6. License: Apache-2.0 for the service; NOTICE records FreeCAD/OCC LGPL.
7. macOS Apple Silicon proof filled in `docs/MACOS.md` if claiming Tier 1 verified.
8. Git history is a clean initial public history (this tree currently has **no git repo**).
9. Do not push to an unrelated `AgentCAD` repository.
10. npm/PyPI publish is **out of scope** until naming is approved.
