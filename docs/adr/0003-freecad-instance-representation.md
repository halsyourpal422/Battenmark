# ADR 0003 — FreeCAD instance representation

Status: accepted (Phase 6.1)

## Decision
Authoritative assemblies prefer **App::Link** instances referencing one
`Part::Feature` per component definition inside a hidden `Definitions`
App::Part group; transforms ride Link.Placement. A per-build capability probe
degrades to shape-copies when links are unavailable or fail, without public
API change. Chosen after evaluation showed correct volumes/transforms across
rebuilds on FreeCAD 1.1.3 with 100 shared instances rebuilding in ~59 ms;
Linux 1.0.2 coverage runs in CI (link support exists since 0.19). Public IR
never exposes the representation.
