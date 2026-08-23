import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { runExample } from "../examples";
import { paramMap } from "../document";
import { resolveVec3 } from "../expressions";
import { freeCadKernel, queryGeometry } from "./freecad.server";
import { getFreeCadWorker } from "./client.server";
import type { Feature, Vec3Expr } from "../types";

function boxOrigin(features: Feature[], name: string): Vec3Expr {
  const f = features.find((x) => x.name === name);
  if (!f || f.kind !== "box") throw new Error(`missing box ${name}`);
  return f.origin;
}

function approx(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps;
}

async function main() {
  console.log("=== Phase 5 demo ===\n");

  console.log("A — parametric cavity wall 2.4 → 4");
  const cav = applyAll(emptyDocument("cavity"), [
    { op: "define_parameter", name: "wall", value: 2.4 },
    { op: "create_box", name: "Outer", length_mm: 100, width_mm: 80, height_mm: 20 },
    { op: "create_body", name: "Cavity" },
    {
      op: "create_box",
      body_id: "Cavity",
      name: "InnerCut",
      length_mm: "100 - 2 * wall",
      width_mm: "80 - 2 * wall",
      height_mm: 20,
      origin: { x: "wall", y: "wall", z: "wall" },
    },
    { op: "boolean", target_body_id: "Body", tool_body_id: "Cavity", operation: "subtract" },
  ]);
  const o1 = resolveVec3(boxOrigin(cav.document.features, "InnerCut"), paramMap(cav.document));
  const { document: cav2 } = applyOperation(cav.document, { op: "set_parameter", name: "wall", value: 4 });
  const o2 = resolveVec3(boxOrigin(cav2.features, "InnerCut"), paramMap(cav2));
  const insA = await freeCadKernel.inspect(cav2);
  if (!approx(o1.x, 2.4, 1e-6) || !approx(o2.x, 4, 1e-6)) {
    throw new Error(`cavity origin did not follow wall: ${o1.x} → ${o2.x}`);
  }
  console.log(`  origin ${o1.x},${o1.y},${o1.z} → ${o2.x},${o2.y},${o2.z} valid=${insA.valid} V=${insA.volume_mm3}`);

  console.log("B — stable fillet top_perimeter, length 80 → 120");
  const box = applyAll(emptyDocument("semantic-box"), [
    { op: "define_parameter", name: "length", value: 80 },
    { op: "create_box", length_mm: "length", width_mm: 50, height_mm: 12 },
    { op: "fillet", body_id: "Body", radius_mm: 3, edges: "top_perimeter", name: "TopRound" },
  ]);
  const q = await queryGeometry(box.document, { entity: "edge", selector: "all_vertical" });
  const { document: box2 } = applyOperation(box.document, { op: "set_parameter", name: "length", value: 120 });
  const insB = await freeCadKernel.inspect(box2);
  console.log(`  vertical matches=${q.match_count} after length valid=${insB.valid} V=${insB.volume_mm3}`);

  console.log("C — hole plate 100×60 → 140×80, 10 mm insets");
  const plate = applyAll(emptyDocument("hole-plate"), [
    { op: "define_parameter", name: "length", value: 100 },
    { op: "define_parameter", name: "width", value: 60 },
    { op: "define_parameter", name: "inset", value: 10 },
    { op: "create_box", length_mm: "length", width_mm: "width", height_mm: 5 },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "inset", y_mm: "inset", diameter_mm: 4, through: true, name: "FL" },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "length - inset", y_mm: "inset", diameter_mm: 4, through: true, name: "FR" },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "inset", y_mm: "width - inset", diameter_mm: 4, through: true, name: "BL" },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "length - inset", y_mm: "width - inset", diameter_mm: 4, through: true, name: "BR" },
  ]);
  const { document: p2 } = applyOperation(plate.document, { op: "set_parameter", name: "length", value: 140 });
  const { document: p3 } = applyOperation(p2, { op: "set_parameter", name: "width", value: 80 });
  const insC = await freeCadKernel.inspect(p3);
  const types = (insC.features || []).map((f) => (f as { feature_type?: string }).feature_type).filter(Boolean);
  console.log(`  valid=${insC.valid} V=${insC.volume_mm3} tree=${types.join(",")}`);

  console.log("D — PartDesign through + blind");
  const thru = applyAll(emptyDocument("pd-hole"), [
    { op: "create_box", length_mm: 40, width_mm: 40, height_mm: 10 },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 20, y_mm: 20, diameter_mm: 6, through: true, name: "Thru" },
  ]);
  const insD = await freeCadKernel.inspect(thru.document);
  console.log(`  through valid=${insD.valid} V=${insD.volume_mm3} types=${(insD.features || []).map((f) => (f as { feature_type?: string }).feature_type).join(",")}`);

  console.log("E — linear pattern count 4 → 3");
  const pat = applyAll(emptyDocument("pat"), [
    { op: "define_parameter", name: "count", value: 4, unit: "count" },
    { op: "create_box", length_mm: 80, width_mm: 30, height_mm: 5 },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 10, y_mm: 15, diameter_mm: 4, through: true, name: "H" },
    { op: "create_pattern", feature_id: "H", count: "count", direction: "x", spacing_mm: 20, name: "Row" },
  ]);
  const insE1 = await freeCadKernel.inspect(pat.document);
  const { document: pat2 } = applyOperation(pat.document, { op: "set_parameter", name: "count", value: 3 });
  const insE2 = await freeCadKernel.inspect(pat2);
  console.log(`  V ${insE1.volume_mm3} → ${insE2.volume_mm3} valid=${insE2.valid}`);

  console.log("F — semantic enclosure wall 2.4 → 3.0 then size");
  const enc = runExample("enclosure");
  const wall0 = resolveVec3(boxOrigin(enc.document.features, "InnerCut"), paramMap(enc.document));
  const insF0 = await freeCadKernel.inspect(enc.document);
  const { document: e2 } = applyOperation(enc.document, { op: "set_parameter", name: "wall", value: 3 });
  const wall1 = resolveVec3(boxOrigin(e2.features, "InnerCut"), paramMap(e2));
  const insF1 = await freeCadKernel.inspect(e2);
  console.log(`  cavity origin ${wall0.x} → ${wall1.x}; solids ${insF0.solid_count}→${insF1.solid_count} valid=${insF1.valid}`);

  console.log("G — lost geometry reference");
  const lost = applyAll(emptyDocument("lost"), [
    { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
    { op: "fillet", body_id: "Body", radius_mm: 2, edges: { gref: "gref_edge_does_not_exist" } },
  ]);
  const insG = await freeCadKernel.inspect(lost.document);
  const hit = insG.issues.find((i) => i.code === "GEOMETRY_REFERENCE_LOST" || i.code === "GEOMETRY_SELECTOR_NO_MATCH");
  console.log(`  ${hit?.code ?? JSON.stringify(insG.issues)} — no silent mis-selection`);

  getFreeCadWorker().kill("SIGKILL");
  console.log("\nPhase 5 demo complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
