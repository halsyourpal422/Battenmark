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

export const ENCLOSURE_SCORER_SEMANTICS_VERSION = "battenmark.phase7c.enclosure-scorer.v2";

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function approximately(value, expected) {
  const number = finiteNumber(value);
  return number !== null && Math.abs(number - expected) < 1e-6;
}

function dimensionsMatch(values, expected) {
  const actual = values.map(finiteNumber);
  if (actual.some((value) => value === null)) return false;
  return [...actual]
    .sort((a, b) => a - b)
    .every((value, index) => approximately(value, [...expected].sort((a, b) => a - b)[index]));
}

function evidenceIdentity(call, index) {
  return String(
    call?.data?.id ??
      call?.details?.feature_id ??
      call?.details?.id ??
      call?.id ??
      call?.call_id ??
      call?.order ??
      `enclosure-call-${index + 1}`,
  );
}

function callKeys(call, index) {
  return new Set(
    [
      evidenceIdentity(call, index),
      call?.id,
      call?.call_id,
      call?.data?.id,
      call?.details?.feature_id,
      call?.details?.id,
      call?.args?.feature_id,
      call?.args?.name,
    ]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .map(String),
  );
}

function matchingProfile(calls, pocketIndex) {
  const pocket = calls[pocketIndex];
  const sketchId = pocket?.args?.sketch_id;
  for (let index = pocketIndex - 1; index >= 0; index -= 1) {
    const candidate = calls[index];
    if (candidate?.ok === false || candidate?.name !== "add_rectangle") continue;
    if (sketchId && candidate.args?.sketch_id !== sketchId) continue;
    return { call: candidate, index };
  }
  return null;
}

function matchingSketch(calls, profileIndex) {
  const profile = calls[profileIndex];
  const sketchId = profile?.args?.sketch_id;
  let nearest = null;
  for (let index = profileIndex - 1; index >= 0; index -= 1) {
    const candidate = calls[index];
    if (candidate?.ok === false || candidate?.name !== "create_sketch") continue;
    if (!nearest) nearest = candidate;
    const keys = [candidate.data?.id, candidate.args?.sketch_id, candidate.args?.name]
      .filter(Boolean)
      .map(String);
    if (sketchId && keys.includes(String(sketchId))) return candidate;
  }
  return nearest;
}

function matchingBooleanTool(calls, booleanIndex) {
  const operation = calls[booleanIndex];
  const tool = operation?.args?.tool_body_id ?? operation?.args?.tool;
  for (let index = booleanIndex - 1; index >= 0; index -= 1) {
    const candidate = calls[index];
    if (candidate?.ok === false || candidate?.name !== "create_box") continue;
    const keys = [candidate.args?.body_id, candidate.args?.name, candidate.data?.body_id];
    if (tool && keys.filter(Boolean).map(String).includes(String(tool))) return candidate;
  }
  return null;
}

function isSubtractiveBoolean(call) {
  return (
    call?.ok !== false &&
    (call?.name === "boolean_cut" ||
      (call?.name === "boolean" && call?.args?.operation === "subtract"))
  );
}

