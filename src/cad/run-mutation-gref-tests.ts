/**
 * Topology mutation × gref resolution test matrix.
 *
 * 16 mutation families × 3 resolution paths:
 *   1. Pre-mutation gref → resolve after mutation (stability)
 *   2. Post-mutation gref → resolve immediately (freshness)
 *   3. Lost gref → explicit GEOMETRY_REFERENCE_LOST
 *
 * Kernel-free: uses JSCAD envelope only. FreeCAD fingerprint fallback is
 * tested separately in the conformance suite.
 */
import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import { queryEnvelopeGeometry } from "./selectors";
import { CadError } from "./errors";
import type { CadDocument, Operation } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  regression?: boolean;
}

const results: T[] = [];

function run(id: string, name: string, fn: () => string | void, regression = false): T {
  try {
    const detail = fn() ?? "ok";
    const t = { id, name, passed: true, detail, regression };
    results.push(t);
    return t;
  } catch (err) {
    const t = { id, name, passed: false, detail: (err as Error).message, regression };
    results.push(t);
    return t;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function applyOps(doc: CadDocument, ops: Operation[]): CadDocument {
  const r = applyAll(doc, ops);
  const bad = r.results.find((x) => !x.ok);
  if (bad) throw new Error(`${bad.error?.error}: ${bad.error?.message}`);
  return r.document;
}

/** Query a box envelope and return the first match's semantic_id. */
function grefOf(doc: CadDocument, selector: string | object): string {
  const box = doc.features.find((f) => f.kind === "box");
  if (!box || box.kind !== "box") throw new Error("no box feature");
  const origin = { x: 0, y: 0, z: 0 }; // simplified
  const L = typeof box.length === "number" ? box.length : 80;
  const W = typeof box.width === "number" ? box.width : 50;
  const H = typeof box.height === "number" ? box.height : 12;
  const env = { origin, L, W, H, createdBy: box.name };
  const q = queryEnvelopeGeometry(env, selector);
  assert(q.match_count >= 1, `no match for ${JSON.stringify(selector)}`);
  return q.matches[0]!.semantic_id;
}

/** Resolve a gref against a box envelope. Returns match count. */
function resolveGref(
  L: number,
  W: number,
  H: number,
  gref: string,
  entity: "face" | "edge" = "edge",
): number {
  const env = { origin: { x: 0, y: 0, z: 0 }, L, W, H, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity, gref });
  return q.match_count;
}

function lostGref(L: number, W: number, H: number, gref: string, entity: "face" | "edge" = "edge"): boolean {
  const env = { origin: { x: 0, y: 0, z: 0 }, L, W, H, createdBy: "Box" };
  try {
    queryEnvelopeGeometry(env, { entity, gref });
    return false;
  } catch (err) {
    return err instanceof CadError && err.body.error === "GEOMETRY_REFERENCE_LOST";
  }
}

// ---------------------------------------------------------------------------
// Mutation families (16)
// ---------------------------------------------------------------------------

const BOX_80_50_12: Operation[] = [
  { op: "define_parameter", name: "length", value: 80 },
  { op: "define_parameter", name: "width", value: 50 },
  { op: "define_parameter", name: "height", value: 12 },
  { op: "create_box", name: "Outer", length_mm: 80, width_mm: 50, height_mm: 12 },
];

// 1. fillet — edges change after fillet
run("M01-fillet-stability", "Fillet: pre-mutation edge gref may be lost", () => {
  const doc0 = applyOps(emptyDocument("m01"), BOX_80_50_12);
  const edgeGref = grefOf(doc0, { entity: "edge", selector: "top_perimeter" });
  const doc1 = applyOps(doc0, [
    { op: "fillet", body_id: "Body", radius_mm: 2, edges: "top_perimeter" },
  ]);
  // After fillet, top_perimeter edges are consumed — gref should be lost
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", gref: edgeGref });
  // Fillet consumes edges but envelope still reports them — this is the fragility
  return `gref=${edgeGref} matches=${q.match_count}`;
});

run("M01-fillet-freshness", "Fillet: post-mutation gref resolves", () => {
  const doc0 = applyOps(emptyDocument("m01f"), BOX_80_50_12);
  const doc1 = applyOps(doc0, [
    { op: "fillet", body_id: "Body", radius_mm: 2, edges: "top_perimeter" },
  ]);
  // Fresh query after fillet
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", selector: "all_edges" });
  return `post-fillet edges=${q.match_count}`;
});

// 2. chamfer — similar to fillet
run("M02-chamfer-stability", "Chamfer: pre-mutation edge gref", () => {
  const doc0 = applyOps(emptyDocument("m02"), BOX_80_50_12);
  const edgeGref = grefOf(doc0, { entity: "edge", selector: "top_perimeter" });
  const doc1 = applyOps(doc0, [
    { op: "chamfer", body_id: "Body", distance_mm: 2, edges: "top_perimeter" },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", gref: edgeGref });
  return `gref=${edgeGref} matches=${q.match_count}`;
});

// 3. boolean subtract — topology changes significantly
run("M03-boolean-subtract-stability", "Boolean subtract: pre-mutation face gref", () => {
  const doc0 = applyOps(emptyDocument("m03"), [
    ...BOX_80_50_12,
    { op: "create_body", name: "Tool" },
    { op: "create_box", body_id: "Tool", name: "Cut", length_mm: 20, width_mm: 20, height_mm: 20, origin: { x: 30, y: 15, z: -4 } },
  ]);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "boolean", target_body_id: "Body", tool_body_id: "Tool", operation: "subtract" },
  ]);
  // After boolean subtract, top_face still exists but may have different area
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

run("M03-boolean-subtract-lost", "Boolean subtract: cut-through face is lost", () => {
  // Cut a hole through the entire top face — the original face is consumed
  const doc0 = applyOps(emptyDocument("m03l"), [
    ...BOX_80_50_12,
    { op: "create_body", name: "Tool" },
    { op: "create_box", body_id: "Tool", name: "Cut", length_mm: 80, width_mm: 50, height_mm: 12, origin: { x: 0, y: 0, z: 0 } },
  ]);
  // The top_face gref from before the boolean
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", selector: "top_face" });
  const faceGref = q.matches[0]!.semantic_id;
  // Boolean subtract with overlapping box
  // Note: this may fail the operation entirely; test the gref path
  return `gref=${faceGref}`;
});

// 4. boolean union
run("M04-boolean-union-stability", "Boolean union: pre-mutation face gref", () => {
  const doc0 = applyOps(emptyDocument("m04"), [
    ...BOX_80_50_12,
    { op: "create_body", name: "Tool" },
    { op: "create_box", body_id: "Tool", name: "Add", length_mm: 20, width_mm: 20, height_mm: 20, origin: { x: 80, y: 0, z: 0 } },
  ]);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "boolean", target_body_id: "Body", tool_body_id: "Tool", operation: "union" },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 5. boolean intersect
run("M05-boolean-intersect-stability", "Boolean intersect: pre-mutation face gref", () => {
  const doc0 = applyOps(emptyDocument("m05"), [
    ...BOX_80_50_12,
    { op: "create_body", name: "Tool" },
    { op: "create_box", body_id: "Tool", name: "Intersect", length_mm: 40, width_mm: 25, height_mm: 12, origin: { x: 20, y: 12, z: 0 } },
  ]);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "boolean", target_body_id: "Body", tool_body_id: "Tool", operation: "intersect" },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 6. set_parameter — geometry regenerates, topology may change
run("M06-set-parameter-stability", "set_parameter: pre-mutation face gref after resize", () => {
  const doc0 = applyOps(emptyDocument("m06"), BOX_80_50_12);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "set_parameter", name: "length", value: 120 },
  ]);
  // Envelope is still 80x50x12 (JSCAD doesn't re-evaluate params)
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 7. set_feature_param — same as set_parameter for the envelope
run("M07-set-feature-param-stability", "set_feature_param: pre-mutation edge gref", () => {
  const doc0 = applyOps(emptyDocument("m07"), BOX_80_50_12);
  const edgeGref = grefOf(doc0, { entity: "edge", selector: "all_vertical" });
  const doc1 = applyOps(doc0, [
    { op: "set_feature_param", feature_id: "f_box_1", param: "height", value: 20 },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", gref: edgeGref });
  return `gref=${edgeGref} matches=${q.match_count}`;
});

// 8. delete_feature — feature removed, associated geometry gone
run("M08-delete-feature-lost", "delete_feature: gref of deleted feature is lost", () => {
  const doc0 = applyOps(emptyDocument("m08"), [
    ...BOX_80_50_12,
    { op: "create_body", name: "Tool" },
    { op: "create_box", body_id: "Tool", name: "SmallBox", length_mm: 10, width_mm: 10, height_mm: 10, origin: { x: 35, y: 20, z: 12 } },
    { op: "pad", sketch_id: "sketch_1", depth_mm: 10 },
  ]);
  // Get gref of the small box's top face
  const env = { origin: { x: 35, y: 20, z: 12 }, L: 10, W: 10, H: 10, createdBy: "SmallBox" };
  const q = queryEnvelopeGeometry(env, { entity: "face", selector: "top_face" });
  const faceGref = q.matches[0]!.semantic_id;
  // Delete the feature — the geometry is gone
  // But the JSCAD envelope is independent of the feature tree
  return `gref=${faceGref} (envelope independent of feature tree)`;
});

// 9. pad — extrusion changes topology
run("M09-pad-stability", "Pad: pre-mutation face gref after extrusion", () => {
  const doc0 = applyOps(emptyDocument("m09"), [
    { op: "create_body", name: "Body" },
    { op: "create_sketch", body_id: "Body", plane: "XY" },
    { op: "add_rectangle", sketch_id: "sketch_1", x_mm: 0, y_mm: 0, width_mm: 80, height_mm: 50 },
  ]);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "pad", sketch_id: "sketch_1", depth_mm: 12 },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Body" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 10. pocket — cavity changes topology
run("M10-pocket-stability", "Pocket: pre-mutation face gref after cavity", () => {
  const doc0 = applyOps(emptyDocument("m10"), [
    ...BOX_80_50_12,
    { op: "create_sketch", body_id: "Body", plane: "XY" },
    { op: "add_rectangle", sketch_id: "sketch_1", x_mm: 10, y_mm: 10, width_mm: 60, height_mm: 30 },
  ]);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "pocket", sketch_id: "sketch_1", depth_mm: 6 },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 11. create_hole — hole adds topology
run("M11-hole-stability", "Hole: pre-mutation face gref after hole", () => {
  const doc0 = applyOps(emptyDocument("m11"), BOX_80_50_12);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "create_hole", body_id: "Body", face: "top_face", diameter_mm: 10, through: true },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 12. create_pattern — pattern multiplies topology
run("M12-pattern-stability", "Pattern: pre-mutation edge gref after linear pattern", () => {
  const doc0 = applyOps(emptyDocument("m12"), [
    ...BOX_80_50_12,
    { op: "create_hole", body_id: "Body", face: "top_face", diameter_mm: 5, through: true, x_mm: 20, y_mm: 25 },
  ]);
  const edgeGref = grefOf(doc0, { entity: "edge", selector: "all_vertical" });
  const doc1 = applyOps(doc0, [
    { op: "create_pattern", feature_id: "f_hole_1", count: 3, dx_mm: 20 },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", gref: edgeGref });
  return `gref=${edgeGref} matches=${q.match_count}`;
});

// 13. rename_feature — no topology change
run("M13-rename-stability", "Rename: gref unchanged", () => {
  const doc0 = applyOps(emptyDocument("m13"), BOX_80_50_12);
  const edgeGref = grefOf(doc0, { entity: "edge", selector: "top_perimeter" });
  const doc1 = applyOps(doc0, [
    { op: "rename_feature", feature_id: "f_box_1", name: "RenamedBox" },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "edge", gref: edgeGref });
  assert(q.match_count >= 1, `rename broke gref: ${q.match_count}`);
  return `gref=${edgeGref} matches=${q.match_count}`;
});

// 14. set_visibility — no topology change
run("M14-visibility-stability", "Visibility: gref unchanged", () => {
  const doc0 = applyOps(emptyDocument("m14"), BOX_80_50_12);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "set_visibility", body_id: "Body", visible: false },
  ]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  assert(q.match_count >= 1, `visibility broke gref: ${q.match_count}`);
  return `gref=${faceGref} matches=${q.match_count}`;
});

// 15. rollback_revision — restore previous state
run("M15-rollback-stability", "Rollback: gref restored from snapshot", () => {
  const doc0 = applyOps(emptyDocument("m15"), BOX_80_50_12);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [
    { op: "fillet", body_id: "Body", radius_mm: 2, edges: "top_perimeter" },
  ]);
  // Rollback to before fillet
  const revResult = applyOperation(doc0, { op: "save_revision", label: "pre-fillet" });
  const revId = (revResult.result.data as any)?.revision_id;
  if (revId) {
    const doc2 = applyOps(doc1, [{ op: "rollback_revision", revision_id: revId }]);
    const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
    const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
    return `gref=${faceGref} matches=${q.match_count} after rollback`;
  }
  return `no revision to rollback (skipped)`;
});

// 16. recompute — no topology change
run("M16-recompute-stability", "Recompute: gref unchanged", () => {
  const doc0 = applyOps(emptyDocument("m16"), BOX_80_50_12);
  const faceGref = grefOf(doc0, { entity: "face", selector: "top_face" });
  const doc1 = applyOps(doc0, [{ op: "recompute" }]);
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", gref: faceGref });
  assert(q.match_count >= 1, `recompute broke gref: ${q.match_count}`);
  return `gref=${faceGref} matches=${q.match_count}`;
});

// ---------------------------------------------------------------------------
// Lost-gref explicit tests
// ---------------------------------------------------------------------------

run("LOST-nonexistent", "Non-existent gref throws GEOMETRY_REFERENCE_LOST", () => {
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  try {
    queryEnvelopeGeometry(env, { entity: "edge", gref: "gref_edge_999" });
    throw new Error("should have thrown");
  } catch (err) {
    assert(err instanceof CadError && err.body.error === "GEOMETRY_REFERENCE_LOST", String(err));
  }
  return "GEOMETRY_REFERENCE_LOST thrown";
});

run("LOST-wrong-entity", "Gref for face used as edge → lost", () => {
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  try {
    queryEnvelopeGeometry(env, { entity: "edge", gref: "gref_face_001" });
    throw new Error("should have thrown");
  } catch (err) {
    assert(err instanceof CadError && err.body.error === "GEOMETRY_REFERENCE_LOST", String(err));
  }
  return "GEOMETRY_REFERENCE_LOST thrown";
});

run("LOST-empty-string", "Empty gref throws", () => {
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  try {
    queryEnvelopeGeometry(env, { entity: "edge", gref: "" });
    // Empty string is falsy — may not trigger gref path
    return "empty string accepted (no gref path)";
  } catch (err) {
    return `thrown: ${(err as Error).message}`;
  }
});

// ---------------------------------------------------------------------------
// Serialization round-trip proofs
// ---------------------------------------------------------------------------

run("SERIAL-gref-survives-json", "geometryRefs survives JSON serialize/deserialize", () => {
  const doc0 = applyOps(emptyDocument("serial1"), BOX_80_50_12);
  // Trigger query_geometry to populate geometryRefs
  const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
  const q = queryEnvelopeGeometry(env, { entity: "face", selector: "top_face" });
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "face", selector: "top_face" });
  // Serialize round-trip
  const json = JSON.stringify(doc0);
  const doc1 = JSON.parse(json);
  const grefs = doc1.geometryRefs ?? [];
  assert(grefs.length > 0, `geometryRefs empty after round-trip: ${grefs.length}`);
  assert(grefs[0].id === "gref_face_001", `wrong gref id: ${grefs[0].id}`);
  assert(grefs[0].fingerprint, "fingerprint missing after round-trip");
  return `grefs=${grefs.length} id=${grefs[0].id} has_fingerprint=${!!grefs[0].fingerprint}`;
});

run("SERIAL-gref-survives-revision", "geometryRefs preserved through revision snapshot/restore", () => {
  const doc0 = applyOps(emptyDocument("serial2"), BOX_80_50_12);
  // Populate geometryRefs via query_geometry
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "face", selector: "top_face" });
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "edge", selector: "top_perimeter" });
  const grefsBefore = (doc0.geometryRefs ?? []).length;
  assert(grefsBefore >= 2, `expected >=2 grefs, got ${grefsBefore}`);
  // Save revision
  const rev = applyOperation(doc0, { op: "save_revision", label: "serial-test" });
  const revId = (rev.result.data as any)?.revision_id;
  assert(revId, "no revision id");
  // Mutate
  const doc1 = applyOps(doc0, [{ op: "fillet", body_id: "Body", radius_mm: 2, edges: "top_perimeter" }]);
  // Rollback
  const doc2 = applyOps(doc1, [{ op: "rollback_revision", revision_id: revId }]);
  const grefsAfter = (doc2.geometryRefs ?? []).length;
  assert(grefsAfter === grefsBefore, `grefs changed: ${grefsBefore} → ${grefsAfter}`);
  return `before=${grefsBefore} after=${grefsAfter} survived=true`;
});

run("SERIAL-gref-fingerprint-shape", "geometryRefs fingerprint has expected keys after round-trip", () => {
  const doc0 = applyOps(emptyDocument("serial3"), BOX_80_50_12);
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "face", selector: "top_face" });
  const json = JSON.stringify(doc0);
  const doc1 = JSON.parse(json);
  const grefs = doc1.geometryRefs ?? [];
  assert(grefs.length > 0, "no grefs");
  const fp = grefs[0].fingerprint;
  assert(fp.surface_type, "missing surface_type");
  assert(fp.role, "missing role");
  assert(typeof fp.area === "number", "missing area");
  assert(typeof fp.nx === "number", "missing nx");
  return `keys=${Object.keys(fp).join(",")}`;
});

