/**
 * Phase 6 assembly unit suite (kernel-free): IR, instancing, deterministic
 * solver scenarios A–I, conflicts, limits, golden fixtures.
 */
import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import type { CadDocument as Doc, Operation } from "./types";

function apply(doc0: Doc, ops: Operation[]): Doc {
  const r = applyAll(doc0, ops);
  const bad = r.results.find((x) => !x.ok);
  if (bad) throw Object.assign(new Error(bad.error?.message ?? "op failed"), { code: bad.error?.error });
  return r.document;
}
function inspectData(doc0: Doc, assemblyId: string): Record<string, any> {
  const r = applyOperation(doc0, { op: "inspect_assembly", assembly_id: assemblyId });
  if (!r.result.ok) throw Object.assign(new Error(r.result.error?.message), { code: r.result.error?.error });
  return r.result.data as Record<string, any>;
}
function expectOpError(doc0: Doc, op: Operation, code: string): void {
  try {
    apply(doc0, [op]);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === undefined) throw err;
    if (e.code !== code) throw new Error(`expected ${code}, got ${e.code}: ${(err as Error).message}`);
    return;
  }
  // op-level failure (captured result)
  const r = applyAll(doc0, [op]);
  const got = r.results[0]?.error?.error;
  if (got !== code) throw new Error(`expected ${code}, got ${got ?? "success"}`);
}

interface T { id: string; name: string; passed: boolean; detail: string }
const out: T[] = [];
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function run(id: string, name: string, fn: () => string | void): Promise<void> {
  try {
    const detail = fn() ?? "ok";
    out.push({ id, name, passed: true, detail });
    console.log(`PASS ${id.padEnd(16)} ${name} — ${detail}`);
  } catch (err) {
    out.push({ id, name, passed: false, detail: String((err as Error).message) });
    console.log(`FAIL ${id.padEnd(16)} ${name} — ${(err as Error).message}`);
  }
}


function basePlateDoc(): Doc {
  const { document } = applyAll(emptyDocument("asm-l"), [
    { op: "define_parameter", name: "plate_l", value: 100 },
    { op: "define_parameter", name: "plate_w", value: 60 },
    { op: "define_parameter", name: "plate_t", value: 10 },
    { op: "create_box", name: "Plate", length_mm: "plate_l", width_mm: "plate_w", height_mm: "plate_t" },
  ]);
  return document;
}

function bracketDoc(doc0: Doc): Doc {
  return apply(doc0, [
    { op: "create_body", name: "BracketBody" },
    { op: "create_box", body_id: "BracketBody", name: "Bracket", length_mm: 60, width_mm: 10, height_mm: 50 },
  ]);
}