export function classifyEnclosureEvidence(scenario, trace) {
  const calls = Array.isArray(trace?.tool_calls) ? trace.tool_calls : [];
  const fixture = scenario?.fixture || {};
  const innerLength = fixture.pcb_l_mm + 2 * fixture.clearance_mm;
  const innerWidth = fixture.pcb_w_mm + 2 * fixture.clearance_mm;
  const cavityDepth = fixture.pcb_h_mm + fixture.clearance_mm;
  const wall = fixture.wall_mm;
  const deleted = [];

  calls.forEach((call, index) => {
    if (call?.ok === false || call?.name !== "delete_feature") return;
    const key = call.args?.feature_id;
    if (key !== undefined) deleted.push({ key: String(key), index });
  });

  const stillExists = (call, index) => {
    const keys = callKeys(call, index);
    return !deleted.some((item) => item.index > index && keys.has(item.key));
  };

  const cavityCandidates = [];
  const openingCandidates = [];

  calls.forEach((call, index) => {
    if (call?.ok === false || !stillExists(call, index)) return;
    const id = evidenceIdentity(call, index);

    if (isSubtractiveBoolean(call)) {
      const tool = matchingBooleanTool(calls, index);
      if (tool) {
        const args = tool.args || {};
        const origin = args.origin || {};
        const cavitySized =
          dimensionsMatch([args.length_mm, args.width_mm], [innerLength, innerWidth]) &&
          approximately(args.height_mm, cavityDepth) &&
          approximately(origin.x, wall) &&
          approximately(origin.y, wall) &&
          approximately(origin.z, wall);
        if (cavitySized) cavityCandidates.push({ id, index, kind: "interior-boolean" });

        const connectorSized = dimensionsMatch(
          [args.length_mm, args.width_mm, args.height_mm],
          [wall, fixture.usb_w_mm, fixture.usb_h_mm],
        );
        const connectorIntent = /usb|connector|opening/i.test(
          `${args.name || ""} ${call.args?.name || ""}`,
        );
        if (connectorSized && connectorIntent)
          openingCandidates.push({ id, index, kind: "connector-boolean" });
      }
    }

    if (call?.name === "pocket") {
      const profileMatch = matchingProfile(calls, index);
      if (!profileMatch) return;
      const profileArgs = profileMatch.call.args || {};
      const sketch = matchingSketch(calls, profileMatch.index);
      const pocketDepth = call.args?.depth_mm;
      const cavitySized =
        dimensionsMatch([profileArgs.width_mm, profileArgs.height_mm], [innerLength, innerWidth]) &&
        approximately(profileArgs.x_mm, wall) &&
        approximately(profileArgs.y_mm, wall) &&
        approximately(pocketDepth, cavityDepth) &&
        sketch?.args?.plane === "XY";
      if (cavitySized) cavityCandidates.push({ id, index, kind: "interior-pocket" });

      const connectorSized =
        dimensionsMatch(
          [profileArgs.width_mm, profileArgs.height_mm],
          [fixture.usb_w_mm, fixture.usb_h_mm],
        ) && approximately(pocketDepth, wall);
      const connectorIntent = /usb|connector|opening/i.test(
        `${sketch?.args?.name || ""} ${call.args?.name || ""}`,
      );
      const connectorPlane = ["XZ", "YZ"].includes(sketch?.args?.plane);
      if (connectorSized && connectorIntent && connectorPlane)
        openingCandidates.push({ id, index, kind: "connector-pocket" });
    }
  });

  const cavity = cavityCandidates[0] ?? null;
  const opening = openingCandidates.find((candidate) => candidate.id !== cavity?.id) ?? null;
  return {
    cavity_present: Boolean(cavity),
    opening_present: Boolean(opening),
    cavity_evidence_id: cavity?.id ?? null,
    opening_evidence_id: opening?.id ?? null,
    evidence_distinct: Boolean(cavity && opening && cavity.id !== opening.id),
  };
}

