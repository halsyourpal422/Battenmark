export type Units = "mm";

export type PlaneName = "XY" | "XZ" | "YZ";

export type AxisName = "X" | "Y" | "Z";

export type FaceName =
  | "top_face"
  | "bottom_face"
  | "front_face"
  | "back_face"
  | "right_face"
  | "left_face";

export const FACE_NAMES: FaceName[] = [
  "top_face",
  "bottom_face",
  "front_face",
  "back_face",
  "right_face",
  "left_face",
];

/** Number, parameter expression string, or `{ expr }` object. */
export type Dim = number | string | { expr: string };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Placement/origin whose axes may be expressions (`"wall"`, `"length / 2"`). */
export interface Vec3Expr {
  x: Dim;
  y: Dim;
  z: Dim;
}

export type GeometryEntity = "edge" | "face" | "vertex";

export type GeometryConfidence = "exact" | "strong" | "ambiguous" | "missing";

/**
 * Intent-based geometry reference. Prefer named selectors over OCC indices.
 * A string shorthand such as `"top_perimeter"` is accepted.
 */
export type GeometrySelector =
  | string
  | {
      entity?: GeometryEntity;
      selector?: string;
      created_by?: string;
      adjacent_to?: GeometrySelector;
      nearest?: Partial<Vec3Expr>;
      within_bbox?: { min: Partial<Vec3Expr>; max: Partial<Vec3Expr> };
      length_between?: { min: Dim; max: Dim };
      centroid_near?: Partial<Vec3Expr>;
      gref?: string;
      unique?: boolean;
    };

export interface GeometryMatch {
  semantic_id: string;
  entity: GeometryEntity;
  occt_index?: number;
  surface_type?: string;
  curve_type?: string;
  area_mm2?: number;
  length_mm?: number;
  centroid?: Vec3;
  midpoint?: Vec3;
  normal?: Vec3;
  direction?: Vec3;
  radius_mm?: number;
  bbox?: { min: Vec3; max: Vec3 };
  role?: string;
  convex?: boolean;
  created_by?: string;
  fingerprint?: Record<string, string | number | boolean | null>;
  confidence?: GeometryConfidence;
}

export interface GeometryQueryResult {
  selector: GeometrySelector;
  entity: GeometryEntity;
  kernel: "jscad" | "freecad";
  match_count: number;
  matches: GeometryMatch[];
  confidence: GeometryConfidence;
  note?: string;
}

export interface GeometryRef {
  id: string;
  entity: GeometryEntity;
  bodyId: string;
  selector: GeometrySelector;
  fingerprint: Record<string, string | number | boolean | null>;
  lastRevisionId?: string | null;
}

export interface Parameter {
  name: string;
  value: number;
  unit: "mm" | "deg" | "count";
  expression?: string;
}

export interface SketchProfileRect {
  id: string;
  type: "rectangle";
  x: Dim;
  y: Dim;
  width: Dim;
  height: Dim;
}

export interface SketchProfileCircle {
  id: string;
  type: "circle";
  cx: Dim;
  cy: Dim;
  radius: Dim;
}

export type SketchProfile = SketchProfileRect | SketchProfileCircle;

interface FeatureBase {
  id: string;
  name: string;
  bodyId: string;
  suppressed: boolean;
}

export type HoleType = "through" | "blind";

export type PatternKind = "linear" | "rectangular" | "circular";

