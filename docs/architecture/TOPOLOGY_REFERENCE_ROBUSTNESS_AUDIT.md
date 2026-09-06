# Topology Reference Robustness Audit

**Date**: 2026-09-06
**Scope**: Persistent geometry references (`gref`) lifecycle — creation, storage, resolution, invalidation
**Status**: Audit complete; findings below

## Executive Summary

The `gref` system provides **partial persistence** for geometry references. It works well for simple cases but has a fundamental fragility: `semantic_id` values are **positional** (e.g., `gref_face_001` = first face), not **identity-based**. After topology mutations, the mapping between positional indices and physical geometry changes, causing silent reference drift or explicit `GEOMETRY_REFERENCE_LOST` errors.

The FreeCAD backend includes a **fingerprint-based fallback** that mitigates this for stored `GeometryRef` entries, but the JSCAD envelope path and the assembly solver lack this fallback.

## Architecture Overview

### gref Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CREATION                                                      │
│    query_geometry → enumerate_faces/edges → semantic_id          │
│    Result: { semantic_id: "gref_face_001", fingerprint: {...} }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. STORAGE                                                       │
│    Caller stores semantic_id for later use                       │
│    Optional: CadDocument.geometryRefs[] for fingerprint fallback │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RESOLUTION                                                    │
│    Selector: { gref: "gref_face_001" }                          │
│    FreeCAD: semantic_id match → fingerprint fallback → error     │
│    JSCAD: semantic_id match → error (no fallback)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. INVALIDATION                                                  │
│    Topology mutation (fillet, boolean, etc.)                     │
│    Face/edge ordering changes → semantic_id no longer matches    │
│    Result: GEOMETRY_REFERENCE_LOST or silent drift               │
└─────────────────────────────────────────────────────────────────┘
```

### Code Locations

| Layer | File | Key Lines |
|-------|------|-----------|
| Type definitions | `src/cad/types.ts` | 94-101 (`GeometryRef`), 59 (`gref` field), 293 (`geometryRefs[]`) |
| Schema exposure | `src/cad/schema.ts` | 64 (`gref` in geometrySelector) |
| Selector normalization | `src/cad/selectors.ts` | 85 (preserves gref), 406-414 (gref resolution) |
| Envelope query | `src/cad/selectors.ts` | 185 (`gref_face_XXX`), 247 (`gref_edge_XXX`) |
| FreeCAD worker | `freecad-worker/selectors.py` | 110 (`gref_face_XXX`), 212 (`gref_edge_XXX`), 382-414 (fingerprint fallback) |
| Assembly solver | `src/cad/assembly/solver.ts` | 412-427 (gref in assembly refs) |
| Document snapshot | `src/cad/operations.ts` | 138, 156 (geometryRefs in revisions) |
| Capability flag | `src/cad/backend/capabilities.ts` | 34, 163 (`geometry.persistent_gref`) |

## Findings

### Finding 1: Positional `semantic_id` is Fragile

**Severity**: HIGH
**Location**: `selectors.ts:185,247`, `freecad-worker/selectors.py:110,212`

Both the JSCAD envelope and FreeCAD backend assign `semantic_id` based on **enumeration order**:

```typescript
// JSCAD envelope (selectors.ts:185)
semantic_id: `gref_face_${String(i + 1).padStart(3, "0")}`,

