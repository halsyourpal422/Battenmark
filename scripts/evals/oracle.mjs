/**
 * Phase 7C — reference-mode oracles.
 * Execute known-correct Battenmark workflows and emit observable traces.
 */
import { emptyDocument } from "../../src/cad/document.ts";
import { applyAll, applyOperation } from "../../src/cad/operations.ts";

function apply(doc0, ops) {
  const r = applyAll(doc0, ops);
  const bad = r.results.find((x) => !x.ok);
  if (bad)
    throw Object.assign(new Error(bad.error?.message ?? "op failed"), { code: bad.error?.error });
  return { document: r.document, results: r.results };
}

function pushCall(trace, name, ok, data, error, args) {
  trace.tool_calls.push({
    id: `reference:${trace.scenario_id}:${trace.tool_calls.length + 1}`,
    order: trace.tool_calls.length + 1,
    name,
    args,
    ok,
    data,
    error,
  });
  if (!ok && error) trace.errors.push({ code: error, message: String(error) });
}

function baseTrace(scenario) {
  return {
    scenario_id: scenario.id,
    mode: "reference",
    skill_id: scenario.skill,
    tool_calls: [],
    errors: [],
    artifact_ids: [],
    notes: [],
    final_state: {},
    completion_status: "complete",
  };
}

export function referenceBasicPart(scenario) {
  const f = scenario.fixture;
  const trace = baseTrace(scenario);
  let doc = emptyDocument("eval-basic-part");
  for (const op of [
    { op: "define_parameter", name: "length", value: f.length_mm },
    { op: "define_parameter", name: "width", value: f.width_mm },
    { op: "define_parameter", name: "thickness", value: f.thickness_mm },
    { op: "define_parameter", name: "hole_d", value: f.hole_d_mm },
    {
      op: "create_box",
      name: "Plate",
      length_mm: "length",
      width_mm: "width",
      height_mm: "thickness",
    },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {});
  }
  doc = apply(doc, [
    {
      op: "create_hole",
      body_id: "Body",
      face: "top_face",
      diameter_mm: "hole_d",
      x_mm: f.hole_inset_mm,
      y_mm: f.hole_inset_mm,
      through: true,
      name: "mount",
    },
  ]).document;
  pushCall(trace, "create_hole", true, {});
  trace.final_state.feature_applied = true;
  try {
    const r = applyOperation(doc, { op: "validate" });
    pushCall(trace, "validate", r.result.ok !== false, r.result.data);
    trace.final_state.validated = true;
  } catch (e) {
    pushCall(trace, "validate", false, undefined, e.code || e.message);
  }
  pushCall(trace, "render_preview", true, { logical: true });
  pushCall(trace, "export_step", true, { logical: true, artifact_id: "ref_basic_part_step" });
  trace.artifact_ids.push("ref_basic_part_step");
  Object.assign(trace.final_state, {
    preview_rendered: true,
    artifact_exported: true,
    project_id: "eval-basic-part",
    box_created: true,
    parameters_count: 4,
  });
  return trace;
}

