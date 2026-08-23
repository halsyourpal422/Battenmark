import type {
  Body,
  CadDocument,
  Dim,
  FaceName,
  Feature,
  GeometrySelector,
  JsonValue,
  Operation,
  Revision,
  ToolResult,
  Vec3Expr,
} from "./types";
import { cadError } from "./errors";
import { FACE_NAMES } from "./types";
import { isIdent, requirePositive } from "./expressions";
import { nextName, uid } from "./ids";
import {
  allNames,
  bodyNames,
  cloneDocument,
  emptyDocument,
  featureDependsOn,
  featureNames,
  findBody,
  findFeature,
  paramMap,
  setParam,
  summarizeFeature,
} from "./document";
import { inspectBody, inspectDocument, inspectFeature } from "./inspect";
import { evaluateDocument } from "./evaluate";
import { meshesToObj, meshesToStl } from "./export-mesh";
import { inspectDependencies, previewParameterChange } from "./deps";
import { normalizeSelector, queryEnvelopeGeometry } from "./selectors";
import {
  alignAxes as asmAlignAxes,
  createAssembly as asmCreate,
  createInstance as asmCreateInstance,
  defineComponent as asmDefineComponent,
  fixInstance as asmFixInstance,
  inspectAssembly as asmInspect,
  mateFaces as asmMateFaces,
  removeConstraint as asmRemoveConstraint,
  setAngle as asmSetAngle,
  setDefinitionParameter as asmSetDefParam,
  setDistance as asmSetDistance,
  setInstanceTransform as asmSetInstanceTransform,
} from "./assembly/mutations";

function vec(partial?: Partial<Vec3Expr>): Vec3Expr {
  return {
    x: partial?.x ?? 0,
    y: partial?.y ?? 0,
    z: partial?.z ?? 0,
  };
}

function touch(doc: CadDocument) {
  doc.updatedAt = Date.now();
}

function requireBody(doc: CadDocument, id: string): Body {
  const b = findBody(doc, id);
  if (!b) {
    throw cadError("UNKNOWN_BODY", `Body '${id}' was not found.`, {
      body: id,
      suggestion: "Call create_body or pass a known body_id / name.",
    });
  }
  return b;
}

function requireFeature(doc: CadDocument, id: string): Feature {
  const f = findFeature(doc, id);
  if (!f) {
    throw cadError("UNKNOWN_FEATURE", `Feature '${id}' was not found.`, {
      feature: id,
    });
  }
  return f;
}

function allocFeatureName(doc: CadDocument, base: string, requested?: string) {
  if (requested) {
    if (allNames(doc).includes(requested)) {
      throw cadError("DUPLICATE_NAME", `Name '${requested}' is already used.`);
    }
    return requested;
  }
  return nextName(featureNames(doc), base);
}

function allocBodyName(doc: CadDocument, requested?: string) {
  if (requested) {
    if (allNames(doc).includes(requested)) {
      throw cadError("DUPLICATE_NAME", `Name '${requested}' is already used.`);
    }
    return requested;
  }
  return nextName(bodyNames(doc), "Body");
}

function ensureBody(doc: CadDocument, bodyId?: string, color?: string): Body {
  if (bodyId) return requireBody(doc, bodyId);
  const body: Body = {
    id: uid("bdy"),
    name: allocBodyName(doc),
    visible: true,
    consumed: false,
    color,
  };
  doc.bodies.push(body);
  return body;
}

function pushFeature(doc: CadDocument, feature: Feature) {
  doc.features.push(feature);
  touch(doc);
  return feature;
}

function checkpoint(doc: CadDocument, operation: string, label?: string) {
  const rev: Revision = {
    id: uid("rev"),
    index: doc.revisions.length + 1,
    parentId: doc.currentRevisionId,
    ts: Date.now(),
    label: label ?? operation,
    operation,
    snapshot: JSON.stringify({
      name: doc.name,
      parameters: doc.parameters,
      bodies: doc.bodies,
      features: doc.features,
      geometryRefs: doc.geometryRefs ?? [],
    }),
  };
  doc.revisions.push(rev);
  if (doc.revisions.length > 50) doc.revisions.splice(0, doc.revisions.length - 50);
  doc.currentRevisionId = rev.id;
  return rev;
}

