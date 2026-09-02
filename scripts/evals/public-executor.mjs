/**
 * Phase 7C.2 — Public-operation executor for evaluation.
 * Rejects privileged/private tools. Never touches backend internals.
 */
const PRIVATE_NAMES = /freecad_python|exec_shell|eval_code|eval_python|worker\.py/i;
const EVALUATION_REGISTRY = Symbol.for("battenmark.eval.object-registry");
const PUBLIC_INSPECTION_LIMIT = 24;

const ASSEMBLY_CONSTRAINT_OPERATIONS = new Set([
  "mate_faces",
  "align_axes",
  "set_distance",
  "set_angle",
  "set_parallel",
  "set_perpendicular",
]);

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

export function createEvaluationFixture(scenario) {
  const fixture = scenario?.fixture?.structured_error;
  let injectionCount = 0;
  return {
    get injectionCount() {
      return injectionCount;
    },
    async inject() {
      if (!fixture || injectionCount > 0) return null;
      injectionCount += 1;
      const details = {
        reference: fixture.stale_reference,
        entity: fixture.entity,
        suggestion: fixture.suggestion,
      };
      const result = {
        ok: false,
        code: fixture.code,
        error: fixture.message,
        details,
        observation: JSON.stringify({
          ok: false,
          error: {
            code: fixture.code,
            message: fixture.message,
            ...details,
          },
        }),
      };
      return {
        call_id: `fixture:${scenario.id}:structured-error:1`,
        name: fixture.operation,
        args: structuredClone(fixture.args),
        result,
      };
    },
  };
}

function freshRegistry() {
  return {
    project: null,
    document: null,
    bodies: [],
    features: [],
    assemblies: [],
    artifacts: [],
  };
}

function cloneRegistry(state) {
  return structuredClone(state?.[EVALUATION_REGISTRY] || freshRegistry());
}

function nextState(state) {
  const next = { ...(state || {}) };
  next[EVALUATION_REGISTRY] = cloneRegistry(state);
  return next;
}

function registryOf(state) {
  return state[EVALUATION_REGISTRY];
}

function nextIdentity(prefix, items, field) {
  let index = items.length + 1;
  let candidate = `${prefix}_${index}`;
  while (items.some((item) => item[field] === candidate)) {
    index += 1;
    candidate = `${prefix}_${index}`;
  }
  return candidate;
}