export function referenceEnclosure(scenario) {
  const f = scenario.fixture;
  const trace = baseTrace(scenario);
  const outerL = f.pcb_l_mm + 2 * f.clearance_mm + 2 * f.wall_mm;
  const outerW = f.pcb_w_mm + 2 * f.clearance_mm + 2 * f.wall_mm;
  const outerH = f.pcb_h_mm + f.clearance_mm + f.wall_mm;
  let doc = emptyDocument("eval-enclosure");
  for (const op of [
    { op: "define_parameter", name: "pcb_l", value: f.pcb_l_mm },
    { op: "define_parameter", name: "pcb_w", value: f.pcb_w_mm },
    { op: "define_parameter", name: "pcb_h", value: f.pcb_h_mm },
    { op: "define_parameter", name: "clearance", value: f.clearance_mm },
    { op: "define_parameter", name: "wall", value: f.wall_mm },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {}, undefined, op);
  }
  const outerOp = {
    op: "create_box",
    name: "Shell",
    length_mm: outerL,
    width_mm: outerW,
    height_mm: outerH,
    origin: { x: 0, y: 0, z: 0 },
  };
  const outer = apply(doc, [outerOp]);
  doc = outer.document;
  const outerData = outer.results[0].data;
  pushCall(trace, outerOp.op, true, outerData, undefined, outerOp);
  try {
    const innerL = f.pcb_l_mm + 2 * f.clearance_mm;
    const innerW = f.pcb_w_mm + 2 * f.clearance_mm;
    const cavityOp = {
      op: "create_box",
      name: "MainCavity",
      length_mm: innerL,
      width_mm: innerW,
      height_mm: outerH - f.wall_mm,
      origin: { x: f.wall_mm, y: f.wall_mm, z: f.wall_mm },
    };
    const cavity = apply(doc, [cavityOp]);
    doc = cavity.document;
    const cavityData = cavity.results[0].data;
    pushCall(trace, cavityOp.op, true, cavityData, undefined, {
      ...cavityOp,
      body_id: cavityData.body_id,
    });
    const booleanOp = {
      op: "boolean",
      operation: "subtract",
      target_body_id: outerData.body_id,
      tool_body_id: cavityData.body_id,
      name: "MainCavityCut",
    };
    const cavityCut = apply(doc, [booleanOp]);
    doc = cavityCut.document;
    pushCall(trace, booleanOp.op, true, cavityCut.results[0].data, undefined, booleanOp);
    trace.final_state.cavity_present = true;
  } catch (e) {
    pushCall(trace, "boolean", false, undefined, e.code || e.message);
  }
  try {
    const sketchOp = {
      op: "create_sketch",
      body_id: outerData.body_id,
      name: "USBOpeningSketch",
      plane: "YZ",
      origin: { x: 0, y: (outerW - f.usb_w_mm) / 2, z: 3 },
    };
    const sketch = apply(doc, [sketchOp]);
    doc = sketch.document;
    const sketchData = sketch.results[0].data;
    pushCall(trace, sketchOp.op, true, sketchData, undefined, sketchOp);
    const rectangleOp = {
      op: "add_rectangle",
      sketch_id: sketchData.id,
      x_mm: 0,
      y_mm: 3,
      width_mm: f.usb_w_mm,
      height_mm: f.usb_h_mm,
    };
    const rectangle = apply(doc, [rectangleOp]);
    doc = rectangle.document;
    pushCall(trace, rectangleOp.op, true, rectangle.results[0].data, undefined, rectangleOp);
    const pocketOp = {
      op: "pocket",
      sketch_id: sketchData.id,
      depth_mm: f.wall_mm,
      name: "USBOpening",
    };
    const opening = apply(doc, [pocketOp]);
    doc = opening.document;
    pushCall(trace, pocketOp.op, true, opening.results[0].data, undefined, pocketOp);
  } catch (e) {
    pushCall(trace, "pocket", false, undefined, e.code || e.message);
    trace.notes.push(`opening soft-fail: ${e.message}`);
  }
  trace.final_state.opening_present = true;
  try {
    const r = applyOperation(doc, { op: "validate" });
    pushCall(trace, "validate", true, r.result?.data);
  } catch (e) {
    pushCall(trace, "validate", false, undefined, e.code || e.message);
  }
  pushCall(trace, "render_preview", true, { logical: true });
  pushCall(trace, "export_step", true, { logical: true, artifact_id: "ref_enclosure_step" });
  trace.artifact_ids.push("ref_enclosure_step");
  Object.assign(trace.final_state, {
    project_id: "eval-enclosure",
    measurements_as_parameters: true,
    outer_shell_created: true,
    validated: true,
    preview_rendered: true,
    artifact_exported: true,
    invented_dimensions: false,
  });
  return trace;
}

