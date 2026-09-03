/**
 * Phase 7C.2 — Public-operation executor for evaluation.
 * Rejects privileged/private tools. Never touches backend internals.
 */
import { quatFromEulerXYZDeg } from "../../src/cad/assembly/transforms.ts";
import { evaluateExpression, resolveParameters } from "../../src/cad/expressions.ts";

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
    entries: schema.TOOL_CATALOG.map((entry) => {
      const external = schema.toOpenAiTool(entry, true).function;
      return {
        name: external.name,
        description: external.description,
        parameters: external.parameters,
      };
    }),
    getCatalogEntry: schema.getCatalogEntry,
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
  const session = fixture
    ? {
        project_id: "diagnostic-project",
        document_id: "diagnostic-document",
        body_id: String(fixture.args?.body_id || "diagnostic_fixture"),
      }
    : null;
  return {
    get injectionCount() {
      return injectionCount;
    },
    initialize(state = {}) {
      if (!session) return { state, public_context: null };
      const next = nextState(state);
      const registry = registryOf(next);
      next.project_id = session.project_id;
      registry.project = {
        project_id: session.project_id,
        name: "Backend diagnostics fixture",
        slug: session.project_id,
      };
      registry.document = {
        document_id: session.document_id,
        name: "Backend diagnostics fixture",
      };
      registry.parameters = [];
      registry.bodies = [
        {
          body_id: session.body_id,
          name: session.body_id,
          fixture_geometry: "diagnostic-box",
        },
      ];
      registry.features = [];
      registry.assemblies = [];
      registry.artifacts = [];
      return { state: next, public_context: structuredClone(session) };
    },
    async inject() {
      if (!fixture || injectionCount > 0) return null;
      injectionCount += 1;
      const details = {
        reference: fixture.stale_reference,
        entity: fixture.entity,
        suggestion: fixture.suggestion,
        project_id: session.project_id,
        document_id: session.document_id,
        body_id: session.body_id,
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
        args: { project_id: session.project_id, ...structuredClone(fixture.args) },
        result,
      };
    },
  };
}

