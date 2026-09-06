# Real-world proof: corrected two-piece Orange Pi 4 Pro enclosure

**Date:** 2026-09-06  
**Project:** `opi4pro-enclosure`  
**Document:** `doc_pwjq1a`  
**Execution policy:** Battenmark only; direct FreeCAD bypass did not count  
**FreeCAD:** 1.1.3 / OpenCascade  
**Final decision:** **PASS**

This benchmark began as a 50-revision Claude → Battenmark MCP →
FreeCAD/OpenCascade enclosure workflow and was initially classified
**PARTIAL / CAD_CORRECTION_REQUIRED**. A later ChatGPT Work correction/audit
reopened the live Battenmark project, corrected the lid rim and ventilation,
performed fresh exports, independently parsed the 3MF, and proved persistence
through a fresh stdio MCP process.

The final corrected benchmark passes geometry, specification fidelity, export
fidelity and persistence checks.

## Revision and checkpoint record

The requested historical revision `rev_2jbr5m` remained available, but the live
project had advanced before the final correction audit began.

Final correction/audit identifiers:

- starting observed revision: `rev_oqca4f`;
- final export revision: `rev_v9zehv`;
- saved final checkpoint: `rev_np7x39`, label `final-through-vent-correction`;
- current post-preview revision: `rev_ywe0nq`;
- Battenmark-reported revision index: `51`.

The numeric revision index did not advance reliably during this sequence, so the
revision IDs above are the authoritative identifiers for the final evidence.

## Battenmark operations used

The final correction/audit used Battenmark operations including:

- `project_open`;
- `inspect_document`;
- `inspect_body`;
- `inspect_feature`;
- `query_geometry`;
- `save_revision`;
- `set_feature_param`;
- `delete_feature`;
- `pocket`;
- `rebuild`;
- `validate`;
- `export_fcstd`;
- `export_step`;
- `export_stl`;
- `export_3mf`;
- `render_preview`.

No Battenmark source, dependency, project setting or unrelated repository file
was changed to obtain the result.

`DIRECT FREECAD USED: NO`

## Correction history

### 1. Solid lid plug → hollow perimeter friction rim

The existing lid already contained the correct inner-rim sketch geometry. The
4 mm hollowing pocket was recovered/used to produce:

- outer rim: **90.6 × 57.6 mm**;
- inner opening: **85.8 × 52.8 mm**;
- wall thickness: **2.4 mm**;
- rim elevation: **z=2 → z=6 mm**;
- inner boundaries: `x=5.1→90.9`, `y=5.1→57.9 mm`.

The former full-area solid plug is absent in the final model.

### 2. Blind vents → true through-vents

An attempted edit of the existing vent pocket exposed a Battenmark worker
synchronization defect: the feature metadata changed from a 3 mm depth to 6 mm,
but exported geometry still retained portions of the old `z=3` slot floors at
the rim.

Recovery remained entirely inside Battenmark:

1. save checkpoint `rev_ghp0vc`;
2. delete only the stale `Vent_Slots` pocket;
3. reuse the existing six-profile vent sketch;
4. create a new `Vent_ThroughSlots` pocket with **6 mm** depth after the hollow-rim feature;
5. rebuild, validate and export again.

A duplicate-name attempt for `Plug_Hollow` failed safely because that feature
already existed. No geometry was lost.

The final face map contains **no z=3 vent-floor faces**. Horizontal interior
faces between the slots terminate at `z=2`, proving that the slots pass through
the 2 mm cap and through the 4 mm rim wherever they intersect it.

Final vent state:

- slot count: **6**;
- nominal slot size: **2.4 × 55 mm**;
- solid plug: **absent**;
- blind floors: **absent**;
- airflow path from exterior to enclosure interior: **present**.

## Final body audit

| Property | Base | Lid |
| --- | ---: | ---: |
| Battenmark body | `bdy_z0pbcx` | `bdy_0wyeqw` |
| Shape | Solid | Solid |
| Solid count | 1 | 1 |
| Bounding box | 96 × 63 × 22 mm | 96 × 63 × 6 mm |
| Features | 10 | 7 |
| OpenCascade faces | 30 | 58 |
| Exported triangles | 604 | 260 |
| Mesh edges | 906 | 390 |
| Boundary mesh edges | 0 | 0 |
| Non-manifold mesh edges | 0 | 0 |
| Watertight mesh | Yes | Yes |

Five intermediate bodies remain hidden, consumed, empty and absent from the
exported 3MF. Base mounts, openings, standoffs, outer envelope and fillet were
preserved.

## Corrected lid analytical proof

### Cap

```text
96 × 63 × 2 = 12,096.00 mm³
```

### Hollow rim before vent intersections

```text
(90.6 × 57.6 − 85.8 × 52.8) × 4 = 2,753.28 mm³
```

### Vent removal

