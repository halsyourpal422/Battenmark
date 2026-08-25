# FreeCAD / Backend Diagnostics

## Purpose
Diagnose backend/FreeCAD worker failures using **only** public Battenmark status, capability, and structured-error surfaces. Never bypass the typed service layer.

## Use when
- Public operation returns backend-related structured error.
- Need `kernel_status` or `inspect_backend_capabilities`.

## Do not use when
- Ordinary geometry/selector/constraint errors (use modelling skills).
- Tempted to run FreeCAD Python or edit worker internals — forbidden.

## Preconditions
- **REQUIRED**: Operating through a public Battenmark client; stay inside the public contract.

## Planning rules
1. Structured error is primary evidence.
2. Establish backend presence, roles, capabilities.
3. Smallest recovery: retry → capability-aware alternative → supported restart → re-verify.
4. Never call private FreeCAD modules or shell.

## Recommended operation sequence
1. **REQUIRED** — Record failing operation + full structured error.
2. **REQUIRED** — `kernel_status` → `inspect_backend_capabilities`.
3. **REQUIRED** — Recover (retry / alternative / supported restart only).
4. **REQUIRED** — Re-run minimal public verification.

## Geometry / mechanical rules
Not applicable.

## Verification gates
Status/capability called; recovery used only public operations; post-recovery public call succeeds or clear capability-backed unavailability explanation; no private FreeCAD/shell used.

## Failure recovery
This skill **is** the recovery procedure. If public recovery fails, report status + error to user/operator. Do not patch the worker or invoke FreeCADCmd from the agent.

## Outputs
Captured error, capability/kernel snapshots, recovery steps, post-recovery verification result.

## Platform notes
FreeCAD is Tier-1 authoritative backend; JSCAD is preview only. Capability flags tell the truth. Discovery/install helpers are operator actions, not agent actions.

## Examples
export_step timeout → kernel_status → inspect_backend_capabilities → supported restart if available → retry trivial op → retry export. Never "run FreeCADCmd yourself".