function nextPublicName(base, items) {
  const names = new Set(items.map((item) => item.name));
  if (!names.has(base)) return base;
  for (let index = 1; index < 10_000; index++) {
    const candidate = `${base}${String(index).padStart(3, "0")}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base}_${items.length + 1}`;
}

function findBody(registry, identity) {
  return registry.bodies.find((body) => body.body_id === identity || body.name === identity);
}

function findAssembly(registry, identity) {
  return registry.assemblies.find(
    (assembly) => assembly.assembly_id === identity || assembly.name === identity,
  );
}

function findComponent(assembly, identity) {
  return assembly?.components.find((component) => component.component_id === identity);
}

function findInstance(assembly, identity) {
  return assembly?.instances.find((instance) => instance.instance_id === identity);
}

function successful(name, state, data, extra = {}) {
  return {
    ok: true,
    state,
    ...(data === undefined ? {} : { data }),
    observation: `${name} ok`,
    ...extra,
  };
}

function referenceFailure(name, state, code, message, details = {}) {
  return {
    ok: false,
    code,
    error: message,
    details,
    state,
    observation: JSON.stringify({ ok: false, error: { code, message, ...details } }),
  };
}

function requireAssembly(name, state, identity) {
  const assembly = findAssembly(registryOf(state), identity);
  if (assembly) return { assembly };
  return {
    error: referenceFailure(
      name,
      state,
      "ASSEMBLY_NOT_FOUND",
      `Assembly '${identity}' was not found.`,
      { suggestion: "Call create_assembly first." },
    ),
  };
}

function publicDocument(registry) {
  const bodies = registry.bodies.slice(0, PUBLIC_INSPECTION_LIMIT).map((body) => ({
    id: body.body_id,
    name: body.name,
    visible: true,
    consumed: false,
    volume_mm3: null,
    bbox: null,
    triangle_count: null,
    valid: null,
    features: registry.features
      .filter((feature) => feature.body_id === body.body_id)
      .slice(0, PUBLIC_INSPECTION_LIMIT)
      .map((feature) => ({
        id: feature.feature_id,
        name: feature.name,
        kind: feature.kind,
        summary: feature.summary,
        suppressed: false,
        depends_on: [],
      })),
  }));
  return {
    id: registry.document?.document_id || "doc_1",
    name: registry.document?.name || "Untitled",
    units: "mm",
    parameters: [],
    bodies,
    feature_count: registry.features.length,
    revision_count: 0,
    current_revision: null,
    validation: null,
    ...(registry.bodies.length > PUBLIC_INSPECTION_LIMIT ? { bodies_truncated: true } : {}),
  };
}

function remainingDofFor(assembly, instance) {
  if (instance.fixed) return 0;
  const constrained = assembly.constraints.some(
    (constraint) =>
      constraint.kind === "mate_faces" &&
      (constraint.a_instance === instance.instance_id ||
        constraint.b_instance === instance.instance_id),
  );
  return constrained ? 3 : 6;
}

function inspectAssemblyData(assembly) {
  const instances = assembly.instances.slice(0, PUBLIC_INSPECTION_LIMIT).map((instance) => {
    const remainingDof = remainingDofFor(assembly, instance);
    return {
      id: instance.instance_id,
      component_id: instance.component_id,
      fixed: instance.fixed,
      transform: instance.transform,
      remaining_dof: remainingDof,
      free_translation: remainingDof === 3 ? ["x", "y"] : remainingDof === 6 ? ["x", "y", "z"] : [],
      free_rotation:
        remainingDof === 3
          ? ["about_z"]
          : remainingDof === 6
            ? ["about_x", "about_y", "about_z"]
            : [],
    };
  });
  return {
    assembly_id: assembly.assembly_id,
    name: assembly.name,
    definitions: assembly.components.slice(0, PUBLIC_INSPECTION_LIMIT).map((component) => ({
      id: component.component_id,
      name: component.name,
      source: component.source,
      parametric: component.source === "native",
      bodies: component.body_ids.length,
      features: component.feature_count,
      parameters: [],
    })),
    instances,
    constraints: assembly.constraints.slice(0, PUBLIC_INSPECTION_LIMIT).map((constraint) => ({
      id: constraint.constraint_id,
      kind: constraint.kind,
      status: "applied",
    })),
    solved: true,
    constraint_state: assembly.constraints.length ? "underconstrained" : "unsolved",
    remaining_dof_total: instances.reduce((total, instance) => total + instance.remaining_dof, 0),
    world_bbox: null,
    counts: {
      definitions: assembly.components.length,
      instances: assembly.instances.length,
      constraints: assembly.constraints.length,
    },
    ...(assembly.components.length > PUBLIC_INSPECTION_LIMIT ||
    assembly.instances.length > PUBLIC_INSPECTION_LIMIT ||
    assembly.constraints.length > PUBLIC_INSPECTION_LIMIT
      ? { truncated: true }
      : {}),
  };
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

  const next = nextState(state);
  const registry = registryOf(next);
  if (name === "project_create") {
    const projectId = String(args.slug || args.name || args.project_id || "eval-project");
    next.project_id = projectId;
    registry.project = {
      project_id: projectId,
      name: String(args.name || projectId),
      slug: String(args.slug || projectId),
    };
    registry.document = { document_id: "doc_1", name: String(args.name || projectId) };
    registry.bodies = [];
    registry.features = [];
    registry.assemblies = [];
    registry.artifacts = [];
    return successful(name, next, {
      project_id: projectId,
      document_id: registry.document.document_id,
      name: registry.project.name,
      slug: registry.project.slug,
    });
  }
  if (name === "project_open") {
    const requested = String(args.project_id || "");
    if (
      !registry.project ||
      (requested !== registry.project.project_id && requested !== registry.project.slug)
    ) {
      return referenceFailure(
        name,
        next,
        "PROJECT_NOT_FOUND",
        `Project '${requested}' was not found.`,
      );
    }
    return successful(name, next, {
      project_id: registry.project.project_id,
      document_id: registry.document.document_id,
      name: registry.project.name,
      slug: registry.project.slug,
      feature_count: registry.features.length,
      parameters: [],
    });
  }
  if (name === "project_inspect") {
    const requested = String(args.project_id || next.project_id || "");
    if (
      !registry.project ||
      (requested !== registry.project.project_id && requested !== registry.project.slug)
    ) {
      return referenceFailure(
        name,
        next,
        "PROJECT_NOT_FOUND",
        `Project '${requested}' was not found.`,
      );
    }
    return successful(name, next, {
      meta: { ...registry.project },
      document: publicDocument(registry),
    });
  }
  if (name === "inspect_document") {
    return successful(name, next, publicDocument(registry));
  }
  if (name === "create_body") {
    const bodyId = nextIdentity("bdy", registry.bodies, "body_id");
    const bodyName = nextPublicName(String(args.name || "Body"), registry.bodies);
    registry.bodies.push({ body_id: bodyId, name: bodyName });
    return successful(name, next, { id: bodyId, name: bodyName });
  }
  if (name === "define_parameter") next.parameters_count = (next.parameters_count || 0) + 1;
  if (name === "create_box") {
    let body;
    if (args.body_id) {
      body = findBody(registry, String(args.body_id));
      if (!body) {
        return referenceFailure(
          name,
          next,
          "UNKNOWN_BODY",
          `Body '${args.body_id}' was not found.`,
          { body: String(args.body_id) },
        );
      }
    } else {
      body = {
        body_id: nextIdentity("bdy", registry.bodies, "body_id"),
        name: nextPublicName("Body", registry.bodies),
      };
      registry.bodies.push(body);
    }
    const featureId = nextIdentity("feat", registry.features, "feature_id");
    const featureName = nextPublicName(String(args.name || "Box"), registry.features);
    const summary = `box ${args.length_mm} × ${args.width_mm} × ${args.height_mm} mm`;
    registry.features.push({
      feature_id: featureId,
      name: featureName,
      kind: "box",
      body_id: body.body_id,
      summary,
    });
    next.box_created = true;
    next.outer_shell_created = true;
    return successful(name, next, {
      id: featureId,
      name: featureName,
      body_id: body.body_id,
      body_name: body.name,
      summary,
    });
  }
  if (name === "create_assembly") {
    const assemblyId = String(
      args.assembly_id || nextIdentity("asm", registry.assemblies, "assembly_id"),
    );
    const assemblyName = String(args.name || assemblyId);
    if (findAssembly(registry, assemblyId) || findAssembly(registry, assemblyName)) {
      return referenceFailure(
        name,
        next,
        "DUPLICATE_NAME",
        `Assembly '${assemblyId}' already exists.`,
      );
    }
    registry.assemblies.push({
      assembly_id: assemblyId,
      name: assemblyName,
      components: [],
      instances: [],
      constraints: [],
    });
    return successful(name, next, { assembly_id: assemblyId, name: assemblyName });
  }
  if (name === "define_component") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const assembly = found.assembly;
    if (args.source_format && !args.source_path) {
      return referenceFailure(
        name,
        next,
        "MALFORMED_REQUEST",
        "source_path is required when source_format is given.",
      );
    }
    const imported = Boolean(args.source_format);
    const requestedBodies = Array.isArray(args.include?.body_ids) ? args.include.body_ids : null;
    const bodies = imported
      ? []
      : requestedBodies
        ? registry.bodies.filter((body) =>
            requestedBodies.some((identity) => identity === body.body_id || identity === body.name),
          )
        : registry.bodies;
    if (!imported && !bodies.length) {
      return referenceFailure(
        name,
        next,
        "EMPTY_SKETCH",
        "No bodies matched this component definition scope.",
      );
    }
    const componentId = String(
      args.component_id || nextIdentity("cmp", assembly.components, "component_id"),
    );
    if (findComponent(assembly, componentId)) {
      return referenceFailure(
        name,
        next,
        "DUPLICATE_NAME",
        `Component '${componentId}' already exists in this assembly.`,
      );
    }
    const bodyIds = bodies.map((body) => body.body_id);
    const featureCount = registry.features.filter((feature) =>
      bodyIds.includes(feature.body_id),
    ).length;
    assembly.components.push({
      component_id: componentId,
      name: String(args.name || componentId),
      body_ids: bodyIds,
      feature_count: featureCount,
      source: imported ? "imported" : "native",
    });
    next.components_defined = true;
    return successful(name, next, {
      assembly_id: assembly.assembly_id,
      component_id: componentId,
      source: imported ? "imported" : "native",
      parametric: !imported,
      bodies: bodyIds.length,
      features: featureCount,
    });
  }
  if (name === "create_instance") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const assembly = found.assembly;
    const component = findComponent(assembly, String(args.component_id));
    if (!component) {
      return referenceFailure(
        name,
        next,
        "COMPONENT_NOT_FOUND",
        `Component '${args.component_id}' was not found.`,
        { assembly: assembly.assembly_id, suggestion: "Call define_component first." },
      );
    }
    let instanceId = String(args.instance_id || `${component.component_id}_1`);
    if (!args.instance_id) {
      let index = 1;
      while (findInstance(assembly, instanceId)) {
        index += 1;
        instanceId = `${component.component_id}_${index}`;
      }
    }
    if (findInstance(assembly, instanceId)) {
      return referenceFailure(
        name,
        next,
        "DUPLICATE_NAME",
        `Instance '${instanceId}' already exists. Instance ids are stable identity.`,
      );
    }
    const transform = {
      translation: {
        x: Number(args.position?.x || 0),
        y: Number(args.position?.y || 0),
        z: Number(args.position?.z || 0),
      },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
    assembly.instances.push({
      instance_id: instanceId,
      component_id: component.component_id,
      fixed: false,
      transform,
    });
    next.instances_created = true;
    return successful(name, next, {
      assembly_id: assembly.assembly_id,
      instance_id: instanceId,
      component_id: component.component_id,
      transform,
    });
  }
  if (name === "fix_instance" || name === "set_instance_transform") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const instance = findInstance(found.assembly, String(args.instance_id));
    if (!instance) {
      return referenceFailure(
        name,
        next,
        "INSTANCE_NOT_FOUND",
        `Instance '${args.instance_id}' was not found.`,
        { assembly: found.assembly.assembly_id },
      );
    }
    if (name === "fix_instance") {
      instance.fixed = true;
      next.reference_grounded = true;
      return successful(name, next, {
        assembly_id: found.assembly.assembly_id,
        instance_id: instance.instance_id,
        fixed: true,
      });
    }
    return successful(name, next, {
      assembly_id: found.assembly.assembly_id,
      instance_id: instance.instance_id,
      transform: instance.transform,
    });
  }
  if (name === "set_definition_parameter") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const component = findComponent(found.assembly, String(args.component_id));
    if (!component) {
      return referenceFailure(
        name,
        next,
        "COMPONENT_NOT_FOUND",
        `Component '${args.component_id}' was not found.`,
        { assembly: found.assembly.assembly_id },
      );
    }
    if (component.source === "imported") {
      return referenceFailure(
        name,
        next,
        "UNKNOWN_PARAMETER",
        `Component '${component.component_id}' is imported geometry and has no Battenmark parameters.`,
        { suggestion: "Parameters apply to native component definitions only." },
      );
    }
    return successful(name, next, {
      assembly_id: found.assembly.assembly_id,
      component_id: component.component_id,
      parameter: args.name,
      value: args.value,
    });
  }
  if (ASSEMBLY_CONSTRAINT_OPERATIONS.has(name)) {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const assembly = found.assembly;
    for (const identity of [args.a_instance, args.b_instance]) {
      if (!findInstance(assembly, String(identity))) {
        return referenceFailure(
          name,
          next,
          "INSTANCE_NOT_FOUND",
          `Instance '${identity}' was not found.`,
          { assembly: assembly.assembly_id },
        );
      }
    }
    const constraintId = nextIdentity("c", assembly.constraints, "constraint_id");
    assembly.constraints.push({
      constraint_id: constraintId,
      kind: name,
      a_instance: String(args.a_instance),
      b_instance: String(args.b_instance),
    });
    next.constraint_applied = true;
    return successful(name, next, {
      assembly_id: assembly.assembly_id,
      constraint_id: constraintId,
      ...(name === "align_axes" ? { kind: args.concentric ? "concentric" : "align_axes" } : {}),
    });
  }
  if (name === "remove_constraint") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const index = found.assembly.constraints.findIndex(
      (constraint) => constraint.constraint_id === args.constraint_id,
    );
    if (index < 0) {
      return referenceFailure(
        name,
        next,
        "CONSTRAINT_NOT_FOUND",
        `Constraint '${args.constraint_id}' was not found.`,
        { assembly: found.assembly.assembly_id },
      );
    }
    const [removed] = found.assembly.constraints.splice(index, 1);
    return successful(name, next, {
      assembly_id: found.assembly.assembly_id,
      removed: removed.constraint_id,
    });
  }
  if (name === "inspect_assembly") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    const data = inspectAssemblyData(found.assembly);
    next.inspect_assembly_called = true;
    next.remaining_dof = data.remaining_dof_total;
    return successful(name, next, data);
  }
  if (name === "check_interference" || name === "rebuild_assembly" || name === "export_assembly") {
    const found = requireAssembly(name, next, String(args.assembly_id));
    if (found.error) return found.error;
    if (Array.isArray(args.instance_ids)) {
      const missing = args.instance_ids.find(
        (identity) => !findInstance(found.assembly, String(identity)),
      );
      if (missing !== undefined) {
        return referenceFailure(
          name,
          next,
          "INSTANCE_NOT_FOUND",
          `Instance '${missing}' was not found.`,
          { assembly: found.assembly.assembly_id },
        );
      }
    }
    if (name === "check_interference") {
      next.interference_checked = true;
      return successful(name, next, {
        assembly_id: found.assembly.assembly_id,
        interferences: [],
        count: 0,
      });
    }
    if (name === "rebuild_assembly") {
      return successful(name, next, {
        assembly_id: found.assembly.assembly_id,
        valid: true,
        instances: found.assembly.instances.map((instance) => ({
          id: instance.instance_id,
          valid: true,
        })),
      });
    }
    const artifactId = nextIdentity("artifact", registry.artifacts, "artifact_id");
    registry.artifacts.push({
      artifact_id: artifactId,
      assembly_id: found.assembly.assembly_id,
      format: String(args.format || "fcstd"),
    });
    next.artifact_exported = true;
    return successful(
      name,
      next,
      {
        artifact_id: artifactId,
        assembly_id: found.assembly.assembly_id,
        format: String(args.format || "fcstd"),
      },
      { artifact_id: artifactId },
    );
  }
  if (
    name === "create_hole" ||
    name === "fillet" ||
    name === "chamfer" ||
    name === "boolean" ||
    name === "boolean_cut" ||
    name === "boolean_union" ||
    name === "boolean_intersect"
  )
    next.feature_applied = true;
  if (name === "validate") next.validated = true;
  if (name === "render_preview") next.preview_rendered = true;
  if (name === "export_step" || name === "export_fcstd") {
    const artifactId = nextIdentity("artifact", registry.artifacts, "artifact_id");
    registry.artifacts.push({
      artifact_id: artifactId,
      format: name.replace("export_", ""),
    });
    next.artifact_exported = true;
    return successful(
      name,
      next,
      { artifact_id: artifactId, format: name.replace("export_", "") },
      { artifact_id: artifactId },
    );
  }
  if (name === "mate_faces" || name === "mate_axis" || name === "add_constraint")
    next.constraint_applied = true;
  return { ok: true, state: next, observation: `${name} ok` };
}