- six cap slot cuts: **1,584.00 mm³**;
- six rim intersections: **126.72 mm³**.

### Expected corrected lid volume

```text
12,096.00 + 2,753.28 − 1,584.00 − 126.72
= 13,138.56 mm³
```

Independent final 3MF lid volume:

```text
13,138.559999999954 mm³
```

The difference from the analytical design is effectively zero (below
`0.000000001%`).

## Topology and measurement interpretation

Document-level Battenmark inspection continues to emit generic non-manifold
warnings for the Boolean-heavy bodies. The benchmark does not treat those raw
B-rep volume numbers as authoritative when such warnings are present.

The final export/mesh evidence is clean:

- both exported objects are closed two-manifolds;
- boundary edges: **0** on both;
- non-manifold mesh edges: **0** on both;
- export-time issues: **none**.

Fresh export pipeline result:

- shape type: Compound;
- solids: **2**;
- Battenmark export volume: **41,281.356 mm³**.

Independent 3MF parsing:

- base mesh volume: **28,142.686683 mm³**;
- lid mesh volume: **13,138.560000 mm³**;
- combined mesh volume: **41,281.246683 mm³**;
- difference from Battenmark export result: **0.109317 mm³**;
- percentage difference: **0.000265%**.

This is accepted as negligible tessellation/floating-point difference.

## 3MF forensic audit

The final fresh 3MF contains:

- units: millimeters;
- object count: **2**;
- build item count: **2**;
- object 1: base, **604 triangles**;
- object 2: lid, **260 triangles**;
- both build transforms: identity;
- boundary edges: **0 / 0**;
- non-manifold mesh edges: **0 / 0**;
- unexpected/stale objects: **none**;
- phantom geometry: **none**.

The objects are unnamed internally, but the distinct `96 × 63 × 22 mm` and
`96 × 63 × 6 mm` bounding boxes identify them unambiguously.

## Fresh final exports

All four final manufacturing/interchange files were created by Battenmark at
`rev_v9zehv` on 2026-09-06:

| Format | Artifact | UTC timestamp |
| --- | --- | --- |
| FCStd | `art_j0bf8q` | 22:52:32.079 |
| STEP | `art_z3u8m3` | 22:52:32.397 |
| STL | `art_rfh76b` | 22:52:32.708 |
| 3MF | `art_lunx7x` | 22:52:33.019 |

The files were generated in the Work execution environment and are not embedded
in this repository by this documentation commit.

## Persistence / reopen proof

A completely new stdio MCP client process launched the canonical Battenmark
server, discovered all **75 tools**, reopened `opi4pro-enclosure`, recovered
revision `rev_v9zehv`, and found the same two visible solids and validation
state.

Claude Desktop was also observed running Battenmark through the canonical local
MCP entry point. The unrelated direct `freecad` MCP was not used as benchmark
evidence or as a substitute for Battenmark.

## Print orientation

### Base

- rotate **180° about X or Y**;
- closed floor on build plate;
- open rim upward.

### Lid

- print **cap-down**.

### Supports

Supports are not expected for either piece under normal FDM bridging settings.
The base port bridges should still be inspected in the slicer for the selected
material, layer height and bridging profile.

## Known implementation issue exposed by the pass

The final benchmark passes, but it exposed a real Battenmark implementation
issue worth tracking independently:

> Editing an existing pocket's depth can update Battenmark metadata without
> reliably rebuilding the corresponding worker geometry. Replacing the stale
> pocket through Battenmark produced the correct persisted/exported result.

This is a platform regression candidate. It does **not** invalidate the final
benchmark because the defect was detected, recovered through Battenmark only,
and the resulting geometry was independently re-audited.

## Final classification

| Area | Result |
| --- | --- |
| Claude → Battenmark interoperability | **PASS** |
| Battenmark-only execution | **PASS** |
| Authoritative rebuild | **PASS** |
| Base specification fidelity | **PASS** |
| Lid rim specification fidelity | **PASS** |
| Vent specification fidelity | **PASS** |
| Exported topology quality | **PASS** |
| 3MF export fidelity | **PASS** |
| Persistence / reopen | **PASS** |
| Direct FreeCAD bypass avoided | **PASS** |
| **Overall benchmark** | **PASS** |

## Public claim allowed by this result

A defensible public statement is:

> Battenmark completed a full two-piece Orange Pi 4 Pro enclosure workflow
> through FreeCAD/OpenCascade, including iterative correction, authoritative
> rebuild/inspection, specification-fidelity checks, watertight two-object 3MF
> export, FCStd/STEP/STL output and persistence/reopen. The final corrected lid
> uses a 2.4 mm hollow friction rim and six true through-vents, and its exported
> mesh volume matches the analytical design essentially exactly. Direct FreeCAD
> bypass was not used.

The earlier PARTIAL result remains valuable historical evidence, but it is
superseded as the current final benchmark classification by this corrected
**PASS**.