export type Feature =
  | (FeatureBase & {
      kind: "box";
      length: Dim;
      width: Dim;
      height: Dim;
      origin: Vec3Expr;
    })
  | (FeatureBase & {
      kind: "cylinder";
      radius: Dim;
      height: Dim;
      origin: Vec3Expr;
      axis: AxisName;
    })
  | (FeatureBase & {
      kind: "sphere";
      radius: Dim;
      origin: Vec3Expr;
    })
  | (FeatureBase & {
      kind: "sketch";
      plane: PlaneName;
      origin: Vec3Expr;
      profiles: SketchProfile[];
    })
  | (FeatureBase & {
      kind: "pad";
      sketchId: string;
      depth: Dim;
      reverse: boolean;
    })
  | (FeatureBase & {
      kind: "pocket";
      sketchId: string;
      depth: Dim;
    })
  | (FeatureBase & {
      kind: "hole";
      face: FaceName | GeometrySelector;
      u: Dim;
      v: Dim;
      diameter: Dim;
      depth: Dim;
      through: boolean;
      holeType?: HoleType;
      fromLeft?: Dim;
      fromRight?: Dim;
      fromFront?: Dim;
      fromBack?: Dim;
      counterbore?: { diameter: Dim; depth: Dim };
      countersink?: { diameter: Dim; angle: Dim };
      thread?: string;
      centered?: boolean;
    })
  | (FeatureBase & {
      kind: "fillet";
      edges: GeometrySelector;
      radius: Dim;
    })
  | (FeatureBase & {
      kind: "chamfer";
      edges: GeometrySelector;
      distance: Dim;
    })
  | (FeatureBase & {
      kind: "boolean";
      operation: "union" | "subtract" | "intersect";
      toolBodyId: string;
      consumeTool: boolean;
    })
  | (FeatureBase & {
      kind: "pattern";
      sourceFeatureId: string;
      patternKind: PatternKind;
      count: Dim;
      dx: Dim;
      dy: Dim;
      dz: Dim;
      countX?: Dim;
      countY?: Dim;
      spacingX?: Dim;
      spacingY?: Dim;
      direction?: AxisName | string;
    })
  | (FeatureBase & {
      kind: "imported_solid";
      sourceFormat: "step" | "fcstd" | "iges" | "stl" | "obj" | "3mf";
      sourceName: string;
      sourcePath: string;
      volumeMm3: number;
      bbox: { min: Vec3; max: Vec3 };
      solidCount: number;
      parametric: false;
      tessellation?: number[];
    });

export interface Body {
  id: string;
  name: string;
  visible: boolean;
  consumed: boolean;
  color?: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LogEntry {
  id: string;
  ts: number;
  operation: string;
  args: JsonValue;
  ok: boolean;
  error?: string;
  warning?: string;
  durationMs: number;
}

export interface Revision {
  id: string;
  index: number;
  parentId: string | null;
  ts: number;
  label: string;
  operation: string;
  snapshot: string;
  kernelSnapshot?: {
    kernel: "jscad" | "freecad";
    fcstdPath?: string;
    hash?: string;
    validation?: { valid: boolean; volume_mm3?: number; shape_type?: string };
  };
}

export interface CadDocument {
  schemaVersion: 1 | 2;
  id: string;
  name: string;
  units: Units;
  createdAt: number;
  updatedAt: number;
  parameters: Parameter[];
  bodies: Body[];
  features: Feature[];
  log: LogEntry[];
  revisions: Revision[];
  currentRevisionId: string | null;
  geometryRefs?: GeometryRef[];
}

export type CadErrorCode =
  | "UNKNOWN_BODY"
  | "UNKNOWN_FEATURE"
  | "UNKNOWN_SKETCH"
  | "UNKNOWN_PARAMETER"
  | "UNKNOWN_FACE"
  | "UNKNOWN_REVISION"
  | "DUPLICATE_NAME"
  | "ZERO_DIMENSION"
  | "NEGATIVE_VALUE"
  | "INVALID_NUMBER"
  | "EXPRESSION_ERROR"
  | "INVALID_EXPRESSION"
  | "PARAMETER_CYCLE"
  | "UNIT_MISMATCH"
  | "HOLE_OUTSIDE_FACE"
  | "HOLE_DIAMETER_INVALID"
  | "HOLE_CONFIGURATION_INVALID"
  | "POCKET_DEPTH_EXCEEDS_BODY"
  | "FILLET_RADIUS_TOO_LARGE"
  | "CHAMFER_DISTANCE_TOO_LARGE"
  | "BOOLEAN_MISSING_SOLID"
  | "EMPTY_SKETCH"
  | "NO_DOCUMENT"
  | "TESSELLATION_FAILED"
  | "INVALID_SOLID"
  | "INVALID_REFERENCE"
  | "PRIVILEGED_DENIED"
  | "PARSE_ERROR"
  | "WORKER_CRASHED"
  | "OPERATION_TIMEOUT"
  | "KERNEL_UNAVAILABLE"
  | "EXPORT_FAILED"
  | "RECOMPUTE_FAILED"
  | "PATH_DENIED"
  | "FILLET_FAILED"
  | "CHAMFER_FAILED"
  | "INVALID_SHAPE"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_EXISTS"
  | "PROJECT_BUSY"
  | "ARTIFACT_NOT_FOUND"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "MALFORMED_REQUEST"
  | "IDEMPOTENCY_CONFLICT"
  | "IMPORT_FAILED"
  | "IMPORT_NOT_PARAMETRIC"
  | "UNSUPPORTED_FORMAT"
  | "PREVIEW_FAILED"
  | "GEOMETRY_SELECTOR_NO_MATCH"
  | "GEOMETRY_SELECTOR_MULTIPLE_MATCHES"
  | "GEOMETRY_REFERENCE_LOST"
  | "GEOMETRY_REFERENCE_AMBIGUOUS"
  | "INVALID_GEOMETRY_SELECTOR"
  | "PATTERN_CONFIGURATION_INVALID"
  | "BACKEND_UNSUPPORTED"
  | "SCHEMA_MISMATCH"
  | "BACKEND_UNAVAILABLE"
  | "BACKEND_NOT_FOUND"
  | "BACKEND_ROLE_CONFLICT"
  | "BACKEND_REGISTRATION_CONFLICT";


export interface CadErrorBody {
  error: CadErrorCode;
  message: string;
  suggestion?: string;
  feature?: string;
  body?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  ok: boolean;
  operation: string;
  data?: unknown;
  error?: CadErrorBody;
  warnings?: string[];
}

export interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  featureId?: string;
  bodyId?: string;
  suggestion?: string;
}