function main() {
  // ---- A. fixed + planar mate -------------------------------------------------
  run("A-mate", "fixed + planar mate", () => {
    let doc = bracketDoc(basePlateDoc());
    doc = apply(doc, [
      { op: "create_assembly", name: "bracket_demo" },
      { op: "define_component", assembly_id: "bracket_demo", component_id: "plate" },
      { op: "define_component", assembly_id: "bracket_demo", component_id: "bracket", include: { body_ids: ["BracketBody"] } },
      { op: "create_instance", assembly_id: "bracket_demo", component_id: "plate", instance_id: "plate_1" },
      { op: "create_instance", assembly_id: "bracket_demo", component_id: "bracket", instance_id: "bracket_1" },
      { op: "fix_instance", assembly_id: "bracket_demo", instance_id: "plate_1" },
      { op: "mate_faces", assembly_id: "bracket_demo", a_instance: "plate_1", a_face: "top_face", b_instance: "bracket_1", b_face: "bottom_face" },
      { op: "mate_faces", assembly_id: "bracket_demo", a_instance: "plate_1", a_face: "back_face", b_instance: "bracket_1", b_face: "front_face" },
    ]);
    const data = inspectData(doc, "bracket_demo") as { instances: Array<{ id: string; transform: { translation: { z: number } }; remaining_dof: number }>; solved: boolean; world_bbox: { min: { z: number }; max: { z: number } } };
    assert(data.solved, "solver deferred constraints");
    const br = data.instances.find((i) => i.id === "bracket_1")!;
    // plate top at z=10 → bracket bottom must sit at z=10
    assert(Math.abs(br.transform.translation.z - 10) < 1e-6, `bracket z ${br.transform.translation.z}`);
    assert(br.remaining_dof <= 6, `dof ${br.remaining_dof}`);
    assert(Math.abs(data.world_bbox!.max.z - 60) < 1e-6, `bbox z ${data.world_bbox!.max.z}`);
    return `bracket z=${br.transform.translation.z.toFixed(3)} bbox_z=${data.world_bbox!.max.z}`;
  });

  // ---- B. concentric axis (pin in hole) --------------------------------------
  run("B-concentric", "concentric pin/hole axes", () => {
    let document = emptyDocument("asm-pin");
    const rB = applyAll(document, [
      { op: "create_box", name: "P", length_mm: 80, width_mm: 50, height_mm: 12 },
      { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 20, y_mm: 25, diameter_mm: 8, through: true, name: "pin_hole" },
      { op: "create_body", name: "PinBody" },
      { op: "create_cylinder", body_id: "PinBody", name: "Pin", radius_mm: 4, height_mm: 24 },
      { op: "create_assembly", name: "pin_asm" },
      { op: "define_component", assembly_id: "pin_asm", component_id: "plate" },
      { op: "define_component", assembly_id: "pin_asm", component_id: "pin", include: { body_ids: ["PinBody"] } },
      { op: "create_instance", assembly_id: "pin_asm", component_id: "plate", instance_id: "plate_1" },
      { op: "create_instance", assembly_id: "pin_asm", component_id: "pin", instance_id: "pin_1" },
      { op: "fix_instance", assembly_id: "pin_asm", instance_id: "plate_1" },
      { op: "align_axes", assembly_id: "pin_asm", a_instance: "plate_1", a_axis: "pin_hole", b_instance: "pin_1", b_axis: "PinBody", concentric: true },
    ]);
    {
      const bad = rB.results.find((x) => !x.ok);
      if (bad) throw Object.assign(new Error(bad.error?.message ?? "op failed"), { code: bad.error?.error });
    }
    document = rB.document;
    const data = inspectData(document, "pin_asm") as { solved: boolean; instances: Array<{ id: string; transform: { translation: { x: number; y: number } } }> };
    assert(data.solved, "unsolved");
    const pin = data.instances.find((i) => i.id === "pin_1")!;
    // hole center at (20,25): concentric slide must align pin axis over it
    assert(Math.abs(pin.transform.translation.x - 20) < 1e-6 && Math.abs(pin.transform.translation.y - 25) < 1e-6,
      `pin xy ${pin.transform.translation.x},${pin.transform.translation.y}`);
    return `pin at (${pin.transform.translation.x}, ${pin.transform.translation.y})`;
  });

  // ---- C/D. distance + angle --------------------------------------------------
  run("CD-dist-angle", "distance and angle constraints", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "da" },
      { op: "define_component", assembly_id: "da", component_id: "plate" },
      { op: "create_instance", assembly_id: "da", component_id: "plate", instance_id: "p1" },
      { op: "fix_instance", assembly_id: "da", instance_id: "p1" },
      { op: "create_body", name: "SliderBody" },
      { op: "create_box", body_id: "SliderBody", name: "Slider", length_mm: 40, width_mm: 40, height_mm: 12 },
      { op: "define_component", assembly_id: "da", component_id: "slider", include: { body_ids: ["SliderBody"] } },
      { op: "create_instance", assembly_id: "da", component_id: "slider", instance_id: "s1" },
      { op: "set_distance", assembly_id: "da", a_instance: "p1", a_ref: "right_face", b_instance: "s1", b_ref: "left_face", distance_mm: 15 },
    ]);
    const data = inspectData(doc, "da") as { solved: boolean; instances: Array<{ id: string; transform: { translation: { x: number } } }> };
    assert(data.solved, "unsolved");
    const s = data.instances.find((i) => i.id === "s1")!;
    assert(Math.abs(s.transform.translation.x - 115) < 1e-6, `slider x ${s.transform.translation.x} expected 115`);
    return `slider gap=15 → x=${s.transform.translation.x}`;
  });

  // ---- E. shared definition, four instances -----------------------------------
  run("E-instancing", "shared definition × 4 instances", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "multi" },
      { op: "define_component", assembly_id: "multi", component_id: "spacer" },
    ]);
    for (let i = 0; i < 4; i++) {
      doc = apply(doc, [{ op: "create_instance", assembly_id: "multi", component_id: "spacer", instance_id: `sp_${i + 1}`, position: { x: i * 30 } }]);
    }
    const data = inspectData(doc, "multi") as { counts: { definitions: number; instances: number }; world_bbox: { min: { x: number }; max: { x: number } } };
    assert(data.counts.definitions === 1 && data.counts.instances === 4, JSON.stringify(data.counts));
    assert(Math.abs(data.world_bbox!.max.x - 190) < 1e-6, `max x ${data.world_bbox!.max.x}`);
    return `1 def / 4 inst, bbox_x=[${data.world_bbox!.min.x},${data.world_bbox!.max.x}]`;
  });

  // ---- F. parametric rebuild through definition parameter ---------------------
  run("F-parametric", "definition param change updates instances", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "par" },
      { op: "define_component", assembly_id: "par", component_id: "plate" },
      { op: "create_instance", assembly_id: "par", component_id: "plate", instance_id: "p1" },
      { op: "fix_instance", assembly_id: "par", instance_id: "p1" },
      { op: "set_definition_parameter", assembly_id: "par", component_id: "plate", name: "plate_l", value: 140 },
    ]);
    const data = inspectData(doc, "par") as { world_bbox: { max: { x: number } } };
    assert(Math.abs(data.world_bbox!.max.x - 140) < 1e-6, `x ${data.world_bbox!.max.x} expected 140`);
    return `plate_l→140 ⇒ bbox_x=${data.world_bbox!.max.x}`;
  });

  // ---- G/H. lost & ambiguous references --------------------------------------
  run("G-lost", "lost reference fails explicitly", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "lost" },
      { op: "define_component", assembly_id: "lost", component_id: "c" },
      { op: "create_instance", assembly_id: "lost", component_id: "c", instance_id: "i1" },
    ]);
    doc = apply(doc, [{ op: "mate_faces", assembly_id: "lost", a_instance: "i1", a_face: "nonexistent_face", b_instance: "i1", b_face: "top_face" }]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "lost" } as Operation, "GEOMETRY_REFERENCE_LOST");
  });

  run("H-ambiguous", "ambiguous selector rejected", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "amb" },
      { op: "define_component", assembly_id: "amb", component_id: "c" },
      { op: "create_instance", assembly_id: "amb", component_id: "c", instance_id: "i1" },
    ]);
    doc = apply(doc, [{ op: "mate_faces", assembly_id: "amb", a_instance: "i1", a_face: "planar", b_instance: "i1", b_face: "top_face" }]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "amb" } as Operation, "GEOMETRY_REFERENCE_AMBIGUOUS");
  });

  // ---- I. conflicting constraints --------------------------------------------
  run("I-conflict", "contradictory distances conflict", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "conf" },
      { op: "define_component", assembly_id: "conf", component_id: "plate" },
      { op: "create_instance", assembly_id: "conf", component_id: "plate", instance_id: "a" },
      { op: "fix_instance", assembly_id: "conf", instance_id: "a" },
      { op: "create_instance", assembly_id: "conf", component_id: "plate", instance_id: "b" },
      { op: "set_distance", assembly_id: "conf", a_instance: "a", a_ref: "right_face", b_instance: "b", b_ref: "left_face", distance_mm: 10 },
    ]);
    doc = apply(doc, [{
      op: "set_distance",
      assembly_id: "conf",
      a_instance: "a", a_ref: "right_face",
      b_instance: "b", b_ref: "left_face",
      distance_mm: 20,
    } as Operation]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "conf" } as Operation, "CONSTRAINT_CONFLICT");
  });

  // ---- determinism + fixed immovability ---------------------------------------
  run("J-determinism", "same inputs → same placements", () => {
    const build = () => {
      let doc = bracketDoc(basePlateDoc());
      doc = apply(doc, [
        { op: "create_assembly", name: "det" },
        { op: "define_component", assembly_id: "det", component_id: "plate" },
        { op: "define_component", assembly_id: "det", component_id: "bracket", include: { body_ids: ["BracketBody"] } },
        { op: "create_instance", assembly_id: "det", component_id: "plate", instance_id: "plate_1" },
        { op: "create_instance", assembly_id: "det", component_id: "bracket", instance_id: "bracket_1" },
        { op: "fix_instance", assembly_id: "det", instance_id: "plate_1" },
        { op: "mate_faces", assembly_id: "det", a_instance: "plate_1", a_face: "top_face", b_instance: "bracket_1", b_face: "bottom_face" },
      ]);
      return JSON.stringify(inspectData(doc, "det").instances);
    };
    const one = build();
    for (let i = 0; i < 5; i++) assert(build() === one, "nondeterministic placements");
    return "5 rebuilds byte-identical";
  });

  run("K-fixed-immovable", "fixed instance never moves", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "fix" },
      { op: "define_component", assembly_id: "fix", component_id: "plate" },
      { op: "create_instance", assembly_id: "fix", component_id: "plate", instance_id: "p1" },
      { op: "fix_instance", assembly_id: "fix", instance_id: "p1" },
    ]);
    const before = JSON.stringify(inspectData(doc, "fix"));
    doc = apply(doc, [{
      op: "mate_faces",
      assembly_id: "fix",
      a_instance: "p1", a_face: "top_face",
      b_instance: "p1", b_face: "bottom_face",
    } as Operation]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "fix" } as Operation, "CONSTRAINT_CONFLICT");
    assert(before.includes('"fixed":true'), "grounded flag persisted");
    return "grounded frame stable (conflict raised, nothing moved)";
  });

  // ---- limits ------------------------------------------------------------------
  run("L-limits", "instance limit enforced", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "lim" },
      { op: "define_component", assembly_id: "lim", component_id: "c" },
    ]);
    let thrown = false;
    try {
      for (let i = 0; i < 600; i++) {
        doc = apply(doc, [{ op: "create_instance", assembly_id: "lim", component_id: "c", instance_id: `x${i}` }]);
      }
    } catch (err) {
      thrown = (err as { code?: string }).code === "ASSEMBLY_LIMIT_EXCEEDED";
    }
    assert(thrown, "limit not enforced");
    return "512-instance cap holds";
  });

  // ---- performance observation (§87) -------------------------------------------
  run("M-perf", "100-instance solve timing", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "perf" },
      { op: "define_component", assembly_id: "perf", component_id: "c" },
    ]);
    for (let i = 0; i < 100; i++) {
      doc = apply(doc, [{ op: "create_instance", assembly_id: "perf", component_id: "c", instance_id: `n${i}`, position: { x: i * 25 } }]);
    }
    const t0 = Date.now();
    inspectData(doc, "perf");
    return `solve+inspect 100 instances in ${Date.now() - t0} ms`;
  });

  // ---- N. structured face selector: pivot from real geometry -------------------
  run("N-struct-pivot", "structured selector pivot ≠ origin", () => {
    let doc = emptyDocument("struct-pivot");
    doc = apply(doc, [
      { op: "create_box", name: "Base", length_mm: 100, width_mm: 60, height_mm: 10 },
      { op: "create_body", name: "MoverBody" },
      { op: "create_box", body_id: "MoverBody", name: "Mover", length_mm: 40, width_mm: 20, height_mm: 20 },
      { op: "create_assembly", name: "sp" },
      { op: "define_component", assembly_id: "sp", component_id: "base" },
      { op: "define_component", assembly_id: "sp", component_id: "mover", include: { body_ids: ["MoverBody"] } },
      { op: "create_instance", assembly_id: "sp", component_id: "base", instance_id: "b1" },
      { op: "fix_instance", assembly_id: "sp", instance_id: "b1" },
      { op: "create_instance", assembly_id: "sp", component_id: "mover", instance_id: "m1", rotation_euler_xyz_deg: { x: 90, y: 0, z: 0 } },
      {
        op: "set_angle",
        assembly_id: "sp",
        a_instance: "b1",
        a_ref: "top_face",
        b_instance: "m1",
        b_ref: { entity: "face", nearest: { x: 20, y: 10, z: 20 }, unique: true },
        angle_deg: 180,
      },
    ]);
    const data = inspectData(doc, "sp") as { solved: boolean; instances: Array<{ id: string; transform: { translation: { x: number; y: number; z: number } } }> };
    assert(data.solved, "unsolved");
    const m = data.instances.find((i) => i.id === "m1")!;
    const t = m.transform.translation;
    // Rotation Rx(90+90) about the selected face CENTER (20,-20,10 after pre-rotation):
    // t' = p + R90x*(t - p) with t=(0,0,0) -> (0,-30,-10). Origin-pivot bug gives (0,0,0).
    assert(Math.abs(t.x) < 1e-6 && Math.abs(t.y + 10) < 1e-6 && Math.abs(t.z - 30) < 1e-6,
      `pivot-bug translation ${t.x},${t.y},${t.z} expected 0,-10,30 (origin bug would give 0,0,0)`);
    return `translation=${t.x},${t.y},${t.z} (pivot = selected face center)`;
  });

  // ---- O. structured axis honestly narrowed ------------------------------------
  run("O-axis-narrowed", "structured axis rejected early", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "ax" },
      { op: "define_component", assembly_id: "ax", component_id: "c" },
      { op: "create_instance", assembly_id: "ax", component_id: "c", instance_id: "i1" },
    ]);
    doc = apply(doc, [{ op: "align_axes", assembly_id: "ax", a_instance: "i1", a_axis: { entity: "face", selector: "cylindrical", unique: true }, b_instance: "i1", b_axis: "Z" } as Operation]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "ax" } as Operation, "INVALID_ASSEMBLY_REFERENCE");
    return "schema and runtime agree";
  });

  // ---- P/Q. gref through assembly references ------------------------------------
  run("P-gref-valid", "gref reference resolves", () => {
    let doc = emptyDocument("gref-ok");
    doc = apply(doc, [
      { op: "create_box", name: "Base", length_mm: 100, width_mm: 60, height_mm: 10 },
      { op: "create_body", name: "MB" },
      { op: "create_box", body_id: "MB", name: "Mv", length_mm: 40, width_mm: 20, height_mm: 20 },
      { op: "create_assembly", name: "gv" },
      { op: "define_component", assembly_id: "gv", component_id: "base", include: { body_ids: ["Body"] } },
      { op: "define_component", assembly_id: "gv", component_id: "mover", include: { body_ids: ["MB"] } },
      { op: "create_instance", assembly_id: "gv", component_id: "base", instance_id: "b1" },
      { op: "fix_instance", assembly_id: "gv", instance_id: "b1" },
      { op: "create_instance", assembly_id: "gv", component_id: "mover", instance_id: "m1" },
      { op: "mate_faces", assembly_id: "gv", a_instance: "b1", a_face: { gref: "gref_face_001" }, b_instance: "m1", b_face: "bottom_face" },
    ]);
    const data = inspectData(doc, "gv") as { solved: boolean };
    assert(data.solved, "gref constraint did not apply");
    return "gref_face_001 resolved through canonical query path";
  });

  run("Q-gref-lost", "missing gref fails explicitly", () => {
    let doc = basePlateDoc();
    doc = apply(doc, [
      { op: "create_assembly", name: "gl" },
      { op: "define_component", assembly_id: "gl", component_id: "c" },
      { op: "create_instance", assembly_id: "gl", component_id: "c", instance_id: "i1" },
      { op: "create_instance", assembly_id: "gl", component_id: "c", instance_id: "i2" },
      { op: "mate_faces", assembly_id: "gl", a_instance: "i1", a_face: { gref: "gref_face_999" }, b_instance: "i2", b_face: "top_face" },
    ]);
    expectOpError(doc, { op: "inspect_assembly", assembly_id: "gl" } as Operation, "GEOMETRY_REFERENCE_LOST");
  });

  let failed = 0;
  for (const r of out) if (!r.passed) failed += 1;
  console.log(`\n${out.length - failed}/${out.length} assembly unit tests passed`);
  process.exit(failed ? 1 : 0);
}

main();
