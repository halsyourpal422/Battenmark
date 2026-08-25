/**
 * Phase 7C — CAD skill evaluation scorer.
 * Scores observable traces against scenario required_checks and hard_failures.
 * Does NOT trust agent prose. Deterministic given the same trace + scenario.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SCENARIOS = join(__dirname, "scenarios");

export async function loadScenario(id) {
  const path = join(SCENARIOS, `${id}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listScenarios() {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(SCENARIOS);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

export function loadSkillText(skillId) {
  const path = join(ROOT, "skills", skillId, "SKILL.md");
  return readFile(path, "utf8");
}

export function skillContextCost(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const approx_tokens = Math.ceil(chars / 4);
  return { chars, words, approx_tokens };
}

export function scoreTrace(scenario, trace) {
  const checks = {};
  const hard = [];
  const calls = Array.isArray(trace.tool_calls) ? trace.tool_calls : [];
  const callNames = calls.map((c) => c.name);
  const state = trace.final_state || {};
  const arts = Array.isArray(trace.artifact_ids) ? trace.artifact_ids : [];
  const notes = Array.isArray(trace.notes) ? trace.notes : [];
  const errors = Array.isArray(trace.errors) ? trace.errors : [];

  const hasCall = (...names) => names.some((n) => callNames.includes(n));
  const hasOkCall = (name) => calls.some((c) => c.name === name && c.ok !== false);
  const schemaErrors = errors.filter((e) => /SCHEMA|INVALID_|UNKNOWN_/.test(String(e.code || e.message || "")));
  const privateBypass =
    notes.some((n) => /private.?freecad|worker\.py|bypass.?schema/i.test(n)) ||
    callNames.some((n) => /freecad_python|exec_shell|eval_code/.test(n));

  if (scenario.required_checks.includes("project_created"))
    checks.project_created = hasOkCall("project_create") || Boolean(state.project_id);
  if (scenario.required_checks.includes("parameters_defined"))
    checks.parameters_defined = hasCall("define_parameter") || Boolean(state.parameters_count > 0);
  if (scenario.required_checks.includes("box_created"))
    checks.box_created = hasOkCall("create_box") || Boolean(state.box_created);
  if (scenario.required_checks.includes("feature_applied"))
    checks.feature_applied = hasCall("create_hole", "fillet", "chamfer", "boolean") || Boolean(state.feature_applied);
  if (scenario.required_checks.includes("validated"))
    checks.validated = hasOkCall("validate") || Boolean(state.validated);
  if (scenario.required_checks.includes("preview_rendered"))
    checks.preview_rendered = hasOkCall("render_preview") || Boolean(state.preview_rendered);
  if (scenario.required_checks.includes("artifact_exported")) {
    const exported = hasCall("export_step", "export_fcstd", "export_assembly") || arts.length > 0 || Boolean(state.artifact_exported);
    checks.artifact_exported = exported;
    if (!exported && scenario.hard_failures.includes("missing_export_claim") && trace.completion_status === "complete")
      hard.push("missing_export_claim");
  }
  if (scenario.required_checks.includes("no_schema_errors"))
    checks.no_schema_errors = schemaErrors.length === 0 && calls.every((c) => c.ok !== false || !/SCHEMA/.test(String(c.error || "")));
  if (scenario.required_checks.includes("public_ops_only"))
    checks.public_ops_only = !privateBypass;

  if (scenario.required_checks.includes("measurements_as_parameters"))
    checks.measurements_as_parameters = hasCall("define_parameter") || Boolean(state.measurements_as_parameters);
  if (scenario.required_checks.includes("outer_shell_created"))
    checks.outer_shell_created = hasOkCall("create_box") || Boolean(state.outer_shell_created);
  if (scenario.required_checks.includes("cavity_present"))
    checks.cavity_present = hasCall("boolean", "pocket") || Boolean(state.cavity_present);
  if (scenario.required_checks.includes("opening_present"))
    checks.opening_present = hasCall("create_hole", "boolean", "pocket") || Boolean(state.opening_present);
  if (scenario.required_checks.includes("no_invented_dimensions"))
    checks.no_invented_dimensions = !notes.some((n) => /invented.?dimension/i.test(n)) && state.invented_dimensions !== true;

  if (scenario.required_checks.includes("components_defined"))
    checks.components_defined = hasOkCall("define_component") || Boolean(state.components_defined);
  if (scenario.required_checks.includes("instances_created"))
    checks.instances_created = hasOkCall("create_instance") || Boolean(state.instances_created);
  if (scenario.required_checks.includes("reference_grounded")) {
    checks.reference_grounded = hasOkCall("fix_instance") || Boolean(state.reference_grounded);
    if (!checks.reference_grounded && scenario.hard_failures.includes("ungrounded_reference")) hard.push("ungrounded_reference");
  }
  if (scenario.required_checks.includes("constraint_applied"))
    checks.constraint_applied = hasCall("mate_faces", "align_axes", "set_distance") || Boolean(state.constraint_applied);
  if (scenario.required_checks.includes("inspect_assembly_called"))
    checks.inspect_assembly_called = hasOkCall("inspect_assembly") || Boolean(state.inspect_assembly_called);
  if (scenario.required_checks.includes("remaining_dof_3")) {
    const dof = state.remaining_dof;
    const ok = dof === 3 || dof === "3";
    checks.remaining_dof_3 = ok;
    if (!ok && scenario.hard_failures.includes("wrong_dof")) hard.push("wrong_dof");
  }
  if (scenario.required_checks.includes("interference_checked"))
    checks.interference_checked = hasOkCall("check_interference") || Boolean(state.interference_checked);
  if (scenario.required_checks.includes("no_overconstraint")) {
    const conflict = errors.some((e) => e.code === "CONSTRAINT_CONFLICT") || state.constraint_conflict === true;
    checks.no_overconstraint = !conflict;
    if (conflict && scenario.hard_failures.includes("constraint_conflict")) hard.push("constraint_conflict");
  }

  if (scenario.required_checks.includes("error_recorded"))
    checks.error_recorded = errors.length > 0 || Boolean(state.error_recorded);
  if (scenario.required_checks.includes("status_or_capabilities_inspected"))
    checks.status_or_capabilities_inspected = hasCall("kernel_status", "inspect_backend_capabilities") || Boolean(state.status_inspected);
  if (scenario.required_checks.includes("recovery_attempted"))
    checks.recovery_attempted = Boolean(state.recovery_attempted) || calls.filter((c) => c.ok === false).length < calls.length;
  if (scenario.required_checks.includes("re_verified"))
    checks.re_verified = Boolean(state.re_verified) || hasCall("validate", "inspect_document", "inspect_assembly");
  if (scenario.required_checks.includes("no_private_bypass")) {
    checks.no_private_bypass = !privateBypass;
    if (privateBypass) hard.push("private_backend_access");
  }

  if (scenario.required_checks.includes("geometry_inspected"))
    checks.geometry_inspected = hasCall("inspect_document", "inspect_body", "query_geometry") || Boolean(state.geometry_inspected);
  if (scenario.required_checks.includes("orientation_considered"))
    checks.orientation_considered = Boolean(state.orientation_considered) || notes.some((n) => /orientation/i.test(n));
  if (scenario.required_checks.includes("concerns_identified"))
    checks.concerns_identified = Boolean(state.concerns_identified) || notes.some((n) => /thin|overhang|hole|wall/i.test(n));
  if (scenario.required_checks.includes("numeric_guidance_labeled"))
    checks.numeric_guidance_labeled = state.numeric_guidance_labeled !== false;
  if (scenario.required_checks.includes("no_universal_constants_as_laws")) {
    const bad = state.universal_constants_as_laws === true || notes.some((n) => /universal.?law|always.?must/i.test(n));
    checks.no_universal_constants_as_laws = !bad;
    if (bad) hard.push("universal_constants_as_laws");
  }

  if (privateBypass && scenario.hard_failures.includes("schema_bypass")) hard.push("schema_bypass");
  if (privateBypass && scenario.hard_failures.includes("private_backend_access") && !hard.includes("private_backend_access"))
    hard.push("private_backend_access");

  const req = scenario.required_checks || [];
  const passed = req.filter((k) => checks[k] === true).length;
  const frac = req.length ? passed / req.length : 0;

  const taskKeys = req.filter((k) => !/validated|preview|export|inspect|status|re_verif|schema|public|private|universal|numeric|orientation|concerns/.test(k));
  const verifKeys = req.filter((k) => /validated|preview|export|inspect|status|re_verif|interference|geometry_inspected/.test(k));
  const apiKeys = req.filter((k) => /schema|public|no_schema/.test(k));
  const recoveryKeys = req.filter((k) => /recovery|re_verif|error_recorded|status_or/.test(k));
  const fracOf = (keys) => (!keys.length ? 1 : keys.filter((k) => checks[k] === true).length / keys.length);

  const w = scenario.weights || { task_correctness: 40, verification_discipline: 25, api_schema_correctness: 15, recovery_behavior: 10, efficiency: 10 };
  const failedCalls = calls.filter((c) => c.ok === false).length;
  const efficiencyScore = calls.length === 0 ? 0.5 : Math.max(0, 1 - failedCalls / Math.max(calls.length, 1));

  let score =
    fracOf(taskKeys) * w.task_correctness +
    fracOf(verifKeys) * w.verification_discipline +
    fracOf(apiKeys) * w.api_schema_correctness +
    (recoveryKeys.length ? fracOf(recoveryKeys) : frac) * w.recovery_behavior +
    efficiencyScore * w.efficiency;

  const uniqueHard = [...new Set(hard)];
  if (uniqueHard.length) score = Math.min(score, 40);
  score = Math.round(Math.max(0, Math.min(100, score)));

  let verdict = "PASS";
  if (uniqueHard.length) verdict = "FAIL";
  else if (frac < 1 || score < 80) verdict = frac >= 0.5 ? "PARTIAL" : "FAIL";

  const metrics = {
    checks_passed: passed,
    checks_total: req.length,
    check_fraction: Math.round(frac * 1000) / 1000,
    tool_calls: calls.length,
    failed_calls: failedCalls,
    invalid_call_rate: calls.length ? Math.round((failedCalls / calls.length) * 1000) / 1000 : 0,
    schema_errors: schemaErrors.length,
    artifact_count: arts.length,
    verification_gate_hits: (scenario.verification_gates || []).filter((g) => {
      if (g === "validate") return checks.validated || hasCall("validate");
      if (g === "render_preview" || g === "preview") return checks.preview_rendered || hasCall("render_preview");
      if (g === "export") return checks.artifact_exported;
      if (g === "inspect_assembly") return checks.inspect_assembly_called;
      if (g === "check_interference") return checks.interference_checked;
      if (g === "inspect_status") return checks.status_or_capabilities_inspected;
      if (g === "retry" || g === "re_verify") return checks.re_verified || checks.recovery_attempted;
      if (g === "inspect" || g === "review") return checks.geometry_inspected || checks.concerns_identified;
      return false;
    }).length,
    verification_gates_total: (scenario.verification_gates || []).length,
  };

  return { score, verdict, checks, hard_failures: uniqueHard, metrics };
}

export function interpretDelta(delta) {
  if (delta >= 15) return "CLEAR BENEFIT";
  if (delta >= 5) return "MIXED";
  if (delta > -5) return "NO MEASURABLE BENEFIT";
  return "REGRESSION";
}
