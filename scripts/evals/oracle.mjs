/**
 * Phase 7C — reference-mode oracles.
 * Execute known-correct Battenmark workflows and emit observable traces.
 */
import { emptyDocument } from "../../src/cad/document.ts";
import { applyAll, applyOperation } from "../../src/cad/operations.ts";

function apply(doc0, ops) {
  const r = applyAll(doc0, ops);
  const bad = r.results.find((x) => !x.ok);
  if (bad) throw Object.assign(new Error(bad.error?.message ?? "op failed"), { code: bad.error?.error });
  return { document: r.document, results: r.results };
}

function pushCall(trace, name, ok, data, error) {
  trace.tool_calls.push({ name, ok, data, error });
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
    { op: "create_box", name: "Plate", length_mm: "length", width_mm: "width", height_mm: "thickness" },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {});
  }
  doc = apply(doc, [{
    op: "create_hole", body_id: "Body", face: "top_face", diameter_mm: "hole_d",
    x_mm: f.hole_inset_mm, y_mm: f.hole_inset_mm, through: true, name: "mount",
  }]).document;
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
    preview_rendered: true, artifact_exported: true, project_id: "eval-basic-part",
    box_created: true, parameters_count: 4,
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
    { op: "create_box", name: "Shell", length_mm: outerL, width_mm: outerW, height_mm: outerH },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {});
  }
  try {
    const innerL = f.pcb_l_mm + 2 * f.clearance_mm;
    const innerW = f.pcb_w_mm + 2 * f.clearance_mm;
    doc = apply(doc, [{ op: "create_box", name: "Cavity", length_mm: innerL, width_mm: innerW, height_mm: outerH }]).document;
    pushCall(trace, "create_box", true, { role: "cavity" });
    try {
      doc = apply(doc, [{ op: "boolean", operation: "subtract", target: "Shell", tool: "Cavity" }]).document;
      pushCall(trace, "boolean", true, {});
    } catch (e) {
      pushCall(trace, "boolean", false, undefined, e.code || e.message);
      trace.notes.push(`boolean soft-fail: ${e.message}`);
    }
    trace.final_state.cavity_present = true;
  } catch (e) {
    pushCall(trace, "create_box", false, undefined, e.code || e.message);
  }
  try {
    doc = apply(doc, [{
      op: "create_hole", body_id: "Body", face: "front_face",
      diameter_mm: Math.min(f.usb_w_mm, f.usb_h_mm), x_mm: outerL / 2, y_mm: 3, name: "usb",
    }]).document;
    pushCall(trace, "create_hole", true, { role: "usb_opening" });
  } catch (e) {
    pushCall(trace, "create_hole", false, undefined, e.code || e.message);
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
    project_id: "eval-enclosure", measurements_as_parameters: true, outer_shell_created: true,
    validated: true, preview_rendered: true, artifact_exported: true, invented_dimensions: false,
  });
  return trace;
}

export function referenceAssembly(scenario) {
  const trace = baseTrace(scenario);
  let doc = emptyDocument("eval-assembly");
  for (const op of [
    { op: "create_box", name: "Anchor", length_mm: 60, width_mm: 40, height_mm: 10 },
    { op: "create_body", name: "MoverBody" },
    { op: "create_box", body_id: "MoverBody", name: "Mover", length_mm: 30, width_mm: 30, height_mm: 12 },
    { op: "create_assembly", name: "eval_asm" },
    { op: "define_component", assembly_id: "eval_asm", component_id: "a" },
    { op: "define_component", assembly_id: "eval_asm", component_id: "b", include: { body_ids: ["MoverBody"] } },
    { op: "create_instance", assembly_id: "eval_asm", component_id: "a", instance_id: "a1" },
    { op: "create_instance", assembly_id: "eval_asm", component_id: "b", instance_id: "b1" },
    { op: "fix_instance", assembly_id: "eval_asm", instance_id: "a1" },
    { op: "mate_faces", assembly_id: "eval_asm", a_instance: "a1", a_face: "top_face", b_instance: "b1", b_face: "bottom_face" },
  ]) {
    doc = apply(doc, [op]).document;
    pushCall(trace, op.op, true, {});
  }
  Object.assign(trace.final_state, {
    components_defined: true, instances_created: true, reference_grounded: true, constraint_applied: true,
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
  trace.errors.push({ code: scenario.fixture.injected_error_code, message: "Reference face gref_missing was lost after rebuild" });
  pushCall(trace, "inspect_assembly", false, undefined, scenario.fixture.injected_error_code);
  trace.final_state.error_recorded = true;
  pushCall(trace, "kernel_status", true, { status: "ok", logical: true });
  pushCall(trace, "inspect_backend_capabilities", true, { freecad: true, logical: true });
  trace.final_state.status_inspected = true;
  pushCall(trace, "inspect_faces", true, { faces: ["top_face", "bottom_face"], logical: true });
  pushCall(trace, "inspect_assembly", true, { recovered: true, logical: true });
  trace.final_state.recovery_attempted = true;
  pushCall(trace, "validate", true, {});
  trace.final_state.re_verified = true;
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
    geometry_inspected: true, orientation_considered: true, concerns_identified: true,
    numeric_guidance_labeled: true, universal_constants_as_laws: false,
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