// FreeCAD worker (selectors.py:110)
"semantic_id": f"gref_face_{i:03d}",
```

After a topology mutation (fillet, boolean, pocket), the face/edge count and ordering change. Face #1 before a fillet may not be face #1 after. This means:

- `gref_face_001` before fillet ≠ `gref_face_001` after fillet
- No identity is preserved across mutations

**Impact**: Any gref stored before a mutation may silently point to a different face after the mutation, or fail with `GEOMETRY_REFERENCE_LOST`.

### Finding 2: FreeCAD Fallback Mitigates but Doesn't Eliminate Risk

**Severity**: MEDIUM
**Location**: `freecad-worker/selectors.py:382-414`

The FreeCAD backend has a sophisticated fallback:

```python
if sel.get("gref"):
    pool = faces + edges
    stored = None
    if grefs:
        stored = next((g for g in grefs if g.get("id") == sel["gref"]), None)
    hit = next((m for m in pool if m.get("semantic_id") == sel["gref"]), None)
    if hit is None and stored and stored.get("fingerprint"):
        # Fingerprint-based re-resolution
        fp = stored["fingerprint"]
        candidates = [m for m in pool if m.get("entity") == stored.get("entity")]
        scored = []
        for m in candidates:
            mf = m.get("fingerprint") or {}
            score = 0
            for k, v in fp.items():
                if mf.get(k) == v:
                    score += 1
            scored.append((score, m))
        scored.sort(key=lambda t: t[0], reverse=True)
        if not scored or scored[0][0] == 0:
            raise SelectorError("GEOMETRY_REFERENCE_LOST", ...)
        if len(scored) > 1 and scored[0][0] == scored[1][0]:
            raise SelectorError("GEOMETRY_REFERENCE_AMBIGUOUS", ...)
        hit = scored[0][1]
        hit["confidence"] = "strong"