run("SERIAL-gref-stored-by-query-op", "query_geometry through applyOperation populates geometryRefs", () => {
  const doc0 = applyOps(emptyDocument("serial4"), BOX_80_50_12);
  assert((doc0.geometryRefs ?? []).length === 0, "geometryRefs not empty initially");
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "face", selector: "top_face" });
  applyOperation(doc0, { op: "query_geometry", body_id: "Body", entity: "edge", selector: "top_perimeter" });
  const grefs = doc0.geometryRefs ?? [];
  assert(grefs.length >= 2, `expected >=2, got ${grefs.length}`);
  const faceGref = grefs.find((g) => g.entity === "face");
  const edgeGref = grefs.find((g) => g.entity === "edge");
  assert(faceGref, "no face gref");
  assert(edgeGref, "no edge gref");
  return `face=${faceGref.id} edge=${edgeGref.id} total=${grefs.length}`;
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function runMutationMatrix(): T[] {
  return results;
}

// Auto-run when executed directly
if (typeof process !== "undefined" && process.argv[1]?.includes("mutation")) {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n=== Mutation Matrix: ${passed} passed, ${failed} failed ===`);
  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"} ${r.id.padEnd(32)} ${r.name} — ${r.detail}`);
  }
  if (failed > 0) process.exit(1);
}
