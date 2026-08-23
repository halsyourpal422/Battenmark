/**
 * Assembly operation implementations. Called from operations.ts; each function
 * mutates a cloned document and returns a ToolResult. All identity rules:
 * instance/component ids are stable identity — array position means nothing.
 */
import type {
  Assembly,
  AssemblyConstraint,
  AssemblyRef,
  AssemblyTransform,
  CadDocument,
  ComponentDefinition,
  Dim,
  ToolResult,
  Vec3Expr,
} from "../types";
import { cadError } from "../errors";
import { uid } from "../ids";
import { evaluateExpression, resolveParameters } from "../expressions";
import { detectImportFormat, resolveReadablePath } from "../service/ingest";
import { solveAssembly } from "./solver";
import { identityTransform } from "./transforms";

export const ASSEMBLY_LIMITS = {
  maxDefinitions: 128,
  maxInstances: 512,
  maxConstraints: 1024,
} as const;

function requireAsm(doc: CadDocument, id: string): Assembly {
  const asm = doc.assemblies?.find((a) => a.id === id || a.name === id);
  if (!asm) {
    throw cadError("ASSEMBLY_NOT_FOUND", `Assembly '${id}' was not found.`, {
      suggestion: "Call create_assembly first.",
    });
  }
  return asm;
}

function resolveDimNum(doc: CadDocument, v: Dim | undefined, fallback = 0): number {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "number") return v;
  const expr = typeof v === "object" && "expr" in v ? v.expr : v;
  const out = Number(evaluateExpression(expr, resolveParameters(doc.parameters)));
  if (!Number.isFinite(out)) {
    throw cadError("EXPRESSION_ERROR", `Expression '${expr}' did not resolve to a number.`);
  }
  return out;
}

function toTransform(
  doc: CadDocument,
  position?: Partial<Vec3Expr>,
  rotation?: { x: Dim; y: Dim; z: Dim },
): AssemblyTransform {
  const t = identityTransform();
  if (position) {
    t.translation = {
      x: resolveDimNum(doc, position.x),
      y: resolveDimNum(doc, position.y),
      z: resolveDimNum(doc, position.z),
    };
  }
  if (rotation) {
    // Euler XYZ degrees -> quaternion via the canonical transforms module
    // (kept dependency-light here to avoid a cycle: inline minimal conversion).
    const rad = Math.PI / 180;
    const rx = resolveDimNum(doc, rotation.x) * rad;
    const ry = resolveDimNum(doc, rotation.y) * rad;
    const rz = resolveDimNum(doc, rotation.z) * rad;
    const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
    const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
    const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
    // q = qz * qy * qx (intrinsic XYZ)
    t.rotation = {
      w: cz * cy * cx + sz * sy * sx,
      x: cz * cy * sx - sz * sy * cx,
      y: cz * sy * cx + sz * cy * sx,
      z: sz * cy * cx - cz * sy * sx,
    };
  }
  return t;
}

export function createAssembly(doc: CadDocument, op: Extract<import("../types").Operation, { op: "create_assembly" }>): ToolResult {
  doc.assemblies ??= [];
  const id = op.assembly_id ?? uid("asm");
  if (doc.assemblies.some((a) => a.id === id)) {
    throw cadError("DUPLICATE_NAME", `Assembly '${id}' already exists.`);
  }
  const name = op.name ?? id;
  if (doc.assemblies.some((a) => a.name === name && a.id !== id)) {
    throw cadError("DUPLICATE_NAME", `Assembly name '${name}' is already used by another assembly in this document.`);
  }
  doc.assemblies.push({ id, name, definitions: [], instances: [], constraints: [] });
  return { ok: true, operation: "create_assembly", data: { assembly_id: id, name } };
}

export function defineComponent(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "define_component" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  if (asm.definitions.length >= ASSEMBLY_LIMITS.maxDefinitions) {
    throw cadError("ASSEMBLY_LIMIT_EXCEEDED", `Component definition limit (${ASSEMBLY_LIMITS.maxDefinitions}) reached.`);
  }
  const id = op.component_id ?? uid("cmp");
  if (asm.definitions.some((d) => d.id === id)) {
    throw cadError("DUPLICATE_NAME", `Component '${id}' already exists in this assembly.`);
  }

  let def: ComponentDefinition;
  if (op.source_format) {
    if (!op.source_path) {
      throw cadError("MALFORMED_REQUEST", "source_path is required when source_format is given.");
    }
    // Reuse the single-part import security policy: format whitelist,
    // existence check, workspace-scoped path resolution (no traversal).
    const format = detectImportFormat(op.source_path, op.source_format);
    const absPath = resolveReadablePath(op.source_path);
    def = {
      id,
      name: op.name ?? id,
      source: {
        kind: "imported",
        format,
        sourcePath: absPath,
        note: "Imported geometry component — carries no Battenmark parametric history.",
      },
      parameters: [],
      bodies: [],
      features: [],
    };
  } else {
    const wanted = op.include?.body_ids;
    const bodies = structuredClone(wanted ? doc.bodies.filter((b) => wanted.includes(b.id) || wanted.includes(b.name)) : doc.bodies);
    const bodyIds = new Set(bodies.map((b) => b.id));
    const features = structuredClone(doc.features.filter((f) => bodyIds.has(f.bodyId)));
    if (bodies.length === 0) {
      throw cadError("EMPTY_SKETCH", "No bodies matched this component definition scope.");
    }
    def = {
      id,
      name: op.name ?? id,
      source: { kind: "native" },
      parameters: structuredClone(doc.parameters),
      bodies,
      features,
    };
  }
  asm.definitions.push(def);
  return {
    ok: true,
    operation: "define_component",
    data: {
      assembly_id: asm.id,
      component_id: id,
      source: def.source.kind,
      parametric: def.source.kind === "native",
      bodies: def.bodies.length,
      features: def.features.length,
      note: def.source.kind === "imported" ? def.source.note : undefined,
    },
  };
}