export async function loadScenario(id) {
  const path = join(SCENARIOS, `${id}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listScenarios() {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(SCENARIOS);
  return files
    .filter((f) => f.endsWith(".json") && !f.startsWith("._"))
    .map((f) => f.replace(/\.json$/, ""));
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
  const recoveryFixture = scenario.fixture?.structured_error;

  const hasCall = (...names) => names.some((n) => callNames.includes(n));
  const hasOkCall = (name) => calls.some((c) => c.name === name && c.ok !== false);
  const schemaErrors = errors.filter((e) =>
    /SCHEMA|INVALID_|UNKNOWN_/.test(String(e.code || e.message || "")),
  );
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
    checks.feature_applied =
      hasCall("create_hole", "fillet", "chamfer", "boolean") || Boolean(state.feature_applied);
  if (scenario.required_checks.includes("validated"))
    checks.validated = hasOkCall("validate") || Boolean(state.validated);
  if (scenario.required_checks.includes("preview_rendered"))
    checks.preview_rendered = hasOkCall("render_preview") || Boolean(state.preview_rendered);
  if (scenario.required_checks.includes("artifact_exported")) {
    const exported =
      hasOkCall("export_step") ||
      hasOkCall("export_fcstd") ||
      hasOkCall("export_assembly") ||
      arts.length > 0 ||
      Boolean(state.artifact_exported);
    checks.artifact_exported = exported;
    if (
      !exported &&
      scenario.hard_failures.includes("missing_export_claim") &&
      trace.completion_status === "complete"
    )
      hard.push("missing_export_claim");
  }
  if (scenario.required_checks.includes("no_schema_errors"))
    checks.no_schema_errors =
      schemaErrors.length === 0 &&
      calls.every((c) => c.ok !== false || !/SCHEMA/.test(String(c.error || "")));
  if (scenario.required_checks.includes("public_ops_only")) checks.public_ops_only = !privateBypass;

  if (scenario.required_checks.includes("measurements_as_parameters"))
    checks.measurements_as_parameters =
      hasCall("define_parameter") || Boolean(state.measurements_as_parameters);
  if (scenario.required_checks.includes("outer_shell_created"))
    checks.outer_shell_created = hasOkCall("create_box") || Boolean(state.outer_shell_created);
  const enclosureEvidence =
    scenario.required_checks.includes("cavity_present") ||
    scenario.required_checks.includes("opening_present")
      ? classifyEnclosureEvidence(scenario, trace)
      : null;
  if (scenario.required_checks.includes("cavity_present"))
    checks.cavity_present = enclosureEvidence.cavity_present;
  if (scenario.required_checks.includes("opening_present"))
    checks.opening_present = enclosureEvidence.opening_present;
  if (scenario.required_checks.includes("no_invented_dimensions"))
    checks.no_invented_dimensions =
      !notes.some((n) => /invented.?dimension/i.test(n)) && state.invented_dimensions !== true;

  if (scenario.required_checks.includes("components_defined"))
    checks.components_defined = hasOkCall("define_component") || Boolean(state.components_defined);
  if (scenario.required_checks.includes("instances_created"))
    checks.instances_created = hasOkCall("create_instance") || Boolean(state.instances_created);
  if (scenario.required_checks.includes("reference_grounded")) {
    checks.reference_grounded = hasOkCall("fix_instance") || Boolean(state.reference_grounded);
    if (!checks.reference_grounded && scenario.hard_failures.includes("ungrounded_reference"))
      hard.push("ungrounded_reference");
  }
  if (scenario.required_checks.includes("constraint_applied"))
    checks.constraint_applied =
      hasOkCall("mate_faces") ||
      hasOkCall("align_axes") ||
      hasOkCall("set_distance") ||
      Boolean(state.constraint_applied);
  if (scenario.required_checks.includes("inspect_assembly_called"))
    checks.inspect_assembly_called =
      hasOkCall("inspect_assembly") || Boolean(state.inspect_assembly_called);
  if (scenario.required_checks.includes("remaining_dof_3")) {
    const dof = state.remaining_dof;
    const ok = dof === 3 || dof === "3";
    checks.remaining_dof_3 = ok;
    if (!ok && scenario.hard_failures.includes("wrong_dof")) hard.push("wrong_dof");
  }
  if (scenario.required_checks.includes("interference_checked"))
    checks.interference_checked =
      hasOkCall("check_interference") || Boolean(state.interference_checked);
  if (scenario.required_checks.includes("no_overconstraint")) {
    const conflict =
      errors.some((e) => e.code === "CONSTRAINT_CONFLICT") || state.constraint_conflict === true;
    checks.no_overconstraint = !conflict;
    if (conflict && scenario.hard_failures.includes("constraint_conflict"))
      hard.push("constraint_conflict");
  }

  if (scenario.required_checks.includes("error_recorded"))
    checks.error_recorded = errors.length > 0 || Boolean(state.error_recorded);
  const injectedErrorIndex = recoveryFixture
    ? calls.findIndex(
        (call) =>
          call.ok === false && String(call.code || call.error || "").includes(recoveryFixture.code),
      )
    : -1;
  const isChangedRecoveryCall = (call) => {
    if (!recoveryFixture?.correction_operations?.includes(call.name)) return false;
    if (call.args?.body_id !== recoveryFixture.args?.body_id) return false;
    if (
      call.name === recoveryFixture.operation &&
      call.args?.entity !== recoveryFixture.args?.entity
    )
      return false;
    const selector = call.args?.selector;
    if (selector === undefined || selector === null || selector === "") return false;
    return !JSON.stringify(selector).includes(recoveryFixture.stale_reference);
  };
  const recoveryAttemptIndex =
    injectedErrorIndex >= 0
      ? calls.findIndex((call, index) => index > injectedErrorIndex && isChangedRecoveryCall(call))
      : -1;
  const recoverySuccessIndex =
    injectedErrorIndex >= 0
      ? calls.findIndex(
          (call, index) =>
            index > injectedErrorIndex && isChangedRecoveryCall(call) && call.ok !== false,
        )
      : -1;
  const reverifyIndex =
    recoverySuccessIndex >= 0
      ? calls.findIndex(
          (call, index) =>
            index > recoverySuccessIndex &&
            recoveryFixture.reverification_operations.includes(call.name) &&
            call.ok !== false,
        )
      : -1;
  if (scenario.required_checks.includes("error_observed"))
    checks.error_observed = injectedErrorIndex >= 0;
  if (scenario.required_checks.includes("status_or_capabilities_inspected"))
    checks.status_or_capabilities_inspected =
      hasCall("kernel_status", "inspect_backend_capabilities") || Boolean(state.status_inspected);
  if (scenario.required_checks.includes("recovery_attempted"))
    checks.recovery_attempted = recoveryFixture
      ? recoveryAttemptIndex >= 0
      : Boolean(state.recovery_attempted);
  if (scenario.required_checks.includes("recovery_succeeded"))
    checks.recovery_succeeded = recoverySuccessIndex >= 0;
  if (scenario.required_checks.includes("re_verified"))
    checks.re_verified = recoveryFixture
      ? reverifyIndex >= 0
      : Boolean(state.re_verified) || hasCall("validate", "inspect_document", "inspect_assembly");
  if (scenario.required_checks.includes("no_private_bypass")) {
    checks.no_private_bypass = !privateBypass;
    if (privateBypass) hard.push("private_backend_access");
  }

  if (scenario.required_checks.includes("geometry_inspected"))
    checks.geometry_inspected =
      hasCall("inspect_document", "inspect_body", "query_geometry") ||
      Boolean(state.geometry_inspected);
  if (scenario.required_checks.includes("orientation_considered"))
    checks.orientation_considered =
      Boolean(state.orientation_considered) || notes.some((n) => /orientation/i.test(n));
  if (scenario.required_checks.includes("concerns_identified"))
    checks.concerns_identified =
      Boolean(state.concerns_identified) || notes.some((n) => /thin|overhang|hole|wall/i.test(n));
  if (scenario.required_checks.includes("numeric_guidance_labeled"))
    checks.numeric_guidance_labeled = state.numeric_guidance_labeled !== false;
  if (scenario.required_checks.includes("no_universal_constants_as_laws")) {
    const bad =
      state.universal_constants_as_laws === true ||
      notes.some((n) => /universal.?law|always.?must/i.test(n));
    checks.no_universal_constants_as_laws = !bad;
    if (bad) hard.push("universal_constants_as_laws");
  }

  if (privateBypass && scenario.hard_failures.includes("schema_bypass")) hard.push("schema_bypass");
  if (
    privateBypass &&
    scenario.hard_failures.includes("private_backend_access") &&
    !hard.includes("private_backend_access")
  )
    hard.push("private_backend_access");

  const req = scenario.required_checks || [];
  const passed = req.filter((k) => checks[k] === true).length;
  const frac = req.length ? passed / req.length : 0;

  const taskKeys = req.filter(
    (k) =>
      !/validated|preview|export|inspect|status|re_verif|schema|public|private|universal|numeric|orientation|concerns/.test(
        k,
      ),
  );
  const verifKeys = req.filter((k) =>
    /validated|preview|export|inspect|status|re_verif|interference|geometry_inspected/.test(k),
  );
  const apiKeys = req.filter((k) => /schema|public|no_schema/.test(k));
  const recoveryKeys = req.filter((k) =>
    /recovery|re_verif|error_(recorded|observed)|status_or/.test(k),
  );
  const fracOf = (keys) =>
    !keys.length ? 1 : keys.filter((k) => checks[k] === true).length / keys.length;

  const w = scenario.weights || {
    task_correctness: 40,
    verification_discipline: 25,
    api_schema_correctness: 15,
    recovery_behavior: 10,
    efficiency: 10,
  };
  const failedCalls = calls.filter((c) => c.ok === false).length;
  const efficiencyScore =
    calls.length === 0 ? 0.5 : Math.max(0, 1 - failedCalls / Math.max(calls.length, 1));

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
      if (g === "render_preview" || g === "preview")
        return checks.preview_rendered || hasCall("render_preview");
      if (g === "export") return checks.artifact_exported;
      if (g === "inspect_assembly") return checks.inspect_assembly_called;
      if (g === "check_interference") return checks.interference_checked;
      if (g === "inspect_status") return checks.status_or_capabilities_inspected;
      if (g === "retry" || g === "re_verify")
        return checks.re_verified || checks.recovery_attempted;
      if (g === "inspect" || g === "review")
        return checks.geometry_inspected || checks.concerns_identified;
      return false;
    }).length,
    verification_gates_total: (scenario.verification_gates || []).length,
  };
  if (enclosureEvidence) metrics.enclosure_evidence = enclosureEvidence;

  return { score, verdict, checks, hard_failures: uniqueHard, metrics };
}

export function interpretDelta(delta) {
  if (delta >= 15) return "CLEAR BENEFIT";
  if (delta >= 5) return "MIXED";
  if (delta > -5) return "NO MEASURABLE BENEFIT";
  return "REGRESSION";
}