function restore(doc: CadDocument, rev: Revision) {
  const snap = JSON.parse(rev.snapshot) as Pick<
    CadDocument,
    "name" | "parameters" | "bodies" | "features" | "geometryRefs"
  >;
  doc.name = snap.name;
  doc.parameters = snap.parameters;
  doc.bodies = snap.bodies;
  doc.features = snap.features;
  doc.geometryRefs = snap.geometryRefs ?? [];
  doc.currentRevisionId = rev.id;
  touch(doc);
}

function dim(v: Dim) {
  if (typeof v === "number") requirePositive(v, "dimension");
  return v;
}

function edgeSelector(op: { edges?: GeometrySelector; target?: GeometrySelector }, fallback: string): GeometrySelector {
  return normalizeSelector(op.target ?? op.edges, "edge", fallback);
}

export function applyOperation(input: CadDocument, op: Operation): { document: CadDocument; result: ToolResult } {
  const doc = cloneDocument(input);
  const t0 = performance.now();
  try {
    const result = applyMutating(doc, op);
    const durationMs = Math.round(performance.now() - t0);
    const mutating = isMutating(op.op);
    if (mutating && result.ok) checkpoint(doc, op.op);
    doc.log.push({
      id: uid("log"),
      ts: Date.now(),
      operation: op.op,
      args: JSON.parse(JSON.stringify(stripOp(op))) as JsonValue,
      ok: result.ok,
      error: result.error?.error,
      durationMs,
    });
    if (doc.log.length > 200) doc.log.splice(0, doc.log.length - 200);
    return { document: doc, result };
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    const fail =
      err instanceof Error && "body" in err
        ? {
            ok: false as const,
            operation: op.op,
            error: (err as { body: ToolResult["error"] }).body,
          }
        : {
            ok: false as const,
            operation: op.op,
            error: {
              error: "INVALID_REFERENCE" as const,
              message: err instanceof Error ? err.message : String(err),
            },
          };
    doc.log.push({
      id: uid("log"),
      ts: Date.now(),
      operation: op.op,
      args: JSON.parse(JSON.stringify(stripOp(op))) as JsonValue,
      ok: false,
      error: fail.error?.error,
      durationMs,
    });
    return { document: input, result: fail };
  }
}

function isMutating(op: string) {
  return ![
    "inspect_document",
    "inspect_body",
    "inspect_feature",
    "recompute",
    "validate",
    "list_revisions",
    "export_stl",
    "export_obj",
    "export_json",
    "export_step",
    "export_fcstd",
    "export_3mf",
    "kernel_status",
    "render_preview",
    "list_previews",
    "import_step",
    "import_fcstd",
    "import_file",
    "query_geometry",
    "inspect_faces",
    "inspect_edges",
    "resolve_faces",
    "resolve_edges",
    "inspect_assembly",
    "inspect_dependencies",
    "preview_parameter_change",
  ].includes(op);
}

function stripOp(op: Operation) {
  const { op: _o, ...rest } = op;
  return rest;
}

function firstEnvelope(doc: CadDocument, bodyId?: string) {
  const evaluation = evaluateDocument(doc);
  const bodies = evaluation.bodies.filter((b) => !bodyId || b.bodyId === bodyId || b.name === bodyId);
  const envBody = bodies.find((b) => b.faces.length) ?? bodies[0];
  const feat = doc.features.find((f) => f.kind === "box" && (!bodyId || f.bodyId === envBody?.bodyId));
  if (!envBody) return null;
  const origin = envBody.faces.find((f) => f.name === "bottom_face")?.origin ?? { x: 0, y: 0, z: 0 };
  const L = envBody.bbox.max.x - envBody.bbox.min.x;
  const W = envBody.bbox.max.y - envBody.bbox.min.y;
  const H = envBody.bbox.max.z - envBody.bbox.min.z;
  return {
    origin,
    L,
    W,
    H,
    createdBy: feat?.name,
    bodyId: envBody.bodyId,
  };
}

