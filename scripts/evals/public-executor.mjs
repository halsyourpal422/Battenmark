/**
 * Phase 7C.2 — Public-operation executor for evaluation.
 * Rejects privileged/private tools. Never touches backend internals.
 */
const PRIVATE_NAMES = /freecad_python|exec_shell|eval_code|eval_python|worker\.py/i;

let cached = null;

export async function loadPublicCatalog() {
  if (cached) return cached;
  const schema = await import("../../src/cad/schema.ts");
  cached = {
    names: new Set(schema.TOOL_NAMES),
    entries: schema.TOOL_CATALOG.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: t.properties || {}, required: t.required || [] },
    })),
    validateToolArgs: schema.validateToolArgs,
    isPrivilegedTool: schema.isPrivilegedTool,
  };
  return cached;
}

export function privilegedRejected(name, catalog) {
  if (PRIVATE_NAMES.test(name)) return true;
  if (catalog?.isPrivilegedTool?.(name)) return true;
  return false;
}

export async function executePublicTool(name, args = {}, { catalog, state } = {}) {
  const cat = catalog || (await loadPublicCatalog());
  if (privilegedRejected(name, cat)) {
    return { ok: false, code: "PRIVILEGED_TOOL", error: `private or privileged tool ${name}` };
  }
  if (!cat.names.has(name)) {
    return { ok: false, code: "UNKNOWN_TOOL", error: `unknown public tool ${name}` };
  }
  const invalid = cat.validateToolArgs ? cat.validateToolArgs(name, args) : null;
  if (invalid) {
    return { ok: false, code: "SCHEMA_ERROR", error: String(invalid) };
  }

  const next = { ...(state || {}) };
  if (name === "project_create") next.project_id = args.name || args.project_id || "eval-project";
  if (name === "define_parameter") next.parameters_count = (next.parameters_count || 0) + 1;
  if (name === "create_box") {
    next.box_created = true;
    next.outer_shell_created = true;
  }
  if (name === "create_hole" || name === "fillet" || name === "chamfer" || name === "boolean") next.feature_applied = true;
  if (name === "validate") next.validated = true;
  if (name === "render_preview") next.preview_rendered = true;
  if (name === "export_step" || name === "export_fcstd" || name === "export_assembly") {
    next.artifact_exported = true;
    return { ok: true, state: next, artifact_id: `${name}-artifact`, observation: `${name} ok` };
  }
  if (name === "define_component") next.components_defined = true;
  if (name === "create_instance") next.instances_created = true;
  if (name === "fix_instance") next.reference_grounded = true;
  if (name === "mate_faces" || name === "mate_axis" || name === "add_constraint") next.constraint_applied = true;
  if (name === "inspect_assembly") {
    next.inspect_assembly_called = true;
    next.remaining_dof = 3;
  }
  if (name === "check_interference") next.interference_checked = true;
  return { ok: true, state: next, observation: `${name} ok` };
}