export function createInstance(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "create_instance" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  if (asm.instances.length >= ASSEMBLY_LIMITS.maxInstances) {
    throw cadError("ASSEMBLY_LIMIT_EXCEEDED", `Instance limit (${ASSEMBLY_LIMITS.maxInstances}) reached.`);
  }
  if (!asm.definitions.some((d) => d.id === op.component_id)) {
    throw cadError("COMPONENT_NOT_FOUND", `Component '${op.component_id}' was not found.`, {
      assembly: asm.id,
      suggestion: "Call define_component first.",
    });
  }
  let instanceId = op.instance_id ?? `${op.component_id}_1`;
  if (!op.instance_id) {
    let n = 1;
    while (asm.instances.some((i) => i.id === instanceId)) {
      n += 1;
      instanceId = `${op.component_id}_${n}`;
    }
  }
  if (asm.instances.some((i) => i.id === instanceId)) {
    throw cadError("DUPLICATE_NAME", `Instance '${instanceId}' already exists. Instance ids are stable identity.`);
  }
  const transform = toTransform(doc, op.position, op.rotation_euler_xyz_deg);
  asm.instances.push({ id: instanceId, componentId: op.component_id, transform, fixed: false });
  return {
    ok: true,
    operation: "create_instance",
    data: { assembly_id: asm.id, instance_id: instanceId, component_id: op.component_id, transform },
  };
}

export function fixInstance(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "fix_instance" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const inst = asm.instances.find((i) => i.id === op.instance_id);
  if (!inst) {
    throw cadError("INSTANCE_NOT_FOUND", `Instance '${op.instance_id}' was not found.`, { assembly: asm.id });
  }
  inst.fixed = true;
  return { ok: true, operation: "fix_instance", data: { assembly_id: asm.id, instance_id: inst.id, fixed: true } };
}

export function setInstanceTransform(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "set_instance_transform" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const inst = asm.instances.find((i) => i.id === op.instance_id);
  if (!inst) throw cadError("INSTANCE_NOT_FOUND", `Instance '${op.instance_id}' was not found.`, { assembly: asm.id });
  if (op.position) {
    inst.transform.translation = {
      x: resolveDimNum(doc, op.position.x, inst.transform.translation.x),
      y: resolveDimNum(doc, op.position.y, inst.transform.translation.y),
      z: resolveDimNum(doc, op.position.z, inst.transform.translation.z),
    };
  }
  if (op.rotation_euler_xyz_deg) {
    inst.transform.rotation = toTransform(doc, undefined, op.rotation_euler_xyz_deg).rotation;
  }
  return { ok: true, operation: "set_instance_transform", data: { assembly_id: asm.id, instance_id: inst.id, transform: inst.transform } };
}

export function setDefinitionParameter(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "set_definition_parameter" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const def = asm.definitions.find((d) => d.id === op.component_id);
  if (!def) throw cadError("COMPONENT_NOT_FOUND", `Component '${op.component_id}' was not found.`, { assembly: asm.id });
  if (def.source.kind === "imported") {
    throw cadError(
      "UNKNOWN_PARAMETER",
      `Component '${def.id}' is imported geometry and has no Battenmark parameters.`,
      { suggestion: "Parameters apply to native component definitions only." },
    );
  }
  const p = def.parameters.find((x) => x.name === op.name);
  if (!p) {
    throw cadError("UNKNOWN_PARAMETER", `Component '${def.id}' has no parameter '${op.name}'.`, {
      available: def.parameters.map((x) => x.name),
    });
  }
  p.value = op.value;
  p.expression = undefined;
  return {
    ok: true,
    operation: "set_definition_parameter",
    data: { assembly_id: asm.id, component_id: def.id, parameter: op.name, value: op.value },
  };
}

function requireTwoRefs(
  asm: Assembly,
  aInstance: string,
  bInstance: string,
): [AssemblyRef, AssemblyRef] {
  if (!asm.instances.some((i) => i.id === aInstance)) {
    throw cadError("INSTANCE_NOT_FOUND", `Instance '${aInstance}' was not found.`, { assembly: asm.id });
  }
  if (!asm.instances.some((i) => i.id === bInstance)) {
    throw cadError("INSTANCE_NOT_FOUND", `Instance '${bInstance}' was not found.`, { assembly: asm.id });
  }
  return [{ instance: aInstance }, { instance: bInstance }] as [AssemblyRef, AssemblyRef];
}

