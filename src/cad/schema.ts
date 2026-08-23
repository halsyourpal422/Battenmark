/**
 * Canonical CAD tool/operation schema.
 * MCP, HTTP, CLI, Python, and the studio all derive from this catalog.
 * Schema version is independent of the application version.
 */
import type { Operation } from "./types";
export {
  AGENTCAD_SCHEMA_VERSION,
  AGENTCAD_SCHEMA_MIN_READABLE,
  AGENTCAD_MCP_VERSION,
  CAD_SERVICE_VERSION,
  WORKING_PACKAGE_NAME,
  SCHEMA_POLICY,
  isReadableSchemaVersion,
  assertCompatibleSchema,
} from "./version";

export type CadPermission = "cad:read" | "cad:write" | "cad:export" | "cad:admin";
export type ToolKind = "read" | "mutate" | "artifact" | "project";

export interface CatalogEntry {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
  kind: ToolKind;
  permission: CadPermission;
  needsProject: boolean;
  mapsTo: string;
  inject?: Record<string, unknown>;
  exposeToGrok: boolean;
  destructive: boolean;
  idempotent: boolean;
}

const dim = {
  anyOf: [{ type: "number" }, { type: "string" }],
  description:
    "Millimetres as a number, or a parameter expression such as 'inner_length + 2 * wall_thickness'.",
};

const origin = {
  type: "object",
  properties: {
    x: dim,
    y: dim,
    z: dim,
  },
  description:
    "Corner origin in mm. Each axis may be a number or an expression such as 'wall' or 'length / 2'. Default (0,0,0). Z is up.",
};

const geometrySelector = {
  anyOf: [
    { type: "string", description: "Shorthand: top_perimeter, all_vertical, top_face, largest_planar, ..." },
    {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["edge", "face", "vertex"] },
        selector: { type: "string" },
        created_by: { type: "string", description: "Feature id or name that created the geometry." },
        nearest: origin,
        centroid_near: origin,
        gref: { type: "string", description: "Stable geometry reference from query_geometry." },
        unique: { type: "boolean" },
      },
    },
  ],
  description: "Semantic geometry selector. Prefer intent (top_perimeter) over OCC indices (Edge17).",
};

const projectId = {
  type: "string",
  description: "Project handle returned by project_create / project_list. Required for external clients.",
};

const documentId = {
  type: "string",
  description: "Optional document handle. Defaults to the project's main document.",
};

function props(extra: Record<string, unknown>, withProject = true): Record<string, unknown> {
  return withProject ? { project_id: projectId, document_id: documentId, ...extra } : extra;
}

function entry(partial: CatalogEntry): CatalogEntry {
  return partial;
}

export const PRIVILEGED_TOOL_NAMES = [
  "eval_python",
  "execute_python",
  "shell",
  "exec",
  "execute_code",
  "execute_python_code",
] as const;

const FACE_ENUM = ["top_face", "bottom_face", "front_face", "back_face", "right_face", "left_face"];

const assemblyRefFace = {
  anyOf: [{ type: "string", description: "Face name (top_face, ...) or semantic selector string." }, geometrySelector],
  description: "Component-local face reference. Resolved per instance — never a raw topology index.",
};

const assemblyRefAxis = {
  type: "string",
  description:
    "Axis reference: X/Y/Z coordinate axis, or the feature/body name of cylindrical geometry (hole or cylinder). Structured selector objects are not supported for axes yet.",
};

function assemblyEntry(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  kind: ToolKind = "mutate",
): CatalogEntry {
  return entry({
    name,
    description,
    properties: props(properties),
    required,
    kind,
    permission: kind === "read" ? "cad:read" : "cad:write",
    needsProject: true,
    mapsTo: name,
    exposeToGrok: true,
    destructive: false,
    idempotent: kind === "read",
  });
}

