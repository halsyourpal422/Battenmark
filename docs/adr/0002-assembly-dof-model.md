# ADR 0002 — Assembly DOF accounting model

Status: accepted (Phase 6.1)

## Decision
Per moving instance, collect first-order constraint rows in the solved world
frame: `[Tx,Ty,Tz,Rx,Ry,Rz]`. Each supported relationship contributes specific
rows (mate: normal-T + two ⊥R; align/concentric/parallel: two ⊥R (+2⊥T for
concentric); distance: normal-T; angle/perpendicular: one R along the effective
rotation axis; fixed: all six). Remaining freedom = 6 − Gaussian rank.
Free-axis labels are reported when the basis is axis-aligned.

## Scope
Level-1 relative-to-anchor accounting at the solved configuration. Exact for
axis-aligned fixtures; an honest linearization otherwise. Multi-body
closed-loop symbolic rank is deferred. `constraint_state` distinguishes
fully_constrained / underconstrained / conflicted / unsolved — "applied"
never implies "fully constrained".