function pushConstraint(asm: Assembly, c: Omit<AssemblyConstraint, "id">): AssemblyConstraint {
  if (asm.constraints.length >= ASSEMBLY_LIMITS.maxConstraints) {
    throw cadError("ASSEMBLY_LIMIT_EXCEEDED", `Constraint limit (${ASSEMBLY_LIMITS.maxConstraints}) reached.`);
  }
  const full = { ...c, id: `c_${asm.constraints.length + 1}` } as AssemblyConstraint;
  asm.constraints.push(full);
  return full;
}

type MateOp = Extract<import("../types").Operation, { op: "mate_faces" }>;
type AxisOp = Extract<import("../types").Operation, { op: "align_axes" }>;
type DistOp = Extract<import("../types").Operation, { op: "set_distance" }>;
type AngleOp = Extract<import("../types").Operation, { op: "set_angle" }>;
type ParOp = Extract<import("../types").Operation, { op: "set_parallel" }>;
type PerpOp = Extract<import("../types").Operation, { op: "set_perpendicular" }>;

export function mateFaces(doc: CadDocument, op: MateOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].face = op.a_face;
  refs[1].face = op.b_face;
  const c = pushConstraint(asm, { kind: "mate_faces", refs, offsetMm: op.offset_mm ?? 0 });
  return { ok: true, operation: "mate_faces", data: { assembly_id: asm.id, constraint_id: c.id } };
}

export function alignAxes(doc: CadDocument, op: AxisOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].axis = op.a_axis;
  refs[1].axis = op.b_axis;
  const kind = op.concentric ? "concentric" : "align_axes";
  const c = pushConstraint(asm, { kind, refs });
  return { ok: true, operation: "align_axes", data: { assembly_id: asm.id, constraint_id: c.id, kind } };
}

export function setDistance(doc: CadDocument, op: DistOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].face = op.a_ref;
  refs[1].face = op.b_ref;
  const c = pushConstraint(asm, { kind: "distance", refs, distanceMm: op.distance_mm });
  return { ok: true, operation: "set_distance", data: { assembly_id: asm.id, constraint_id: c.id, distance_mm: op.distance_mm } };
}

export function setAngle(doc: CadDocument, op: AngleOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].face = op.a_ref;
  refs[1].face = op.b_ref;
  const c = pushConstraint(asm, { kind: "angle", refs, angleDeg: op.angle_deg });
  return { ok: true, operation: "set_angle", data: { assembly_id: asm.id, constraint_id: c.id, angle_deg: op.angle_deg } };
}

export function setParallel(doc: CadDocument, op: ParOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].face = op.a_ref;
  refs[1].face = op.b_ref;
  const c = pushConstraint(asm, { kind: "parallel", refs });
  return { ok: true, operation: "set_parallel", data: { assembly_id: asm.id, constraint_id: c.id } };
}

export function setPerpendicular(doc: CadDocument, op: PerpOp): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const refs = requireTwoRefs(asm, op.a_instance, op.b_instance);
  refs[0].face = op.a_ref;
  refs[1].face = op.b_ref;
  const c = pushConstraint(asm, { kind: "perpendicular", refs });
  return { ok: true, operation: "set_perpendicular", data: { assembly_id: asm.id, constraint_id: c.id } };
}

export function removeConstraint(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "remove_constraint" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const before = asm.constraints.length;
  asm.constraints = asm.constraints.filter((c) => c.id !== op.constraint_id);
  if (asm.constraints.length === before) {
    throw cadError("CONSTRAINT_NOT_FOUND", `Constraint '${op.constraint_id}' was not found.`, { assembly: asm.id });
  }
  return { ok: true, operation: "remove_constraint", data: { assembly_id: asm.id, removed: op.constraint_id } };
}

/** Read-only: structural snapshot + deterministic solve report. */
export function inspectAssembly(
  doc: CadDocument,
  op: Extract<import("../types").Operation, { op: "inspect_assembly" }>,
): ToolResult {
  const asm = requireAsm(doc, op.assembly_id);
  const solved = solveAssembly(doc, asm.id);
  return {
    ok: true,
    operation: "inspect_assembly",
    data: {
      assembly_id: asm.id,
      name: asm.name,
      definitions: asm.definitions.map((d) => ({
        id: d.id,
        name: d.name,
        source: d.source.kind,
        parametric: d.source.kind === "native",
        bodies: d.bodies.length,
        features: d.features.length,
        parameters: d.parameters.map((p) => p.name),
      })),
      instances: asm.instances.map((i) => ({
        id: i.id,
        component_id: i.componentId,
        fixed: i.fixed,
        transform: solved.placements[i.id],
        remaining_dof: solved.dof.find((d) => d.instanceId === i.id)?.remainingDof ?? null,
      })),
      constraints: solved.constraints,
      solved: solved.solved,
      world_bbox: solved.worldBBox,
      counts: {
        definitions: asm.definitions.length,
        instances: asm.instances.length,
        constraints: asm.constraints.length,
      },
    },
  };
}