const ASSEMBLY_TOOLS: CatalogEntry[] = [
  assemblyEntry("create_assembly", "Create an assembly container. Returns a stable assembly_id.", { name: { type: "string" }, assembly_id: { type: "string" } }, []),
  assemblyEntry(
    "define_component",
    "Define a reusable component from this document's current content (snapshot of bodies/features/parameters), or from an imported STEP/FCStd file. Definitions are shared by all instances; instances never copy design trees.",
    {
      assembly_id: { type: "string" },
      component_id: { type: "string" },
      name: { type: "string" },
      include: { type: "object", properties: { body_ids: { type: "array", items: { type: "string" } } } },
      source_format: { type: "string", enum: ["step", "fcstd"] },
      source_path: { type: "string" },
    },
    ["assembly_id"],
  ),
  assemblyEntry(
    "create_instance",
    "Place one component definition into the assembly with a stable instance id and optional initial transform (mm; Euler XYZ degrees).",
    {
      assembly_id: { type: "string" },
      component_id: { type: "string" },
      instance_id: { type: "string" },
      position: origin,
      rotation_euler_xyz_deg: { type: "object", properties: { x: dim, y: dim, z: dim } },
    },
    ["assembly_id", "component_id"],
  ),
  assemblyEntry("fix_instance", "Ground an instance. Fixed instances define the assembly reference frame and never move during constraint solving.", { assembly_id: { type: "string" }, instance_id: { type: "string" } }, ["assembly_id", "instance_id"]),
  assemblyEntry("set_instance_transform", "Set an unconstrained instance's initial/current placement (position mm; rotation Euler XYZ degrees).", { assembly_id: { type: "string" }, instance_id: { type: "string" }, position: origin, rotation_euler_xyz_deg: { type: "object", properties: { x: dim, y: dim, z: dim } } }, ["assembly_id", "instance_id"]),
  assemblyEntry("set_definition_parameter", "Change a native component definition parameter. All instances of the definition update on the next rebuild — real instancing, not copied geometry.", { assembly_id: { type: "string" }, component_id: { type: "string" }, name: { type: "string" }, value: { type: "number" } }, ["assembly_id", "component_id", "name", "value"]),
  assemblyEntry("mate_faces", "Planar face-to-face mate between two instances. The second referenced instance moves. Optional offset_mm gap along the anchor normal.", { assembly_id: { type: "string" }, a_instance: { type: "string" }, a_face: assemblyRefFace, b_instance: { type: "string" }, b_face: assemblyRefFace, offset_mm: { type: "number" } }, ["assembly_id", "a_instance", "a_face", "b_instance", "b_face"]),
  assemblyEntry("align_axes", "Align two cylindrical/coordinate axes. concentric=true also slides the moving instance along the axis so axis points coincide.", { assembly_id: { type: "string" }, a_instance: { type: "string" }, a_axis: assemblyRefAxis, b_instance: { type: "string" }, b_axis: assemblyRefAxis, concentric: { type: "boolean" } }, ["assembly_id", "a_instance", "a_axis", "b_instance", "b_axis"]),
  assemblyEntry("set_distance", "Signed distance between two parallel planar references, measured along the anchor normal.", { assembly_id: { type: "string" }, a_instance: { type: "string" }, a_ref: assemblyRefFace, b_instance: { type: "string" }, b_ref: assemblyRefFace, distance_mm: { type: "number" } }, ["assembly_id", "a_instance", "a_ref", "b_instance", "b_ref", "distance_mm"]),
  assemblyEntry("set_angle", "Dihedral angle between two planar references, in explicit degrees.", { assembly_id: { type: "string" }, a_instance: { type: "string" }, a_ref: assemblyRefFace, b_instance: { type: "string" }, b_ref: assemblyRefFace, angle_deg: { type: "number" } }, ["assembly_id", "a_instance", "a_ref", "b_instance", "b_ref", "angle_deg"]),
  assemblyEntry("remove_constraint", "Remove one assembly constraint by id (see inspect_assembly).", { assembly_id: { type: "string" }, constraint_id: { type: "string" } }, ["assembly_id", "constraint_id"]),
  entry({
    name: "rebuild_assembly",
    description: "Authoritatively build an assembly through FreeCAD/OpenCascade. Returns per-instance validity, volumes and world bounds.",
    properties: props({ assembly_id: { type: "string" } }),
    required: ["assembly_id"],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "rebuild_assembly",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_assembly",
    description: "Export a solved assembly as FCStd (native App::Part hierarchy) or STEP (placed solids with instance labels).",
    properties: props({ assembly_id: { type: "string" }, format: { type: "string", enum: ["fcstd", "step"] } }),
    required: ["assembly_id"],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_assembly",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  assemblyEntry(
    "inspect_assembly",
    "Inspect an assembly: definitions, instances with world transforms, constraint status (applied/redundant/deferred), remaining degrees of freedom, world bounding box. Deterministic solve runs kernel-free.",
    { assembly_id: { type: "string" } },
    ["assembly_id"],
    "read",
  ),
];

export const TOOL_CATALOG: CatalogEntry[] = [
  entry({
    name: "kernel_status",
    description: "Report which CAD kernels are available (JSCAD preview vs FreeCAD/OpenCascade).",
    properties: {},
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: false,
    mapsTo: "kernel_status",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_backend_capabilities",
    description:
      "Machine-readable backend capability report. Callers use this to learn whether the selected backend supports holes, patterns, STEP, assemblies, etc. Design intent stays backend-neutral (create_hole, not PartDesign::Hole).",
    properties: {},
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: false,
    mapsTo: "inspect_backend_capabilities",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "project_create",
    description: "Create a persisted CAD project. Returns project_id and document_id. Pass those handles on later calls.",
    properties: {
      name: { type: "string", description: "Human name, e.g. motor-bracket" },
      slug: { type: "string", description: "Optional filesystem-safe id. Defaults to a slug of name." },
    },
    required: ["name"],
    kind: "project",
    permission: "cad:write",
    needsProject: false,
    mapsTo: "project_create",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "project_list",
    description: "List persisted projects in the workspace.",
    properties: {},
    required: [],
    kind: "project",
    permission: "cad:read",
    needsProject: false,
    mapsTo: "project_list",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "project_open",
    description: "Open a persisted project by project_id or slug and return its handles plus a summary.",
    properties: { project_id: projectId },
    required: ["project_id"],
    kind: "project",
    permission: "cad:read",
    needsProject: false,
    mapsTo: "project_open",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "project_inspect",
    description: "Inspect project metadata, document summary, and current revision without mutating.",
    properties: { project_id: projectId },
    required: ["project_id"],
    kind: "project",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "project_inspect",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_document",
    description: "Inspect the document: parameters, bodies, feature tree, volumes, bbox, validation. Call this first on a project.",
    properties: props({}),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_document",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_body",
    description: "Inspect one body and its features.",
    properties: props({ body_id: { type: "string" } }),
    required: ["body_id"],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_body",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_feature",
    description: "Inspect one feature.",
    properties: props({ feature_id: { type: "string" } }),
    required: ["feature_id"],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_feature",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "validate",
    description: "Validate solids, volumes, holes, fillets, and recompute errors. Always call after a batch of edits.",
    properties: props({
      kernel: { type: "string", enum: ["jscad", "freecad"], description: "jscad is the preview kernel; freecad is authoritative B-rep." },
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "validate",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "define_parameter",
    description: "Define a named parametric variable. Prefer this for dimensions you may change later.",
    properties: props({
      name: { type: "string", description: "Identifier, e.g. wall_thickness" },
      value: { type: "number" },
      unit: { type: "string", enum: ["mm", "deg", "count"] },
      expression: { type: "string" },
    }),
    required: ["name", "value"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "define_parameter",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "set_parameter",
    description: "Change a defined parameter and regenerate dependent geometry.",
    properties: props({
      name: { type: "string" },
      value: { type: "number" },
      expression: { type: "string" },
    }),
    required: ["name"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "set_parameter",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_body",
    description: "Create an empty body (solid container). Optional — create_box will make a body if omitted.",
    properties: props({
      name: { type: "string", description: "e.g. Base, Lid" },
      color: { type: "string" },
    }),
    required: [],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_body",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_box",
    description:
      "Create a rectangular solid. Length along X, width along Y, height along Z. Origin is the min corner (FreeCAD-style). Creates a body if body_id omitted.",
    properties: props({
      body_id: { type: "string" },
      name: { type: "string" },
      length_mm: dim,
      width_mm: dim,
      height_mm: dim,
      origin,
    }),
    required: ["length_mm", "width_mm", "height_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_box",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_cylinder",
    description: "Create a cylinder. Height along axis (default Z). Origin is the base centre.",
    properties: props({
      body_id: { type: "string" },
      name: { type: "string" },
      radius_mm: dim,
      height_mm: dim,
      origin,
      axis: { type: "string", enum: ["X", "Y", "Z"] },
    }),
    required: ["radius_mm", "height_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_cylinder",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_sphere",
    description: "Create a sphere. Origin is the centre.",
    properties: props({
      body_id: { type: "string" },
      name: { type: "string" },
      radius_mm: dim,
      origin,
    }),
    required: ["radius_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_sphere",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_sketch",
    description: "Create a sketch on a body. Add rectangles/circles, then pad or pocket.",
    properties: props({
      body_id: { type: "string" },
      name: { type: "string" },
      plane: { type: "string", enum: ["XY", "XZ", "YZ"] },
      origin,
    }),
    required: ["body_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_sketch",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "add_rectangle",
    description: "Add a rectangle profile to a sketch.",
    properties: props({
      sketch_id: { type: "string" },
      x_mm: dim,
      y_mm: dim,
      width_mm: dim,
      height_mm: dim,
    }),
    required: ["sketch_id", "x_mm", "y_mm", "width_mm", "height_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "add_rectangle",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "add_circle",
    description: "Add a circle profile to a sketch.",
    properties: props({
      sketch_id: { type: "string" },
      cx_mm: dim,
      cy_mm: dim,
      radius_mm: dim,
    }),
    required: ["sketch_id", "cx_mm", "cy_mm", "radius_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "add_circle",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "pad",
    description: "Extrude a sketch into a solid (pad).",
    properties: props({
      sketch_id: { type: "string" },
      depth_mm: dim,
      name: { type: "string" },
      reverse: { type: "boolean" },
    }),
    required: ["sketch_id", "depth_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "pad",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "pocket",
    description: "Cut a sketch into a solid (pocket).",
    properties: props({
      sketch_id: { type: "string" },
      depth_mm: dim,
      name: { type: "string" },
    }),
    required: ["sketch_id", "depth_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "pocket",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_hole",
    description:
      "Create a hole on a face. Design intent: diameter, through/blind, placement, optional counterbore/countersink. The backend chooses its native hole implementation. Prefer from_left_mm / from_right_mm so the hole stays inset when the plate grows.",
    properties: props({
      body_id: { type: "string" },
      face: { type: "string", enum: FACE_ENUM, description: "Semantic face of a box. Prefer this or target_face over OCC FaceN." },
      target_face: geometrySelector,
      x_mm: dim,
      y_mm: dim,
      from_left_mm: dim,
      from_front_mm: dim,
      from_right_mm: dim,
      from_back_mm: dim,
      centered: { type: "boolean" },
      diameter_mm: dim,
      depth_mm: dim,
      through: { type: "boolean", description: "Default true. Blind holes require depth_mm." },
      type: { type: "string", enum: ["through", "blind"] },
      counterbore_diameter_mm: dim,
      counterbore_depth_mm: dim,
      countersink_diameter_mm: dim,
      countersink_angle_deg: dim,
      thread: { type: "string", description: "Cosmetic thread designation such as M3. Not a helical solid." },
      name: { type: "string" },
    }),
    required: ["body_id", "diameter_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_hole",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "fillet",
    description: "Fillet edges. Prefer semantic selectors (top_perimeter, all_vertical) over Edge17.",
    properties: props({
      body_id: { type: "string" },
      radius_mm: dim,
      edges: geometrySelector,
      target: geometrySelector,
      name: { type: "string" },
    }),
    required: ["body_id", "radius_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "fillet",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "chamfer",
    description: "Chamfer edges. Prefer semantic selectors over OCC indices.",
    properties: props({
      body_id: { type: "string" },
      distance_mm: dim,
      edges: geometrySelector,
      target: geometrySelector,
      name: { type: "string" },
    }),
    required: ["body_id", "distance_mm"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "chamfer",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "boolean",
    description: "Boolean union, subtract, or intersect two bodies.",
    properties: props({
      target_body_id: { type: "string" },
      tool_body_id: { type: "string" },
      operation: { type: "string", enum: ["union", "subtract", "intersect"] },
      name: { type: "string" },
      consume_tool: { type: "boolean" },
    }),
    required: ["target_body_id", "tool_body_id", "operation"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "boolean",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "boolean_union",
    description: "Union two bodies. Alias of boolean with operation=union.",
    properties: props({
      target_body_id: { type: "string" },
      tool_body_id: { type: "string" },
      name: { type: "string" },
      consume_tool: { type: "boolean" },
    }),
    required: ["target_body_id", "tool_body_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "boolean",
    inject: { operation: "union" },
    exposeToGrok: false,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "boolean_cut",
    description: "Subtract tool body from target. Alias of boolean with operation=subtract.",
    properties: props({
      target_body_id: { type: "string" },
      tool_body_id: { type: "string" },
      name: { type: "string" },
      consume_tool: { type: "boolean" },
    }),
    required: ["target_body_id", "tool_body_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "boolean",
    inject: { operation: "subtract" },
    exposeToGrok: false,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "boolean_intersect",
    description: "Intersect two bodies. Alias of boolean with operation=intersect.",
    properties: props({
      target_body_id: { type: "string" },
      tool_body_id: { type: "string" },
      name: { type: "string" },
      consume_tool: { type: "boolean" },
    }),
    required: ["target_body_id", "tool_body_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "boolean",
    inject: { operation: "intersect" },
    exposeToGrok: false,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "create_pattern",
    description:
      "Linear or rectangular pattern of a feature (hole, pocket, pad). count includes the original. Prefer spacing + direction over hardcoded copies. Circular patterns are not implemented (BACKEND_UNSUPPORTED).",
    properties: props({
      feature_id: { type: "string" },
      count: { anyOf: [{ type: "integer", minimum: 2 }, { type: "string" }] },
      kind: { type: "string", enum: ["linear", "rectangular", "circular"] },
      direction: { type: "string", description: "x, y, z, or a semantic axis." },
      spacing_mm: dim,
      dx_mm: dim,
      dy_mm: dim,
      dz_mm: dim,
      count_x: { anyOf: [{ type: "integer", minimum: 2 }, { type: "string" }] },
      count_y: { anyOf: [{ type: "integer", minimum: 2 }, { type: "string" }] },
      spacing_x_mm: dim,
      spacing_y_mm: dim,
      name: { type: "string" },
    }),
    required: ["feature_id", "count"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_pattern",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "pattern",
    description: "Alias of create_pattern.",
    properties: props({
      feature_id: { type: "string" },
      count: { type: "integer", minimum: 2 },
      dx_mm: dim,
      dy_mm: dim,
      dz_mm: dim,
      name: { type: "string" },
    }),
    required: ["feature_id", "count"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "create_pattern",
    exposeToGrok: false,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "set_feature_param",
    description: "Edit one dimension of an existing feature (length, width, height, radius, diameter, depth, x, y).",
    properties: props({
      feature_id: { type: "string" },
      param: { type: "string" },
      value: dim,
    }),
    required: ["feature_id", "param", "value"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "set_feature_param",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "delete_feature",
    description: "Delete a feature from the tree.",
    properties: props({ feature_id: { type: "string" } }),
    required: ["feature_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "delete_feature",
    exposeToGrok: true,
    destructive: true,
    idempotent: false,
  }),
  entry({
    name: "rename_feature",
    description: "Rename a feature to a semantic name such as usb_cutout or pcb_post_front_left.",
    properties: props({
      feature_id: { type: "string" },
      name: { type: "string" },
    }),
    required: ["feature_id", "name"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "rename_feature",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "save_revision",
    description: "Save a named checkpoint so the model can be rolled back.",
    properties: props({ label: { type: "string" } }),
    required: [],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "save_revision",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "list_revisions",
    description: "List checkpoints.",
    properties: props({}),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "list_revisions",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "rollback_revision",
    description: "Restore a previous checkpoint.",
    properties: props({ revision_id: { type: "string" } }),
    required: ["revision_id"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "rollback_revision",
    exposeToGrok: true,
    destructive: true,
    idempotent: false,
  }),
  entry({
    name: "rebuild",
    description: "Rebuild the model with the FreeCAD/OpenCascade kernel (authoritative B-rep). Does not change the feature tree.",
    properties: props({}),
    required: [],
    kind: "artifact",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "rebuild",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "recompute",
    description: "Recompute the JSCAD preview evaluation.",
    properties: props({}),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "recompute",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_stl",
    description: "Export visible solids as STL. Authoritative STL comes from FreeCAD/OCC when the worker is available.",
    properties: props({ body_id: { type: "string" } }),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_stl",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_obj",
    description: "Export the JSCAD preview mesh as Wavefront OBJ.",
    properties: props({ body_id: { type: "string" } }),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_obj",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_json",
    description: "Export the canonical CAD document JSON (feature tree + parameters).",
    properties: props({}),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_json",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_step",
    description: "Authoritative STEP (ISO-10303) export via FreeCAD/OpenCascade. Returns artifact metadata, not the file bytes.",
    properties: props({ body_id: { type: "string" } }),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_step",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_fcstd",
    description: "Save the live FreeCAD document as .FCStd. Returns artifact metadata, not the file bytes.",
    properties: props({}),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_fcstd",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "export_3mf",
    description: "Export 3MF via FreeCAD Mesh. Returns artifact metadata, not the file bytes.",
    properties: props({ body_id: { type: "string" } }),
    required: [],
    kind: "artifact",
    permission: "cad:export",
    needsProject: true,
    mapsTo: "export_3mf",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "render_preview",
    description:
      "Render deterministic orthographic/isometric PNG previews of the current solids. Returns artifact_id handles (and MCP also embeds the PNG). Views: isometric, front, top, right, thumbnail, all.",
    properties: props({
      assembly_id: {
        type: "string",
        description: "Render an assembly (instances at solved transforms) instead of the single-part document.",
      },
      view: {
        type: "string",
        description: "isometric | front | top | right | thumbnail | all. Default isometric.",
      },
      width: { type: "number", description: "Pixel width. Default 640 (256 for thumbnail)." },
      height: { type: "number", description: "Pixel height. Default 480 (256 for thumbnail)." },
    }),
    required: [],
    kind: "artifact",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "render_preview",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "list_previews",
    description: "List previously rendered preview artifacts for this project.",
    properties: props({}),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "list_previews",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "import_step",
    description:
      "Import a STEP/STP file as a non-parametric B-rep solid. Path must be inside the workspace. Does not invent a feature history.",
    properties: props({
      path: { type: "string", description: "Filesystem path to a .step/.stp file inside the workspace." },
      artifact_id: { type: "string", description: "Alternatively import a previously stored artifact." },
      name: { type: "string" },
      body_id: { type: "string" },
    }),
    required: [],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "import_step",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "import_fcstd",
    description:
      "Import a FreeCAD .FCStd as B-rep. External FCStd files are not converted into a native parametric tree.",
    properties: props({
      path: { type: "string" },
      artifact_id: { type: "string" },
      name: { type: "string" },
      body_id: { type: "string" },
    }),
    required: [],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "import_fcstd",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "import_file",
    description: "Import STEP, FCStd, or a mesh from a workspace path. Format is inferred when omitted. Not parametric.",
    properties: props({
      path: { type: "string" },
      artifact_id: { type: "string" },
      format: { type: "string" },
      name: { type: "string" },
      body_id: { type: "string" },
    }),
    required: [],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "import_file",
    exposeToGrok: false,
    destructive: false,
    idempotent: false,
  }),
  entry({
    name: "get_artifact_metadata",
    description: "Look up a previously exported artifact by artifact_id. Does not return file bytes.",
    properties: {
      artifact_id: { type: "string" },
    },
    required: ["artifact_id"],
    kind: "read",
    permission: "cad:read",
    needsProject: false,
    mapsTo: "get_artifact_metadata",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "query_geometry",
    description:
      "Resolve a semantic face/edge selector against the current solid. Returns matches with roles, midpoints, and gref ids. Inspect before filleting ambiguous topology. Authoritative results come from FreeCAD/OpenCascade.",
    properties: props({
      body_id: { type: "string" },
      entity: { type: "string", enum: ["edge", "face", "vertex"] },
      selector: geometrySelector,
      created_by: { type: "string" },
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "query_geometry",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_faces",
    description: "List faces matching a semantic selector (top_face, largest_planar, normal_positive_z, ...).",
    properties: props({
      body_id: { type: "string" },
      selector: geometrySelector,
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_faces",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_edges",
    description: "List edges matching a semantic selector (top_perimeter, all_vertical, parallel_to_z, ...).",
    properties: props({
      body_id: { type: "string" },
      selector: geometrySelector,
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_edges",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "resolve_faces",
    description: "Alias of inspect_faces.",
    properties: props({
      body_id: { type: "string" },
      selector: geometrySelector,
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "resolve_faces",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "resolve_edges",
    description: "Alias of inspect_edges.",
    properties: props({
      body_id: { type: "string" },
      selector: geometrySelector,
    }),
    required: [],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "resolve_edges",
    exposeToGrok: false,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "inspect_dependencies",
    description: "Show which features and parameters depend on a named parameter (e.g. wall).",
    properties: props({
      name: { type: "string" },
    }),
    required: ["name"],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "inspect_dependencies",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "preview_parameter_change",
    description: "Report which features would be affected by changing a parameter. Does not mutate.",
    properties: props({
      name: { type: "string" },
      value: { type: "number" },
    }),
    required: ["name", "value"],
    kind: "read",
    permission: "cad:read",
    needsProject: true,
    mapsTo: "preview_parameter_change",
    exposeToGrok: true,
    destructive: false,
    idempotent: true,
  }),
  entry({
    name: "batch_operations",
    description:
      "Execute several CAD operations as one checkpointed batch. On failure the document rolls back to the pre-batch revision.",
    properties: props({
      operations: {
        type: "array",
        items: { type: "object" },
        description: "Ordered list of { op, ...arguments } objects.",
      },
      dry_run: { type: "boolean" },
    }),
    required: ["operations"],
    kind: "mutate",
    permission: "cad:write",
    needsProject: true,
    mapsTo: "batch_operations",
    exposeToGrok: true,
    destructive: false,
    idempotent: false,
  }),
  ...ASSEMBLY_TOOLS,
];

const BY_NAME = new Map(TOOL_CATALOG.map((t) => [t.name, t]));

export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return BY_NAME.get(name);
}

export function isPrivilegedTool(name: string) {
  return (PRIVILEGED_TOOL_NAMES as readonly string[]).includes(name);
}

export function isReadOnlyTool(name: string) {
  const e = BY_NAME.get(name);
  return e ? e.kind === "read" || (e.kind === "project" && name !== "project_create") : false;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function toOpenAiTool(entry: CatalogEntry, requireProject: boolean): ToolDef {
  const required = [...entry.required];
  if (requireProject && entry.needsProject && !required.includes("project_id")) {
    required.unshift("project_id");
  }
  return {
    type: "function",
    function: {
      name: entry.name,
      description: entry.description,
      parameters: {
        type: "object",
        properties: entry.properties,
        required,
      },
    },
  };
}

/** Grok / OpenAI function-calling tools. project_id is optional (the studio injects it). */
export const CAD_TOOLS: ToolDef[] = TOOL_CATALOG.filter((t) => t.exposeToGrok).map((t) =>
  toOpenAiTool(t, false),
);

/** MCP / external tools. project_id is required when the tool is document-scoped. */
export const MCP_TOOLS: ToolDef[] = TOOL_CATALOG.map((t) => toOpenAiTool(t, true));

export const TOOL_NAMES = TOOL_CATALOG.map((t) => t.name);

const SERVICE_FIELDS = new Set([
  "project_id",
  "document_id",
  "dry_run",
  "idempotency_key",
  "operations",
  "kernel",
  "backend",
  "slug",
  "artifact_id",
]);

export function argsToOperation(name: string, args: Record<string, unknown>): Operation {
  const entry = getCatalogEntry(name);
  const mapped = entry?.mapsTo ?? name;
  const inject = entry?.inject ?? {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (SERVICE_FIELDS.has(k) && k !== "name") continue;
    rest[k] = v;
  }
  if (mapped === "project_create") {
    return { op: "create_document", name: args.name as string } as Operation;
  }
  return { op: mapped, ...inject, ...rest } as Operation;
}

export function validateToolArgs(name: string, args: Record<string, unknown>): string | null {
  if (isPrivilegedTool(name)) return "PRIVILEGED_DENIED";
  const entry = getCatalogEntry(name);
  if (!entry) return `Unknown operation '${name}'.`;
  for (const key of entry.required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return `Missing required argument '${key}' for ${name}.`;
    }
  }
  return null;
}

export function toolAnnotations(entry: CatalogEntry) {
  return {
    readOnlyHint: entry.kind === "read" || (entry.kind === "project" && entry.name !== "project_create"),
    destructiveHint: entry.destructive,
    idempotentHint: entry.idempotent,
    openWorldHint: false,
  };
}