```

This fallback:
1. Tries direct `semantic_id` match first
2. If not found, looks up stored `GeometryRef` by `id`
3. Uses fingerprint matching (surface_type, role, area, normal, centroid) to re-resolve
4. If ambiguous, throws `GEOMETRY_REFERENCE_AMBIGUOUS`

**Limitations**:
- Requires `CadDocument.geometryRefs[]` to be populated (not automatic)
- Fingerprint matching is heuristic, not guaranteed
- After major topology changes (boolean subtract), fingerprints may not match

### Finding 3: JSCAD Envelope Has No Fallback

**Severity**: MEDIUM
**Location**: `src/cad/selectors.ts:406-414`

The JSCAD envelope path has a simpler gref resolution:

```typescript
if (sel.gref) {
  const hit = [...faces, ...edges].find((m) => m.semantic_id === sel.gref);
  if (!hit) {
    throw cadError("GEOMETRY_REFERENCE_LOST", `Geometry reference '${sel.gref}' is no longer present.`, {
      gref: sel.gref,
    });
  }
  matches = [hit];
}
```

No fingerprint fallback. If `semantic_id` doesn't match, immediate `GEOMETRY_REFERENCE_LOST`.

### Finding 4: Assembly Solver Uses Envelope Path

**Severity**: MEDIUM
**Location**: `src/cad/assembly/solver.ts:412-427,438`

The assembly solver resolves face references through `queryEnvelopeGeometry`:

```typescript
// Semantic selector (string kind, structured object, or gref): one canonical
// path through queryEnvelopeGeometry, which owns gref/nearest/unique rules.
const sel = normalizeSelector(faceSpec as never, "face", "planar");
const res = queryEnvelopeGeometry(envelopeOf(body), sel, vars);
matches.push(...res.matches);
```

This means assembly constraints use the JSCAD envelope path, which lacks the FreeCAD fingerprint fallback. After topology mutations, assembly face references may fail.

### Finding 5: `geometryRefs[]` is Not Automatically Populated

**Severity**: HIGH
**Location**: `src/cad/document.ts:23`, `src/cad/kernel/freecad.server.ts:230,249`

The `CadDocument.geometryRefs` array is initialized empty:

```typescript
// document.ts:23
geometryRefs: [],
```

And passed to the FreeCAD worker:

```typescript
// freecad.server.ts:249
grefs: doc.geometryRefs ?? [],
```

But there is **no code that automatically populates this array** when `query_geometry` is called. The fingerprint fallback in the FreeCAD worker depends on this array being populated, but it's never written to.

**Impact**: The fingerprint fallback is effectively dead code unless the caller manually maintains `geometryRefs[]`.

### Finding 6: Revision Snapshots Preserve grefs

**Severity**: LOW (positive)
**Location**: `src/cad/operations.ts:138,156`

The `checkpoint()` function includes `geometryRefs` in revision snapshots:

```typescript
snapshot: JSON.stringify({
  name: doc.name,
  parameters: doc.parameters,
  bodies: doc.bodies,
  features: doc.features,
  geometryRefs: doc.geometryRefs ?? [],
}),
```

And `restore()` recovers them:

```typescript
doc.geometryRefs = snap.geometryRefs ?? [];
```

This means grefs survive rollback, but only if they were populated in the first place.

### Finding 7: Error Codes Are Well-Defined

**Severity**: LOW (positive)
**Location**: `src/cad/types.ts:441-443`

The system defines clear error codes:

```typescript
GEOMETRY_REFERENCE_LOST    // Reference no longer exists
GEOMETRY_REFERENCE_AMBIGUOUS  // Reference matches multiple candidates
```

These are thrown consistently across both JSCAD and FreeCAD paths.

### Finding 8: Capability Flag Exists

**Severity**: LOW (positive)
**Location**: `src/cad/backend/capabilities.ts:34,163`

The system reports `geometry.persistent_gref: true` as a capability:

```typescript
"geometry.persistent_gref": true,
```

This signals to callers that gref persistence is supported, but the implementation has gaps.

## Test Coverage

### Existing Tests

| Test | File | What It Covers |
|------|------|----------------|
| `gref-lost` | `run-selector-tests.ts:137` | Lost gref throws `GEOMETRY_REFERENCE_LOST` |
| `tool-lost` | `run-selector-tests.ts:166` | Lost gref via query_geometry operation |
| `P-gref-valid` | `run-assembly-tests.ts:342` | Gref resolves through assembly constraint |
| `Q-gref-lost` | `run-assembly-tests.ts:361` | Missing gref fails in assembly |
| `lost-ref` | `run-semantic-enclosure-tests.ts:143` | Lost gref in fillet operation |
| `gref` | `conformance.ts:142` | Stable/lost/ambiguous gref in conformance suite |

### Test Gaps

1. **No mutation-then-resolve tests**: No test creates a gref, mutates topology, then tries to resolve the gref
2. **No fingerprint fallback tests**: The FreeCAD fingerprint fallback is untested
3. **No `geometryRefs[]` population tests**: No test verifies that `geometryRefs` is populated after `query_geometry`
4. **No assembly-after-mutation tests**: No test creates an assembly constraint, mutates a component, then verifies the constraint still resolves

## Recommendations

### Immediate (Task 7: Root Fix)

1. **Populate `geometryRefs[]` automatically**: After `query_geometry` returns matches, store the `GeometryRef` entries in `CadDocument.geometryRefs[]`. This enables the FreeCAD fingerprint fallback.

2. **Add mutation-then-resolve tests**: Create tests that:
   - Query geometry to get a gref
   - Mutate topology (fillet, boolean, pocket)
   - Try to resolve the gref
   - Verify either successful re-resolution or explicit `GEOMETRY_REFERENCE_LOST`

3. **Add fingerprint fallback tests**: Test the FreeCAD fallback path with:
   - Gref that survives mutation (fingerprint matches)
   - Gref that fails after mutation (fingerprint doesn't match)
   - Gref that is ambiguous after mutation (multiple fingerprint matches)

### Medium-Term (Tasks 5-6)

4. **Mutation test matrix**: Create a matrix of 16 mutation families × gref resolution paths to systematically test all combinations.

5. **Public-path regressions**: Add tests that exercise the same path external agents use (MCP/HTTP/Python) to ensure gref behavior is consistent.

### Long-Term

6. **Consider identity-based grefs**: The current positional `semantic_id` system is inherently fragile. A more robust approach would use **content-based identifiers** (e.g., hash of surface_type + area + centroid) that survive topology changes.

7. **Document the contract**: Update `docs/CONTRACT.md` to explicitly describe gref behavior, limitations, and the fingerprint fallback.

## Conclusion

The `gref` system provides a foundation for persistent geometry references, but has critical gaps:

- **Positional `semantic_id`** is fragile across mutations
- **Fingerprint fallback** exists but is effectively dead (never populated)
- **JSCAD envelope path** has no fallback
- **Assembly solver** uses the envelope path, not FreeCAD

The immediate priority is to populate `geometryRefs[]` and add mutation-then-resolve tests. This will activate the existing fingerprint fallback and provide a safety net for common topology changes.