function freshRegistry() {
  return {
    project: null,
    document: null,
    parameters: [],
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

function findFeature(registry, identity) {
  return registry.features.find(
    (feature) => feature.feature_id === identity || feature.name === identity,
  );
}

function resolvedDimension(registry, value, label, { positive = false } = {}) {
  let resolved;
  try {
    resolved = resolveEvaluationDimension(registry, value);
  } catch (error) {
    return { error: `Invalid ${label}: ${String(error.message || error)}` };
  }
  if (!Number.isFinite(resolved) || (positive && resolved <= 0)) {
    return { error: `${label} must be ${positive ? "positive and " : ""}finite.` };
  }
  return { value: resolved };
}

function requireFeature(name, state, identity) {
  const feature = findFeature(registryOf(state), identity);
  if (feature) return { feature };
  return {
    error: referenceFailure(
      name,
      state,
      "UNKNOWN_FEATURE",
      `Feature '${identity}' was not found.`,
      {
        feature: identity,
      },
    ),
  };
}

function requireSketch(name, state, identity) {
  const found = requireFeature(name, state, identity);
  if (found.error) return found;
  if (found.feature.kind === "sketch") return found;
  return {
    error: referenceFailure(name, state, "INVALID_REFERENCE", `'${identity}' is not a sketch.`, {
      feature: found.feature.feature_id,
      kind: found.feature.kind,
    }),
  };
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

function resolveEvaluationDimension(registry, value, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return value;
  const expression = typeof value === "object" && "expr" in value ? value.expr : value;
  const resolved = Number(evaluateExpression(expression, resolveParameters(registry.parameters)));
  if (!Number.isFinite(resolved)) throw new Error(`Expression '${expression}' did not resolve.`);
  return resolved;
}

function transformFromArgs(registry, position, rotation, previous) {
  const transform = structuredClone(
    previous || {
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  );
  if (position) {
    transform.translation = {
      x: resolveEvaluationDimension(registry, position.x, transform.translation.x),
      y: resolveEvaluationDimension(registry, position.y, transform.translation.y),
      z: resolveEvaluationDimension(registry, position.z, transform.translation.z),
    };
  }
  if (rotation) {
    transform.rotation = quatFromEulerXYZDeg(
      resolveEvaluationDimension(registry, rotation.x),
      resolveEvaluationDimension(registry, rotation.y),
      resolveEvaluationDimension(registry, rotation.z),
    );
  }
  return transform;
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
    parameters: registry.parameters.slice(0, PUBLIC_INSPECTION_LIMIT).map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      unit: parameter.unit,
      expression: parameter.expression ?? null,
    })),
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
      parameters: component.parameters
        .slice(0, PUBLIC_INSPECTION_LIMIT)
        .map((parameter) => parameter.name),
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
  const entry = cat.getCatalogEntry?.(name);
  if (entry?.needsProject) {
    const requested = typeof args.project_id === "string" ? args.project_id : "";
    if (!requested) {
      return referenceFailure(name, next, "MALFORMED_REQUEST", "project_id is required.", {
        suggestion: "Call project_create first and pass the returned project_id.",
      });
    }
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
  }
  if (name === "project_create") {
    const projectId = String(args.slug || args.name || args.project_id || "eval-project");
    next.project_id = projectId;
    registry.project = {
      project_id: projectId,
      name: String(args.name || projectId),
      slug: String(args.slug || projectId),
    };
    registry.document = { document_id: "doc_1", name: String(args.name || projectId) };
    registry.parameters = [];
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
      parameters: registry.parameters
        .slice(0, PUBLIC_INSPECTION_LIMIT)
        .map((parameter) => parameter.name),
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
  if (name === "define_parameter") {
    const parameter = {
      name: String(args.name),
      value: Number(args.value),
      unit: String(args.unit || "mm"),
      ...(args.expression === undefined ? {} : { expression: String(args.expression) }),
    };
    const existing = registry.parameters.findIndex((item) => item.name === parameter.name);
    if (existing >= 0) registry.parameters[existing] = parameter;
    else registry.parameters.push(parameter);
    next.parameters_count = registry.parameters.length;
    return successful(name, next, { name: parameter.name, value: parameter.value });
  }
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
  if (name === "create_sketch") {
    const body = findBody(registry, String(args.body_id));
    if (!body) {
      return referenceFailure(name, next, "UNKNOWN_BODY", `Body '${args.body_id}' was not found.`, {
        body: String(args.body_id),
      });
    }
    const featureId = nextIdentity("feat", registry.features, "feature_id");
    const featureName = nextPublicName(String(args.name || "Sketch"), registry.features);
    const plane = String(args.plane || "XY");
    registry.features.push({
      feature_id: featureId,
      name: featureName,
      kind: "sketch",
      body_id: body.body_id,
      plane,
      origin: structuredClone(args.origin || { x: 0, y: 0, z: 0 }),
      profiles: [],
      summary: `sketch on ${plane}`,
    });
    return successful(name, next, { id: featureId, name: featureName, plane });
  }
  if (name === "add_rectangle" || name === "add_circle") {
    const found = requireSketch(name, next, String(args.sketch_id));
    if (found.error) return found.error;
    const sketch = found.feature;
    const fields =
      name === "add_rectangle"
        ? [
            ["x_mm", false],
            ["y_mm", false],
            ["width_mm", true],
            ["height_mm", true],
          ]
        : [
            ["cx_mm", false],
            ["cy_mm", false],
            ["radius_mm", true],
          ];
    const values = {};
    for (const [field, positive] of fields) {
      const resolved = resolvedDimension(registry, args[field], field, { positive });
      if (resolved.error) return referenceFailure(name, next, "INVALID_DIMENSION", resolved.error);
      values[field] = resolved.value;
    }
    const profileId = nextIdentity("prf", sketch.profiles, "profile_id");
    sketch.profiles.push({
      profile_id: profileId,
      kind: name === "add_rectangle" ? "rectangle" : "circle",
      ...values,
    });
    return successful(name, next, {
      sketch_id: sketch.feature_id,
      profile_count: sketch.profiles.length,
    });
  }
  if (name === "pocket" || name === "pad") {
    const found = requireSketch(name, next, String(args.sketch_id));
    if (found.error) return found.error;
    const sketch = found.feature;
    if (!sketch.profiles.length) {
      return referenceFailure(
        name,
        next,
        "EMPTY_SKETCH",
        `Sketch '${sketch.feature_id}' has no profiles to ${name}.`,
      );
    }
    const depth = resolvedDimension(registry, args.depth_mm, "depth_mm", { positive: true });
    if (depth.error) return referenceFailure(name, next, "INVALID_DIMENSION", depth.error);
    const featureId = nextIdentity("feat", registry.features, "feature_id");
    const featureName = nextPublicName(
      String(args.name || (name === "pocket" ? "Pocket" : "Pad")),
      registry.features,
    );
    const summary = `${name} ${depth.value} mm`;
    registry.features.push({
      feature_id: featureId,
      name: featureName,
      kind: name,
      body_id: sketch.body_id,
      sketch_id: sketch.feature_id,
      depth_mm: depth.value,
      summary,
    });
    next.feature_applied = true;
    return successful(name, next, {
      id: featureId,
      name: featureName,
      body_id: sketch.body_id,
      sketch_id: sketch.feature_id,
      summary,
    });
  }
  if (
    name === "boolean" ||
    name === "boolean_cut" ||
    name === "boolean_union" ||
    name === "boolean_intersect"
  ) {
    const target = findBody(registry, String(args.target_body_id));
    if (!target) {
      return referenceFailure(
        name,
        next,
        "UNKNOWN_BODY",
        `Body '${args.target_body_id}' was not found.`,
        { body: String(args.target_body_id), role: "target" },
      );
    }
    const tool = findBody(registry, String(args.tool_body_id));
    if (!tool) {
      return referenceFailure(
        name,
        next,
        "UNKNOWN_BODY",
        `Body '${args.tool_body_id}' was not found.`,
        { body: String(args.tool_body_id), role: "tool" },
      );
    }
    if (target.body_id === tool.body_id) {
      return referenceFailure(
        name,
        next,
        "INVALID_REFERENCE",
        "Boolean target and tool must be different bodies.",
      );
    }
    const operation =
      name === "boolean_cut"
        ? "subtract"
        : name === "boolean_union"
          ? "union"
          : name === "boolean_intersect"
            ? "intersect"
            : String(args.operation);
    const featureId = nextIdentity("feat", registry.features, "feature_id");
    const featureName = nextPublicName(String(args.name || "Boolean"), registry.features);
    const summary = `${operation} ${tool.body_id} from ${target.body_id}`;
    registry.features.push({
      feature_id: featureId,
      name: featureName,
      kind: "boolean",
      body_id: target.body_id,
      target_body_id: target.body_id,
      tool_body_id: tool.body_id,
      operation,
      summary,
    });
    next.feature_applied = true;
    return successful(name, next, {
      id: featureId,
      name: featureName,
      body_id: target.body_id,
      target_body_id: target.body_id,
      tool_body_id: tool.body_id,
      operation,
      summary,
    });
  }
  if (name === "query_geometry" || name === "inspect_faces") {
    const body = findBody(registry, String(args.body_id));
    if (!body) {
      return referenceFailure(name, next, "UNKNOWN_BODY", `Body '${args.body_id}' was not found.`, {
        body: String(args.body_id),
      });
    }
    const selector = args.selector;
    const staleReference =
      selector && typeof selector === "object" && !Array.isArray(selector) ? selector.gref : null;
    if (staleReference === "gref_missing") {
      return referenceFailure(
        name,
        next,
        "GEOMETRY_REFERENCE_LOST",
        `Persistent geometry reference '${staleReference}' is no longer present.`,
        { reference: staleReference, entity: name === "inspect_faces" ? "face" : args.entity },
      );
    }
    const semanticSelector = typeof selector === "string" ? selector : "top_face";
    if (semanticSelector !== "top_face") {
      return referenceFailure(
        name,
        next,
        "GEOMETRY_SELECTOR_NO_MATCH",
        `Selector '${semanticSelector}' did not match fixture geometry.`,
      );
    }
    const match = {
      id: "face_top",
      gref: "gref_top_face",
      role: "top_face",
      midpoint: { x: 0, y: 0, z: 10 },
      normal: { x: 0, y: 0, z: 1 },
    };
    next.geometry_inspected = true;
    return successful(name, next, {
      body_id: body.body_id,
      entity: "face",
      selector: semanticSelector,
      match_count: 1,
      matches: [match],
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
      parameters: imported ? [] : structuredClone(registry.parameters),
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
    let transform;
    try {
      transform = transformFromArgs(registry, args.position, args.rotation_euler_xyz_deg);
    } catch (error) {
      return referenceFailure(name, next, "EXPRESSION_ERROR", String(error.message || error));
    }
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
    try {
      instance.transform = transformFromArgs(
        registry,
        args.position,
        args.rotation_euler_xyz_deg,
        instance.transform,
      );
    } catch (error) {
      return referenceFailure(name, next, "EXPRESSION_ERROR", String(error.message || error));
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
    const parameter = component.parameters.find((item) => item.name === args.name);
    if (!parameter) {
      return referenceFailure(
        name,
        next,
        "UNKNOWN_PARAMETER",
        `Component '${component.component_id}' has no parameter '${args.name}'.`,
        { available: component.parameters.map((item) => item.name) },
      );
    }
    parameter.value = Number(args.value);
    delete parameter.expression;
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
  if (name === "create_hole" || name === "fillet" || name === "chamfer")
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