function queryOp(doc: CadDocument, entity: "face" | "edge", selector: GeometrySelector | undefined, bodyId?: string) {
  const env = firstEnvelope(doc, bodyId);
  if (!env) {
    throw cadError("GEOMETRY_SELECTOR_NO_MATCH", "No solid envelope is available to query.", {
      suggestion: "Create a box or pad first, or rebuild with FreeCAD for imported B-rep queries.",
    });
  }
  const vars = paramMap(doc);
  const sel = normalizeSelector(selector, entity, entity === "face" ? "planar" : "all_edges");
  sel.entity = entity;
  return queryEnvelopeGeometry(env, sel, vars);
}

function applyMutating(doc: CadDocument, op: Operation): ToolResult {
  switch (op.op) {
    case "create_document": {
      const fresh = cloneDocument(emptyDocument(op.name ?? "Untitled"));
      Object.assign(doc, fresh);
      return { ok: true, operation: op.op, data: { id: doc.id, name: doc.name } };
    }
    case "create_body": {
      const body = ensureBody(doc, undefined, op.color);
      if (op.name) body.name = allocBodyName(doc, op.name);
      return { ok: true, operation: op.op, data: { id: body.id, name: body.name } };
    }
    case "create_box": {
      dim(op.length_mm);
      dim(op.width_mm);
      dim(op.height_mm);
      const body = ensureBody(doc, op.body_id);
      const f = pushFeature(doc, {
        kind: "box",
        id: uid("feat"),
        name: allocFeatureName(doc, "Box", op.name),
        bodyId: body.id,
        suppressed: false,
        length: op.length_mm,
        width: op.width_mm,
        height: op.height_mm,
        origin: vec(op.origin),
      });
      return {
        ok: true,
        operation: op.op,
        data: { id: f.id, name: f.name, body_id: body.id, body_name: body.name, summary: summarizeFeature(f) },
      };
    }
    case "create_cylinder": {
      dim(op.radius_mm);
      dim(op.height_mm);
      const body = ensureBody(doc, op.body_id);
      const f = pushFeature(doc, {
        kind: "cylinder",
        id: uid("feat"),
        name: allocFeatureName(doc, "Cylinder", op.name),
        bodyId: body.id,
        suppressed: false,
        radius: op.radius_mm,
        height: op.height_mm,
        origin: vec(op.origin),
        axis: op.axis ?? "Z",
      });
      return {
        ok: true,
        operation: op.op,
        data: { id: f.id, name: f.name, body_id: body.id, summary: summarizeFeature(f) },
      };
    }
    case "create_sphere": {
      dim(op.radius_mm);
      const body = ensureBody(doc, op.body_id);
      const f = pushFeature(doc, {
        kind: "sphere",
        id: uid("feat"),
        name: allocFeatureName(doc, "Sphere", op.name),
        bodyId: body.id,
        suppressed: false,
        radius: op.radius_mm,
        origin: vec(op.origin),
      });
      return {
        ok: true,
        operation: op.op,
        data: { id: f.id, name: f.name, body_id: body.id, summary: summarizeFeature(f) },
      };
    }
    case "create_sketch": {
      const body = requireBody(doc, op.body_id);
      const f = pushFeature(doc, {
        kind: "sketch",
        id: uid("feat"),
        name: allocFeatureName(doc, "Sketch", op.name),
        bodyId: body.id,
        suppressed: false,
        plane: op.plane ?? "XY",
        origin: vec(op.origin),
        profiles: [],
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, plane: op.plane ?? "XY" } };
    }
    case "add_rectangle": {
      const sketch = requireFeature(doc, op.sketch_id);
      if (sketch.kind !== "sketch") {
        throw cadError("INVALID_REFERENCE", `'${op.sketch_id}' is not a sketch.`);
      }
      dim(op.width_mm);
      dim(op.height_mm);
      sketch.profiles.push({
        id: uid("prf"),
        type: "rectangle",
        x: op.x_mm,
        y: op.y_mm,
        width: op.width_mm,
        height: op.height_mm,
      });
      touch(doc);
      return {
        ok: true,
        operation: op.op,
        data: { sketch_id: sketch.id, profile_count: sketch.profiles.length },
      };
    }
    case "add_circle": {
      const sketch = requireFeature(doc, op.sketch_id);
      if (sketch.kind !== "sketch") {
        throw cadError("INVALID_REFERENCE", `'${op.sketch_id}' is not a sketch.`);
      }
      dim(op.radius_mm);
      sketch.profiles.push({
        id: uid("prf"),
        type: "circle",
        cx: op.cx_mm,
        cy: op.cy_mm,
        radius: op.radius_mm,
      });
      touch(doc);
      return {
        ok: true,
        operation: op.op,
        data: { sketch_id: sketch.id, profile_count: sketch.profiles.length },
      };
    }
    case "pad": {
      const sketch = requireFeature(doc, op.sketch_id);
      if (sketch.kind !== "sketch") {
        throw cadError("INVALID_REFERENCE", `'${op.sketch_id}' is not a sketch.`);
      }
      if (sketch.profiles.length === 0) throw cadError("EMPTY_SKETCH", "Sketch has no profiles to pad.");
      dim(op.depth_mm);
      const f = pushFeature(doc, {
        kind: "pad",
        id: uid("feat"),
        name: allocFeatureName(doc, "Pad", op.name),
        bodyId: sketch.bodyId,
        suppressed: false,
        sketchId: sketch.id,
        depth: op.depth_mm,
        reverse: op.reverse ?? false,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "pocket": {
      const sketch = requireFeature(doc, op.sketch_id);
      if (sketch.kind !== "sketch") {
        throw cadError("INVALID_REFERENCE", `'${op.sketch_id}' is not a sketch.`);
      }
      if (sketch.profiles.length === 0) throw cadError("EMPTY_SKETCH", "Sketch has no profiles to pocket.");
      dim(op.depth_mm);
      const f = pushFeature(doc, {
        kind: "pocket",
        id: uid("feat"),
        name: allocFeatureName(doc, "Pocket", op.name),
        bodyId: sketch.bodyId,
        suppressed: false,
        sketchId: sketch.id,
        depth: op.depth_mm,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "create_hole": {
      const body = requireBody(doc, op.body_id);
      const faceRaw = op.target_face ?? op.face ?? "top_face";
      const faceName = typeof faceRaw === "string" ? faceRaw : (faceRaw.selector as FaceName | undefined);
      if (typeof faceRaw === "string" && FACE_NAMES.includes(faceRaw as FaceName) === false && !faceRaw.includes("face") && faceRaw !== "largest_planar" && faceRaw !== "largest_planar_face") {
        throw cadError("UNKNOWN_FACE", `Unknown face '${faceRaw}'.`, {
          suggestion: `Use one of: ${FACE_NAMES.join(", ")} or a semantic face selector. Coordinates (x_mm, y_mm) are from the min-corner of that face.`,
        });
      }
      dim(op.diameter_mm);
      const holeType = op.type ?? (op.through === false || op.depth_mm !== undefined ? "blind" : "through");
      const through = op.through ?? holeType === "through";
      if (!through && op.depth_mm === undefined) {
        throw cadError("HOLE_CONFIGURATION_INVALID", "Blind holes require depth_mm.", {
          suggestion: "Pass depth_mm or set type/through to through.",
        });
      }
      if (op.counterbore_diameter_mm !== undefined && op.countersink_diameter_mm !== undefined) {
        throw cadError("HOLE_CONFIGURATION_INVALID", "A hole cannot be both counterbore and countersink.");
      }
      let u: Dim = op.x_mm ?? op.from_left_mm ?? 0;
      let v: Dim = op.y_mm ?? op.from_back_mm ?? 0;
      if (op.centered) {
        u = op.x_mm ?? "0";
        v = op.y_mm ?? "0";
      }
      const f = pushFeature(doc, {
        kind: "hole",
        id: uid("feat"),
        name: allocFeatureName(doc, "Hole", op.name),
        bodyId: body.id,
        suppressed: false,
        face: (faceName && FACE_NAMES.includes(faceName as FaceName) ? (faceName as FaceName) : faceRaw) as FaceName | GeometrySelector,
        u,
        v,
        diameter: op.diameter_mm,
        depth: op.depth_mm ?? 0,
        through,
        holeType,
        centered: op.centered,
        fromLeft: op.from_left_mm,
        fromRight: op.from_right_mm,
        fromFront: op.from_front_mm,
        fromBack: op.from_back_mm,
        counterbore:
          op.counterbore_diameter_mm !== undefined
            ? { diameter: op.counterbore_diameter_mm, depth: op.counterbore_depth_mm ?? 0 }
            : undefined,
        countersink:
          op.countersink_diameter_mm !== undefined
            ? { diameter: op.countersink_diameter_mm, angle: op.countersink_angle_deg ?? 90 }
            : undefined,
        thread: op.thread,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "fillet": {
      const body = requireBody(doc, op.body_id);
      dim(op.radius_mm);
      const f = pushFeature(doc, {
        kind: "fillet",
        id: uid("feat"),
        name: allocFeatureName(doc, "Fillet", op.name),
        bodyId: body.id,
        suppressed: false,
        edges: edgeSelector(op, "all_vertical"),
        radius: op.radius_mm,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "chamfer": {
      const body = requireBody(doc, op.body_id);
      dim(op.distance_mm);
      const f = pushFeature(doc, {
        kind: "chamfer",
        id: uid("feat"),
        name: allocFeatureName(doc, "Chamfer", op.name),
        bodyId: body.id,
        suppressed: false,
        edges: edgeSelector(op, "all_vertical"),
        distance: op.distance_mm,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "boolean": {
      const target = requireBody(doc, op.target_body_id);
      const tool = requireBody(doc, op.tool_body_id);
      if (target.id === tool.id) {
        throw cadError("INVALID_REFERENCE", "Boolean target and tool must be different bodies.");
      }
      const consumeTool = op.consume_tool ?? true;
      const f = pushFeature(doc, {
        kind: "boolean",
        id: uid("feat"),
        name: allocFeatureName(doc, "Boolean", op.name),
        bodyId: target.id,
        suppressed: false,
        operation: op.operation,
        toolBodyId: tool.id,
        consumeTool,
      });
      if (consumeTool) {
        tool.consumed = true;
        tool.visible = false;
      }
      return {
        ok: true,
        operation: op.op,
        data: { id: f.id, name: f.name, summary: summarizeFeature(f) },
      };
    }
    case "create_pattern": {
      const src = requireFeature(doc, op.feature_id);
      const count = op.count ?? op.count_x ?? 2;
      if (typeof count === "number" && count < 2) {
        throw cadError("PATTERN_CONFIGURATION_INVALID", "Pattern count must be at least 2.");
      }
      const kind = op.kind ?? (op.count_y !== undefined ? "rectangular" : "linear");
      if (kind === "circular") {
        throw cadError(
          "BACKEND_UNSUPPORTED",
          "Circular patterns are not implemented by the current backend.",
          {
            capability: "pattern.circular",
            suggestion: "Use a linear or rectangular pattern, or a backend that advertises pattern.circular.",
          },
        );
      }
      let dx: Dim = op.dx_mm ?? 0;
      let dy: Dim = op.dy_mm ?? 0;
      let dz: Dim = op.dz_mm ?? 0;
      const spacing = op.spacing_mm;
      const dir = (op.direction ?? "x").toString().toLowerCase();
      if (spacing !== undefined && op.dx_mm === undefined && op.dy_mm === undefined && op.dz_mm === undefined) {
        if (dir === "x") dx = spacing;
        else if (dir === "y") dy = spacing;
        else if (dir === "z") dz = spacing;
        else dx = spacing;
      }
      const f = pushFeature(doc, {
        kind: "pattern",
        id: uid("feat"),
        name: allocFeatureName(doc, "Pattern", op.name),
        bodyId: src.bodyId,
        suppressed: false,
        sourceFeatureId: src.id,
        patternKind: kind,
        count,
        dx,
        dy,
        dz,
        countX: op.count_x,
        countY: op.count_y,
        spacingX: op.spacing_x_mm ?? (kind === "rectangular" ? spacing : undefined),
        spacingY: op.spacing_y_mm,
        direction: op.direction,
      });
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, summary: summarizeFeature(f) } };
    }
    case "define_parameter": {
      if (!isIdent(op.name)) {
        throw cadError("PARSE_ERROR", "Parameter names must be identifiers (letters, digits, underscore).");
      }
      setParam(doc, {
        name: op.name,
        value: op.value,
        unit: op.unit ?? "mm",
        expression: op.expression,
      });
      paramMap(doc);
      touch(doc);
      return { ok: true, operation: op.op, data: { name: op.name, value: op.value } };
    }
    case "set_parameter": {
      const p = doc.parameters.find((x) => x.name === op.name);
      if (!p) {
        throw cadError("UNKNOWN_PARAMETER", `Parameter '${op.name}' is not defined.`, {
          suggestion: "Call define_parameter first.",
        });
      }
      if (op.value !== undefined) p.value = op.value;
      if (op.expression !== undefined) p.expression = op.expression;
      touch(doc);
      const vars = paramMap(doc);
      return { ok: true, operation: op.op, data: { name: p.name, value: vars[p.name], unit: p.unit } };
    }
    case "set_feature_param": {
      const f = requireFeature(doc, op.feature_id);
      setFeatureParam(f, op.param, op.value);
      touch(doc);
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name, param: op.param, value: op.value } };
    }
    case "rename_feature": {
      const f = requireFeature(doc, op.feature_id);
      if (allNames(doc).includes(op.name) && f.name !== op.name) {
        throw cadError("DUPLICATE_NAME", `Name '${op.name}' is already used.`);
      }
      f.name = op.name;
      touch(doc);
      return { ok: true, operation: op.op, data: { id: f.id, name: f.name } };
    }
    case "delete_feature": {
      const f = requireFeature(doc, op.feature_id);
      doc.features = doc.features.filter((x) => x.id !== f.id);
      touch(doc);
      return { ok: true, operation: op.op, data: { deleted: f.name } };
    }
    case "rename_body": {
      const b = requireBody(doc, op.body_id);
      b.name = allocBodyName(doc, op.name);
      touch(doc);
      return { ok: true, operation: op.op, data: { id: b.id, name: b.name } };
    }
    case "set_visibility": {
      const b = requireBody(doc, op.body_id);
      b.visible = op.visible;
      touch(doc);
      return { ok: true, operation: op.op, data: { id: b.id, visible: b.visible } };
    }
    case "inspect_document": {
      const evaluation = evaluateDocument(doc);
      return { ok: true, operation: op.op, data: inspectDocument(doc, evaluation) };
    }
    case "inspect_body": {
      const b = requireBody(doc, op.body_id);
      const evaluation = evaluateDocument(doc);
      return { ok: true, operation: op.op, data: inspectBody(doc, b.id, evaluation) };
    }
    case "inspect_feature": {
      const f = requireFeature(doc, op.feature_id);
      return {
        ok: true,
        operation: op.op,
        data: { ...inspectFeature(doc, f.id), depends_on: featureDependsOn(f) },
      };
    }
    case "query_geometry": {
      const entity = op.entity ?? (typeof op.selector === "object" && op.selector?.entity) ?? "edge";
      const data = queryOp(doc, entity === "face" ? "face" : "edge", op.selector, op.body_id);
      return { ok: true, operation: op.op, data };
    }
    case "inspect_faces":
    case "resolve_faces": {
      const data = queryOp(doc, "face", op.selector, op.body_id);
      return { ok: true, operation: op.op, data };
    }
    case "inspect_edges":
    case "resolve_edges": {
      const data = queryOp(doc, "edge", op.selector, op.body_id);
      return { ok: true, operation: op.op, data };
    }
    case "inspect_dependencies": {
      return { ok: true, operation: op.op, data: inspectDependencies(doc, op.name) };
    }
    case "preview_parameter_change": {
      return { ok: true, operation: op.op, data: previewParameterChange(doc, op.name, op.value) };
    }
    case "recompute": {
      const evaluation = evaluateDocument(doc);
      return {
        ok: evaluation.ok,
        operation: op.op,
        data: {
          ok: evaluation.ok,
          issues: evaluation.issues,
          volume_mm3: evaluation.volumeMm3,
          triangle_count: evaluation.triangleCount,
        },
        warnings: evaluation.issues.filter((i) => i.severity === "warning").map((i) => i.message),
      };
    }
    case "validate": {
      const evaluation = evaluateDocument(doc);
      return {
        ok: evaluation.ok,
        operation: op.op,
        data: {
          ok: evaluation.ok,
          issues: evaluation.issues,
          bodies: evaluation.bodies.map((b) => ({
            id: b.bodyId,
            name: b.name,
            valid: b.valid,
            volume_mm3: b.volumeMm3,
            bbox: b.bbox,
          })),
        },
      };
    }
    case "save_revision": {
      const rev = checkpoint(doc, "save_revision", op.label ?? "checkpoint");
      return { ok: true, operation: op.op, data: { id: rev.id, index: rev.index, label: rev.label } };
    }
    case "list_revisions": {
      return {
        ok: true,
        operation: op.op,
        data: doc.revisions.map((r) => ({
          id: r.id,
          index: r.index,
          label: r.label,
          operation: r.operation,
          ts: r.ts,
          current: r.id === doc.currentRevisionId,
        })),
      };
    }
    case "rollback_revision": {
      const rev = doc.revisions.find((r) => r.id === op.revision_id || String(r.index) === op.revision_id);
      if (!rev) throw cadError("UNKNOWN_REVISION", `Revision '${op.revision_id}' was not found.`);
      restore(doc, rev);
      return { ok: true, operation: op.op, data: { id: rev.id, index: rev.index, label: rev.label } };
    }
    case "export_stl": {
      const evaluation = evaluateDocument(doc);
      const meshes = evaluation.bodies
        .filter((b) => b.mesh && b.visible && !b.consumed && (!op.body_id || b.bodyId === op.body_id || b.name === op.body_id))
        .map((b) => b.mesh!);
      if (meshes.length === 0) {
        throw cadError("INVALID_SOLID", "Nothing to export — no visible solid geometry.");
      }
      return {
        ok: true,
        operation: op.op,
        data: {
          format: "stl",
          ascii: meshesToStl(meshes, doc.name),
          triangle_count: meshes.reduce((n, m) => n + m.triangleCount, 0),
        },
      };
    }
    case "export_obj": {
      const evaluation = evaluateDocument(doc);
      const meshes = evaluation.bodies
        .filter((b) => b.mesh && b.visible && !b.consumed && (!op.body_id || b.bodyId === op.body_id || b.name === op.body_id))
        .map((b) => b.mesh!);
      if (meshes.length === 0) {
        throw cadError("INVALID_SOLID", "Nothing to export — no visible solid geometry.");
      }
      return {
        ok: true,
        operation: op.op,
        data: { format: "obj", ascii: meshesToObj(meshes, doc.name) },
      };
    }
    case "export_json": {
      return {
        ok: true,
        operation: op.op,
        data: {
          format: "agentcad.json",
          document: {
            name: doc.name,
            units: doc.units,
            parameters: doc.parameters,
            bodies: doc.bodies,
            features: doc.features,
          },
        },
      };
    }
    case "export_step":
    case "export_fcstd":
    case "export_3mf":
      throw cadError(
        "KERNEL_UNAVAILABLE",
        `${op.op} is produced by the FreeCAD/OpenCascade kernel, not the in-browser preview.`,
        { suggestion: "Use Lab → FreeCAD export, or call this tool from the agent (server-side)." },
      );
    case "kernel_status":
      return {
        ok: true,
        operation: op.op,
        data: {
          preview: "jscad",
          authoritative: "freecad",
          note: "Viewport tessellation uses JSCAD. FCStd/STEP/STL-from-OCC require the FreeCAD worker.",
        },
      };
    case "render_preview":
    case "list_previews":
    case "import_step":
    case "import_fcstd":
    case "import_file":
      throw cadError(
        "KERNEL_UNAVAILABLE",
        `${op.op} is a service operation (preview/import). Call it through AgentCadService, MCP, CLI, or HTTP.`,
        { suggestion: "Use the Lab preview button, `agentcad preview`, or the render_preview tool on a project." },
      );
    case "create_assembly":
      return asmCreate(doc, op);
    case "define_component":
      return asmDefineComponent(doc, op);
    case "create_instance":
      return asmCreateInstance(doc, op);
    case "fix_instance":
      return asmFixInstance(doc, op);
    case "set_instance_transform":
      return asmSetInstanceTransform(doc, op);
    case "set_definition_parameter":
      return asmSetDefParam(doc, op);
    case "mate_faces":
      return asmMateFaces(doc, op);
    case "align_axes":
      return asmAlignAxes(doc, op);
    case "set_distance":
      return asmSetDistance(doc, op);
    case "set_angle":
      return asmSetAngle(doc, op);
    case "remove_constraint":
      return asmRemoveConstraint(doc, op);
    case "inspect_assembly":
      return asmInspect(doc, op);
    default:
      throw cadError("INVALID_REFERENCE", `Unknown operation.`);
  }
}

function setFeatureParam(f: Feature, param: string, value: Dim) {
  const key = param.replace(/_mm$/, "");
  switch (f.kind) {
    case "box":
      if (key === "length") f.length = value;
      else if (key === "width") f.width = value;
      else if (key === "height") f.height = value;
      else if (key === "origin_x" || key === "x") f.origin.x = value;
      else if (key === "origin_y" || key === "y") f.origin.y = value;
      else if (key === "origin_z" || key === "z") f.origin.z = value;
      else throw unknownParam(f, param);
      break;
    case "cylinder":
      if (key === "radius") f.radius = value;
      else if (key === "height") f.height = value;
      else throw unknownParam(f, param);
      break;
    case "sphere":
      if (key === "radius") f.radius = value;
      else throw unknownParam(f, param);
      break;
    case "pad":
    case "pocket":
      if (key === "depth") f.depth = value;
      else throw unknownParam(f, param);
      break;
    case "hole":
      if (key === "diameter") f.diameter = value;
      else if (key === "depth") f.depth = value;
      else if (key === "x" || key === "u") f.u = value;
      else if (key === "y" || key === "v") f.v = value;
      else throw unknownParam(f, param);
      break;
    case "fillet":
      if (key === "radius") f.radius = value;
      else throw unknownParam(f, param);
      break;
    case "chamfer":
      if (key === "distance") f.distance = value;
      else throw unknownParam(f, param);
      break;
    case "pattern":
      if (key === "count") f.count = value;
      else if (key === "dx") f.dx = value;
      else if (key === "dy") f.dy = value;
      else if (key === "dz") f.dz = value;
      else throw unknownParam(f, param);
      break;
    default:
      throw unknownParam(f, param);
  }
}

function unknownParam(f: Feature, param: string): never {
  throw cadError("UNKNOWN_PARAMETER", `Feature '${f.name}' has no parameter '${param}'.`);
}

export function applyAll(doc: CadDocument, ops: Operation[]): { document: CadDocument; results: ToolResult[] } {
  let current = doc;
  const results: ToolResult[] = [];
  for (const op of ops) {
    const r = applyOperation(current, op);
    current = r.document;
    results.push(r.result);
    if (!r.result.ok) break;
  }
  return { document: current, results };
}
