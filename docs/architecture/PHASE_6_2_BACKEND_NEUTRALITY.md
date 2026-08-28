# Phase 6.2 — Backend-neutrality closeout

**Status:** Closeout on Phase 7C baseline  
**Starting SHA:** `fa0b782014bbe2882be1462dac358967b9790f3a`  
**Scope:** architecture + tests + documentation. Not a second production CAD engine.

## Objective

Prove the public contract, service/domain layer, capability discovery, and
registry are backend-neutral so a future adapter can register without leaking
worker details into callers.

This phase does **not** ship build123d/CadQuery as a supported production backend.

## What already existed on Phase 7C

- Open `BackendId` (`string`, registry-validated)
- `BackendRegistry` with duplicate-ID and exclusive-role conflicts
- Capability reports derived from registration
- Production roles: FreeCAD authoritative, JSCAD preview
- Test-only `mockcad` pluggability
- Structured `BACKEND_UNSUPPORTED` / `BACKEND_NOT_FOUND` / role conflicts

## Evaluator vs backend ID

| Concept | Type | Meaning |
|---------|------|---------|
| `BackendId` | open string | Registry identity for any adapter |
| `KernelId` | `"jscad" \\` `"freecad"` | In-tree evaluator adapters only |

`KernelId` remains closed because only two evaluators exist in this tree.

## Public contract

Callers use catalog names from `TOOL_NAMES` (live length is derived, not
hard-coded).

## Intentionally excluded

- `recovery/phase-6.2-build123d-wip` (`c329631`) — experimental only
- `recovery/phase-7c2-eval-provider` (`21482a4`) — lands after this closeout

## Commands

```bash
npm run test:neutrality
npm run test:backend-registry
npm run test:conformance
```