export interface MeshData {
  bodyId: string;
  bodyName: string;
  positions: Float32Array;
  normals: Float32Array;
  triangleCount: number;
  bbox: { min: Vec3; max: Vec3 };
  volumeMm3: number;
  color?: string;
}

export interface FaceFrame {
  name: FaceName;
  origin: Vec3;
  uDir: Vec3;
  vDir: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  thickness: number;
}

export interface BodyEval {
  bodyId: string;
  name: string;
  visible: boolean;
  consumed: boolean;
  volumeMm3: number;
  bbox: { min: Vec3; max: Vec3 };
  triangleCount: number;
  faces: FaceFrame[];
  mesh: MeshData | null;
  valid: boolean;
  issues: Issue[];
}

export interface Evaluation {
  ok: boolean;
  issues: Issue[];
  bodies: BodyEval[];
  triangleCount: number;
  volumeMm3: number;
  bbox: { min: Vec3; max: Vec3 } | null;
}

export type Operation =
  | { op: "create_document"; name?: string }
  | { op: "create_body"; name?: string; color?: string }
  | {
      op: "create_box";
      body_id?: string;
      name?: string;
      length_mm: Dim;
      width_mm: Dim;
      height_mm: Dim;
      origin?: Partial<Vec3Expr>;
    }
  | {
      op: "create_cylinder";
      body_id?: string;
      name?: string;
      radius_mm: Dim;
      height_mm: Dim;
      origin?: Partial<Vec3Expr>;
      axis?: AxisName;
    }
  | {
      op: "create_sphere";
      body_id?: string;
      name?: string;
      radius_mm: Dim;
      origin?: Partial<Vec3Expr>;
    }
  | {
      op: "create_sketch";
      body_id: string;
      name?: string;
      plane?: PlaneName;
      origin?: Partial<Vec3Expr>;
    }
  | {
      op: "add_rectangle";
      sketch_id: string;
      x_mm: Dim;
      y_mm: Dim;
      width_mm: Dim;
      height_mm: Dim;
    }
  | {
      op: "add_circle";
      sketch_id: string;
      cx_mm: Dim;
      cy_mm: Dim;
      radius_mm: Dim;
    }
  | {
      op: "pad";
      sketch_id: string;
      depth_mm: Dim;
      name?: string;
      reverse?: boolean;
    }
  | { op: "pocket"; sketch_id: string; depth_mm: Dim; name?: string }
  | {
      op: "create_hole";
      body_id: string;
      face?: FaceName | GeometrySelector;
      target_face?: FaceName | GeometrySelector;
      x_mm?: Dim;
      y_mm?: Dim;
      from_left_mm?: Dim;
      from_front_mm?: Dim;
      from_right_mm?: Dim;
      from_back_mm?: Dim;
      centered?: boolean;
      diameter_mm: Dim;
      depth_mm?: Dim;
      through?: boolean;
      type?: HoleType;
      counterbore_diameter_mm?: Dim;
      counterbore_depth_mm?: Dim;
      countersink_diameter_mm?: Dim;
      countersink_angle_deg?: Dim;
      thread?: string;
      name?: string;
    }
  | {
      op: "fillet";
      body_id: string;
      radius_mm: Dim;
      edges?: GeometrySelector;
      target?: GeometrySelector;
      name?: string;
    }
  | {
      op: "chamfer";
      body_id: string;
      distance_mm: Dim;
      edges?: GeometrySelector;
      target?: GeometrySelector;
      name?: string;
    }
  | {
      op: "boolean";
      target_body_id: string;
      tool_body_id: string;
      operation: "union" | "subtract" | "intersect";
      name?: string;
      consume_tool?: boolean;
    }
  | {
      op: "create_pattern";
      feature_id: string;
      count?: Dim;
      dx_mm?: Dim;
      dy_mm?: Dim;
      dz_mm?: Dim;
      kind?: PatternKind;
      direction?: AxisName | string;
      spacing_mm?: Dim;
      count_x?: Dim;
      count_y?: Dim;
      spacing_x_mm?: Dim;
      spacing_y_mm?: Dim;
      name?: string;
    }
  | {
      op: "define_parameter";
      name: string;
      value: number;
      unit?: Parameter["unit"];
      expression?: string;
    }
  | {
      op: "set_parameter";
      name: string;
      value?: number;
      expression?: string;
    }
  | {
      op: "set_feature_param";
      feature_id: string;
      param: string;
      value: Dim;
    }
  | { op: "rename_feature"; feature_id: string; name: string }
  | { op: "delete_feature"; feature_id: string }
  | { op: "rename_body"; body_id: string; name: string }
  | { op: "set_visibility"; body_id: string; visible: boolean }
  | { op: "inspect_document" }
  | { op: "inspect_body"; body_id: string }
  | { op: "inspect_feature"; feature_id: string }
  | {
      op: "query_geometry";
      body_id?: string;
      entity?: GeometryEntity;
      selector?: GeometrySelector;
      created_by?: string;
    }
  | { op: "inspect_faces"; body_id?: string; selector?: GeometrySelector }
  | { op: "inspect_edges"; body_id?: string; selector?: GeometrySelector }
  | { op: "resolve_faces"; body_id?: string; selector?: GeometrySelector }
  | { op: "resolve_edges"; body_id?: string; selector?: GeometrySelector }
  | { op: "inspect_dependencies"; name: string }
  | { op: "preview_parameter_change"; name: string; value: number }
  | { op: "recompute" }
  | { op: "validate" }
  | { op: "save_revision"; label?: string }
  | { op: "list_revisions" }
  | { op: "rollback_revision"; revision_id: string }
  | { op: "export_stl"; body_id?: string }
  | { op: "export_obj"; body_id?: string }
  | { op: "export_json" }
  | { op: "export_step"; body_id?: string }
  | { op: "export_fcstd" }
  | { op: "export_3mf"; body_id?: string }
  | { op: "kernel_status" }
  | { op: "inspect_backend_capabilities" }
  | {
      op: "render_preview";
      view?: string;
      width?: number;
      height?: number;
    }
  | { op: "list_previews" }
  | {
      op: "import_step";
      path?: string;
      artifact_id?: string;
      name?: string;
      body_id?: string;
    }
  | {
      op: "import_fcstd";
      path?: string;
      artifact_id?: string;
      name?: string;
      body_id?: string;
    }
  | {
      op: "import_file";
      path?: string;
      artifact_id?: string;
      format?: string;
      name?: string;
      body_id?: string;
    };