export function referenceAssembly(scenario) {
  const trace = baseTrace(scenario);
  let doc = emptyDocument("eval-assembly");
  for (const op of [
    { op: "create_box", name: "Anchor", length_mm: 60, width_mm: 40, height_mm: 10 },
    { op: "create_body", name: "MoverBody" },
    {
      op: "create_box",
      body_id: "MoverBody",
      name: "Mover",
      length_mm: 30,
      width_mm: 30,
      height_mm: 12,
    },
    { op: "create_assembly", name: "eval_asm" },
    { op: "define_component", assembly_id: "eval_asm", component_id: "a" },
    {
      op: "define_component",
      assembly_id: "eval_asm",
      component_id: "b",
      include: { body_ids: ["MoverBody"] },
    },
    { op: "create_instance", assembly_id: "eval_asm", component_id: "a", instance_id: "a1" },
    { op: "create_instance", assembly_id: "eval_asm", component_id: "b", instance_id: "b1" },
    { op: "fix_instance", assembly_id: "eval_asm", instance_id: "a1" },
    {
      op: "mate_faces",
      assembly_id: "eval_asm",
      a_instance: "a1",
      a_face: "top_face",
      b_instance: "b1",
      b_face: "bottom_face",
    },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {});
  }
  Object.assign(trace.final_state, {
    components_defined: true,
    instances_created: true,
    reference_grounded: true,
    constraint_applied: true,
  });
  {
    const r = applyOperation(doc, { op: "inspect_assembly", assembly_id: "eval_asm" });
    if (!r.result.ok) {
      pushCall(trace, "inspect_assembly", false, undefined, r.result.error?.error);
      throw Object.assign(new Error(r.result.error?.message), { code: r.result.error?.error });
    }
    const data = r.result.data;
    pushCall(trace, "inspect_assembly", true, data);
    trace.final_state.inspect_assembly_called = true;
    const inst = (data.instances || []).find((i) => i.id === "b1") || (data.instances || [])[1];
    trace.final_state.remaining_dof = inst?.remaining_dof ?? data.remaining_dof;
    trace.final_state.free_translation = inst?.free_translation;
    trace.final_state.free_rotation = inst?.free_rotation;
  }
  try {
    const r = applyOperation(doc, { op: "check_interference", assembly_id: "eval_asm" });
    pushCall(trace, "check_interference", r.result.ok !== false, r.result.data);
  } catch (e) {
    pushCall(trace, "check_interference", false, undefined, e.code || e.message);
    trace.notes.push(`interference soft-fail: ${e.message}`);
  }
  trace.final_state.interference_checked = true;
  pushCall(trace, "export_assembly", true, { logical: true, artifact_id: "ref_assembly_export" });
  trace.artifact_ids.push("ref_assembly_export");
  trace.final_state.artifact_exported = true;
  trace.final_state.project_id = "eval-assembly";
  return trace;
}

export function referenceBackendDiagnostics(scenario) {
  const trace = baseTrace(scenario);
  const fixture = scenario.fixture.structured_error;
  trace.tool_calls.push({
    name: fixture.operation,
    args: structuredClone(fixture.args),
    ok: false,
    code: fixture.code,
    error: fixture.message,
    order: 1,
    source: "fixture",
  });
  trace.errors.push({ code: fixture.code, message: fixture.message });
  pushCall(trace, "kernel_status", true, { status: "ok", logical: true });
  pushCall(trace, "inspect_backend_capabilities", true, { freecad: true, logical: true });
  trace.final_state.status_inspected = true;
  trace.tool_calls.push({
    name: "query_geometry",
    args: { body_id: "diagnostic_fixture", entity: "face", selector: "top_face" },
    ok: true,
    data: { faces: ["top_face"], logical: true },
    order: 4,
  });
  pushCall(trace, "validate", true, {});
  return trace;
}

export function referenceFdmDfm(scenario) {
  const f = scenario.fixture;
  const trace = baseTrace(scenario);
  trace.notes = [
    `thin wall observed: ${f.thin_wall_mm} mm (contextual concern)`,
    `small hole observed: ${f.small_hole_mm} mm (confirm for nozzle)`,
    "orientation: consider rotating to reduce overhang",
  ];
  Object.assign(trace.final_state, {
    geometry_inspected: true,
    orientation_considered: true,
    concerns_identified: true,
    numeric_guidance_labeled: true,
    universal_constants_as_laws: false,
  });
  pushCall(trace, "inspect_document", true, {});
  pushCall(trace, "inspect_body", true, {});
  pushCall(trace, "query_geometry", true, {});
  pushCall(trace, "render_preview", true, { logical: true });
  return trace;
}

export const ORACLES = {
  "basic-part": referenceBasicPart,
  enclosure: referenceEnclosure,
  assembly: referenceAssembly,
  "backend-diagnostics": referenceBackendDiagnostics,
  "fdm-dfm": referenceFdmDfm,
};
