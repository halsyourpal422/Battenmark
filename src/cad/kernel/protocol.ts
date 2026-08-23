/** NDJSON protocol between the AgentCAD server and the FreeCAD worker. */

export type WorkerOperation =
  | "hello"
  | "ping"
  | "rebuild"
  | "inspect"
  | "validate"
  | "export"
  | "import"
  | "query"
  | "shutdown";

export interface WorkerRequest {
  id: string;
  operation: WorkerOperation;
  document?: unknown;
  arguments?: Record<string, unknown>;
  format?: string;
  path?: string;
  body_id?: string;
}

export interface WorkerError {
  code: string;
  message: string;
  field?: string;
  received?: unknown;
  feature?: string;
  traceback?: string;
  [key: string]: unknown;
}

export interface WorkerResponse<T = unknown> {
  id: string | null;
  ok: boolean;
  result?: T;
  error?: WorkerError;
  warnings?: unknown[];
  duration_ms?: number;
  type?: "ready";
}

export interface HelloResult {
  freecad_version: string;
  freecad_revision?: string | null;
  python_version: string;
  modules: Record<string, boolean>;
  pid: number;
  headless: boolean;
  executable?: string;
  gui?: boolean;
  dev_python?: boolean;
}

export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

export interface BBoxMm {
  min: Vec3Mm;
  max: Vec3Mm;
  x?: number;
  y?: number;
  z?: number;
}

export interface KernelIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  feature?: string;
  body?: string;
  suggestion?: string;
}

export interface InspectResult {
  document: { freecad_name: string; label?: string; object_count: number };
  bodies: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  parameters: Record<string, number>;
  bounding_box: BBoxMm | null;
  solid_count: number;
  volume_mm3: number;
  surface_area_mm2: number;
  valid: boolean;
  issues: KernelIssue[];
  shape_type: string;
  mapping?: Record<string, string>;
  object_count?: number;
  rebuild_ms?: number;
}

export interface ValidateResult {
  valid: boolean;
  shape_type: string;
  solid_count: number;
  volume_mm3: number;
  surface_area_mm2: number;
  bounding_box: BBoxMm | null;
  issues: KernelIssue[];
  self_intersection?: { checked: boolean; note: string };
}

export interface ExportResult {
  format: string;
  path: string;
  bytes: number;
  objects: string[];
}
