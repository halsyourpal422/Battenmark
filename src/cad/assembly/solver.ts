/**
 * Battenmark assembly constraint resolver.
 *
 * Deterministic, bounded, rigid-transform subset:
 *   - Constraints are evaluated in insertion order; the SECOND referenced
 *     instance is the moved one. Grounded (fixed) instances never move.
 *   - Reference geometry is resolved kernel-free from the component
 *     definition's own evaluation (FaceFrames / cylinder features), then
 *     transformed into world space by the instance's current transform.
 *   - Contradictory duplicates (same pair, same kind, different value) raise
 *     CONSTRAINT_CONFLICT. Unsatisfiable leftovers raise ASSEMBLY_UNSOLVED.
 *
 * This is intentionally NOT a general geometric constraint solver. See
 * docs/adr/0001-assembly-ir.md for the solver boundary rationale.
 */
import type {
  Assembly,
  AssemblyConstraint,
  AssemblyRef,
  AssemblyTransform,
  CadDocument,
  ComponentDefinition,
  Vec3,
} from "../types";
import { cadError } from "../errors";
import { evaluateDocument } from "../evaluate";
import { resolveParameters } from "../expressions";
import { EDGE_SELECTOR_KINDS, FACE_SELECTOR_KINDS, normalizeSelector, queryEnvelopeGeometry } from "../selectors";
import type { FaceFrame } from "../types";
import {
  addVec,
  applyTransform,
  composeTransform,
  crossVec,
  dotVec,
  EPS,
  normalizeVec,
  quatFromAxisAngle,
  quatFromTo,
  rotateVector,
  scaleVec,
  subVec,
  vecLen,
  type RigidTransform,
} from "./transforms";

export interface ResolvedFrame {
  kind: "plane" | "axis" | "point";
  point: Vec3;
  normal?: Vec3;
  direction?: Vec3;
  uDir?: Vec3;
  vDir?: Vec3;
  widthMm?: number;
  heightMm?: number;
  radiusMm?: number;
  label: string;
}

export type ConstraintStatus = "applied" | "redundant" | "deferred";

export interface ConstraintReport {
  id: string;
  kind: AssemblyConstraint["kind"];
  status: ConstraintStatus;
  moved?: string;
  detail?: string;
}

export interface InstanceDof {
  instanceId: string;
  remainingDof: number;
  freeTranslation: number;
  freeRotation: number;
}

export interface SolvedAssembly {
  solved: boolean;
  placements: Record<string, AssemblyTransform>;
  constraints: ConstraintReport[];
  dof: InstanceDof[];
  worldBBox: { min: Vec3; max: Vec3 } | null;
}

const MAX_PASSES = 4;

function requireAssembly(doc: CadDocument, id: string): Assembly {
  const asm = doc.assemblies?.find((a) => a.id === id || a.name === id);
  if (!asm) {
    throw cadError("ASSEMBLY_NOT_FOUND", `Assembly '${id}' was not found.`, {
      suggestion: "Call create_assembly first.",
    });
  }
  return asm;
}

function requireInstance(asm: Assembly, id: string) {
  const inst = asm.instances.find((i) => i.id === id);
  if (!inst) {
    throw cadError("INSTANCE_NOT_FOUND", `Instance '${id}' was not found in this assembly.`, {
      assembly: asm.id,
      suggestion: "Call create_instance first; ids are stable identity, not array positions.",
    });
  }
  return inst;
}

function definitionOf(asm: Assembly, instanceId: string): ComponentDefinition {
  const inst = requireInstance(asm, instanceId);
  const def = asm.definitions.find((d) => d.id === inst.componentId);
  if (!def) {
    throw cadError("COMPONENT_NOT_FOUND", `Component '${inst.componentId}' was not found.`, {
      assembly: asm.id,
    });
  }
  return def;
}

function defDocument(def: ComponentDefinition): CadDocument {
  return {
    schemaVersion: 2,
    id: `def_${def.id}`,
    name: def.name,
    units: "mm",
    createdAt: 0,
    updatedAt: 0,
    parameters: def.parameters,
    bodies: def.bodies,
    features: def.features,
    log: [],
    revisions: [],
    currentRevisionId: null,
  };
}

const KNOWN_FACE_NAMES = new Set([
  "top_face", "bottom_face", "front_face", "back_face", "right_face", "left_face",
]);

function faceFrameByName(def: ComponentDefinition, name: string): ResolvedFrame | null {
  const evaluation = evaluateDocument(defDocument(def));
  for (const body of evaluation.bodies) {
    if (body.consumed || !body.visible) continue;
    const ff: FaceFrame | undefined = body.faces.find((f) => f.name === name);
    if (ff) {
      return {
        kind: "plane",
        point: ff.origin,
        normal: normalizeVec(ff.normal),
        uDir: ff.uDir,
        vDir: ff.vDir,
        widthMm: ff.width,
        heightMm: ff.height,
        label: name,
      };
    }
  }
  const isKnownKind =
    (FACE_SELECTOR_KINDS as readonly string[]).includes(name) ||
    (EDGE_SELECTOR_KINDS as readonly string[]).includes(name);
  if (!KNOWN_FACE_NAMES.has(name) && isKnownKind) {
    // Semantic-selector fallback with honest multiplicity semantics.
    const matches: import("../types").GeometryMatch[] = [];
    for (const body of evaluation.bodies) {
      if (body.consumed || !body.visible || !body.mesh) continue;
      const env = envelopeOf(body);
      const vars = resolveParameters(def.parameters);
      const sel = normalizeSelector(name, "face", "planar");
      const res = queryEnvelopeGeometry(env, sel, vars);
      matches.push(...res.matches);
    }
    if (matches.length > 1) {
      throw cadError(
        "GEOMETRY_REFERENCE_AMBIGUOUS",
        `Selector '${name}' matched ${matches.length} candidate faces on component '${def.id}'; no arbitrary choice is made.`,
        { component: def.id, match_count: matches.length },
      );
    }
    if (matches.length === 1 && matches[0]!.normal && matches[0]!.centroid) {
      return {
        kind: "plane",
        point: matches[0]!.centroid,
        normal: normalizeVec(matches[0]!.normal),
        label: name,
      };
    }
  }
  return null;
}

function envelopeOf(body: { bbox: { min: Vec3; max: Vec3 }; mesh: unknown }) {
  return {
    origin: body.bbox.min,
    L: body.bbox.max.x - body.bbox.min.x,
    W: body.bbox.max.y - body.bbox.min.y,
    H: body.bbox.max.z - body.bbox.min.z,
    createdBy: undefined as string | undefined,
    bodyId: "",
  };
}

function axisFrame(def: ComponentDefinition, spec: string): ResolvedFrame | null {
  if (spec === "X") return { kind: "axis", point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, label: "axis X" };
  if (spec === "Y") return { kind: "axis", point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, label: "axis Y" };
  if (spec === "Z") return { kind: "axis", point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 }, label: "axis Z" };
  // Cylindrical geometry: hole or cylinder feature whose name/id matches the spec.
  const params = resolveParameters(def.parameters);
  const dim = (v: unknown): number => (typeof v === "number" ? v : Number(params[String(v)] ?? NaN));
  for (const f of def.features) {
    if (f.kind !== "hole" && f.kind !== "cylinder") continue;
    const bodyName = def.bodies.find((b) => b.id === f.bodyId)?.name;
    const matches =
      f.name === spec || f.id === spec || bodyName === spec || String(spec).length === 0;
    if (!matches) continue;
    if (f.kind === "cylinder") {
      const origin = {
        x: typeof f.origin.x === "number" ? f.origin.x : Number(params[String(f.origin.x)] ?? 0),
        y: typeof f.origin.y === "number" ? f.origin.y : Number(params[String(f.origin.y)] ?? 0),
        z: typeof f.origin.z === "number" ? f.origin.z : Number(params[String(f.origin.z)] ?? 0),
      };
      const dir =
        f.axis === "X" ? { x: 1, y: 0, z: 0 } : f.axis === "Y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
      return {
        kind: "axis",
        point: origin,
        direction: dir,
        radiusMm: dim(f.radius),
        label: `${f.name} axis`,
      };
    }
    // hole: derive its axis from the host face frame.
    const faceName = typeof f.face === "string" && !String(f.face).includes("{") ? f.face : null;
    if (!faceName) continue;
    const host = faceFrameByName(def, faceName);
    if (!host) continue;
    const u = typeof f.u === "number" ? f.u : Number(params[String(f.u)] ?? 0);
    const v = typeof f.v === "number" ? f.v : Number(params[String(f.v)] ?? 0);
    const alongU = scaleVec(host.uDir ?? { x: 1, y: 0, z: 0 }, u);
    const alongV = scaleVec(host.vDir ?? { x: 0, y: 1, z: 0 }, v);
    const center = addVec(addVec(host.point, alongU), alongV);
    return {
      kind: "axis",
      point: center,
      direction: host.normal!,
      radiusMm: dim(f.diameter) / 2,
      label: `${f.name} axis`,
    };
  }
  return null;
}

function resolveComponentRef(def: ComponentDefinition, ref: AssemblyRef): ResolvedFrame {
  if (ref.axis !== undefined) {
    if (typeof ref.axis !== "string") {
      throw cadError(
        "INVALID_ASSEMBLY_REFERENCE",
        "Structured axis selectors are not supported yet: reference cylindrical/hole features by feature or body name, or use X/Y/Z.",
        { component: def.id },
      );
    }
    const axisResolved = axisFrame(def, ref.axis);
    if (!axisResolved) {
      throw cadError("INVALID_ASSEMBLY_REFERENCE", `Axis '${ref.axis}' did not resolve on '${def.id}'.`, {
        component: def.id,
      });
    }
    return axisResolved;
  }
  const faceSpec = ref.face;
  if (faceSpec === undefined) {
    throw cadError("INVALID_ASSEMBLY_REFERENCE", "Reference needs a face or an axis.", { component: def.id });
  }
  const evaluation = evaluateDocument(defDocument(def));
  if (typeof faceSpec === "string" && KNOWN_FACE_NAMES.has(faceSpec)) {
    for (const body of evaluation.bodies) {
      if (body.consumed || !body.visible) continue;
      const ff = body.faces.find((f) => f.name === faceSpec);
      if (ff) {
        return {
          kind: "plane", point: ff.origin, normal: normalizeVec(ff.normal),
          uDir: ff.uDir, vDir: ff.vDir, widthMm: ff.width, heightMm: ff.height, label: faceSpec,
        };
      }
    }
    throw cadError("GEOMETRY_REFERENCE_LOST", `Face '${faceSpec}' did not resolve on '${def.id}'.`, { component: def.id });
  }
  // Semantic selector (string kind, structured object, or gref): one canonical
  // path through queryEnvelopeGeometry, which owns gref/nearest/unique rules.
  // Unknown free-text names are LOST, never defaulted to a match-all kind.
  const isKnownKind =
    typeof faceSpec === "string" &&
    (FACE_SELECTOR_KINDS as readonly string[]).includes(faceSpec);
  const isStructured =
    typeof faceSpec === "object" &&
    faceSpec !== null &&
    (("gref" in faceSpec) || ("nearest" in faceSpec) || ("centroid_near" in faceSpec) ||
      ("within_bbox" in faceSpec) || ("selector" in (faceSpec as Record<string, unknown>)));
  if (typeof faceSpec === "string" && !isKnownKind) {
    throw cadError("GEOMETRY_REFERENCE_LOST", `Face '${faceSpec}' did not resolve on '${def.id}'.`, {
      component: def.id,
    });
  }
  if (typeof faceSpec !== "string" && !isStructured) {
    throw cadError("GEOMETRY_REFERENCE_LOST", "Reference did not resolve on this component.", {
      component: def.id,
    });
  }
  const matches: import("../types").GeometryMatch[] = [];
  const vars = resolveParameters(def.parameters);
  for (const body of evaluation.bodies) {
    if (body.consumed || !body.visible || !body.mesh) continue;
    const sel = normalizeSelector(faceSpec as never, "face", "planar");
    const res = queryEnvelopeGeometry(envelopeOf(body), sel, vars);
    matches.push(...res.matches);
  }
  if (matches.length === 0) {
    throw cadError("GEOMETRY_REFERENCE_LOST", `Selector did not match any face on '${def.id}'.`, {
      component: def.id,
      selector: typeof faceSpec === "string" ? faceSpec : JSON.stringify(faceSpec),
    });
  }
  if (matches.length > 1) {
    throw cadError(
      "GEOMETRY_REFERENCE_AMBIGUOUS",
      `Selector matched ${matches.length} faces on '${def.id}'; no arbitrary choice is made.`,
      { component: def.id, match_count: matches.length },
    );
  }
  const m = matches[0]!;
  if (!m.centroid || !m.normal) {
    throw cadError("INVALID_ASSEMBLY_REFERENCE", `Matched face on '${def.id}' lacks centroid/normal for constraint use.`, {});
  }
  return { kind: "plane", point: m.centroid, normal: normalizeVec(m.normal), label: String(m.semantic_id) };
}

function resolveRef(asm: Assembly, ref: AssemblyRef): ResolvedFrame {
  const def = definitionOf(asm, ref.instance);
  const local = resolveComponentRef(def, ref);
  const T = requireInstance(asm, ref.instance).transform as unknown as RigidTransform;
  return {
    ...local,
    point: applyTransform(T, local.point),
    normal: local.normal ? rotateVector(T.rotation, local.normal) : undefined,
    direction: local.direction ? rotateVector(T.rotation, local.direction) : undefined,
  };
}

function selectorText(sel: unknown): string | null {
  if (typeof sel === "string") return sel;
  if (sel && typeof sel === "object") {
    const o = sel as Record<string, unknown>;
    if (typeof o.selector === "string") return o.selector;
    if (typeof o.gref === "string") return o.gref;
  }
  return null;
}

function pairKey(c: AssemblyConstraint): string | null {
  if (c.refs.length !== 2) return null;
  return [c.refs[0].instance, c.kind, refLabel(c.refs[0]), c.refs[1].instance, refLabel(c.refs[1])]
    .map((s) => String(s))
    .join("|");
}

/** Deterministic canonical serialization: object keys sorted, arrays ordered. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Canonical model-level reference identity: type-prefixed, order-independent,
 *  never dependent on JS object string coercion. */
function refLabel(r: AssemblyRef): string {
  if (r.axis !== undefined) return `axis:${typeof r.axis === "string" ? r.axis : stableStringify(r.axis)}`;
  return `face:${typeof r.face === "string" ? r.face : stableStringify(r.face)}`;
}

function checkConflicts(asm: Assembly): void {
  const seen = new Map<string, AssemblyConstraint>();
  for (const c of asm.constraints) {
    const key = pairKey(c);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, c);
      continue;
    }
    const valueOf = (x: AssemblyConstraint) => x.distanceMm ?? x.angleDeg ?? x.offsetMm ?? 0;
    if (Math.abs(valueOf(prev) - valueOf(c)) > 1e-6) {
      throw cadError(
        "CONSTRAINT_CONFLICT",
        `Constraints '${prev.id}' and '${c.id}' demand different values (${valueOf(prev)} vs ${valueOf(c)}) for the same references.`,
        { constraint_a: prev.id, constraint_b: c.id },
      );
    }
  }
}


function secondRef(c: AssemblyConstraint): AssemblyRef {
  const r = c.refs[1];
  if (!r) throw cadError("INVALID_ASSEMBLY_REFERENCE", "Constraint needs two references.", { constraint: c.id });
  return r;
}

function worldFrames(asm: Assembly, c: AssemblyConstraint) {
  const a = resolveRef(asm, c.refs[0]);
  const b = resolveRef(asm, secondRef(c));
  return { a, b };
}

function applyConstraint(asm: Assembly, c: AssemblyConstraint): { moved: string } | "redundant" {
  const bInst = requireInstance(asm, secondRef(c).instance);
  if (bInst.fixed) {
    throw cadError("CONSTRAINT_CONFLICT", `Constraint '${c.id}' cannot move grounded instance '${bInst.id}'.`, {
      instance: bInst.id,
    });
  }
  const current = bInst.transform as unknown as RigidTransform;

  switch (c.kind) {
    case "mate_faces": {
      const { a, b } = worldFrames(asm, c);
      if (!a.normal || !b.normal) throw invalidRef(c, "planar faces");
      const offset = c.offsetMm ?? 0;
      // Rotate so the moving face opposes the anchor normal.
      const qDelta = quatFromTo(b.normal!, scaleVec(a.normal!, -1));
      let T = composeTransform({ translation: { x: 0, y: 0, z: 0 }, rotation: qDelta }, current);
      // Slide along anchor normal so planes coincide (+offset gap).
      const pbNew = applyTransform(T, localPoint(asm, secondRef(c)));
      const gap = dotVec(subVec(a.point, pbNew), a.normal!) + offset;
      T = { translation: addVec(T.translation, scaleVec(a.normal!, gap)), rotation: T.rotation };
      bInst.transform = T as unknown as AssemblyTransform;
      return { moved: bInst.id };
    }
    case "align_axes":
    case "concentric": {
      const { a, b } = worldFrames(asm, c);
      const da = a.direction ?? a.normal;
      const db = b.direction ?? b.normal;
      if (!da || !db) throw invalidRef(c, "axes");
      const qDelta = quatFromTo(db!, da!);
      let T = composeTransform({ translation: { x: 0, y: 0, z: 0 }, rotation: qDelta }, current);
      if (c.kind === "concentric") {
        // Pull the moving axis line onto the anchor axis line: full offset
        // vector (perpendicular + axial). Axial DOF remains conceptually free,
        // but exact coincidence is the deterministic choice.
        const pbNew = applyTransform(T, localPoint(asm, secondRef(c)));
        T = { translation: addVec(T.translation, subVec(a.point, pbNew)), rotation: T.rotation };
      }
      bInst.transform = T as unknown as AssemblyTransform;
      return { moved: bInst.id };
    }
    case "distance": {
      const { a, b } = worldFrames(asm, c);
      if (!a.normal) throw invalidRef(c, "planar faces");
      const pb = b.point;
      const currentGap = dotVec(subVec(a.point, pb), a.normal!);
      // Positive distance = physical air gap along the anchor's outward normal:
      // the moving face lands at anchor + normal * d (touching when d = 0).
      const delta = currentGap + (c.distanceMm ?? 0);
      bInst.transform = {
        translation: addVec(current.translation, scaleVec(a.normal!, delta)),
        rotation: current.rotation,
      } as unknown as AssemblyTransform;
      return { moved: bInst.id };
    }
    case "angle": {
      const { a, b } = worldFrames(asm, c);
      if (!a.normal || !b.normal) throw invalidRef(c, "planar faces");
      const k = crossVec(a.normal!, b.normal!);
      if (vecLen(k) < EPS) return "redundant";
      const cur = Math.atan2(vecLen(k), dotVec(a.normal!, b.normal!)) * (180 / Math.PI);
      const want = c.angleDeg ?? 90;
      const deltaDeg = want - cur;
      const pivotLocal = localPoint(asm, secondRef(c));
      const pivotWorld = applyTransform(current, pivotLocal);
      const qDelta = quatFromAxisAngle(normalizeVec(k), deltaDeg);
      const rotOnly = composeTransform({ translation: pivotWorld, rotation: qDelta }, invertAround(pivotWorld, current));
      bInst.transform = rotOnly as unknown as AssemblyTransform;
      return { moved: bInst.id };
    }
    default:
      throw cadError("CONSTRAINT_UNSUPPORTED", `Constraint kind '${c.kind}' is not supported yet.`, {
        constraint: c.id,
      });
  }
}

function invertAround(pivot: Vec3, t: RigidTransform): RigidTransform {
  // Translation-only shift of pivot to origin (rotation applied about pivot by caller composition).
  return { translation: subVec(t.translation, pivot), rotation: t.rotation };
}

function localPoint(asm: Assembly, ref: AssemblyRef): Vec3 {
  // Same canonical resolver as world-space lookups: the pivot is the actual
  // selected geometry's local point. No silent origin fallback.
  const def = definitionOf(asm, ref.instance);
  return resolveComponentRef(def, ref).point;
}

function projectOnAxis(v: Vec3, axis: Vec3): number {
  return dotVec(v, normalizeVec(axis));
}

function invalidRef(c: AssemblyConstraint, want: string): never {
  throw cadError("INVALID_ASSEMBLY_REFERENCE", `Constraint '${c.kind}' requires ${want}.`, {
    constraint: c.id,
  });
}

function meshWorldBBox(doc: CadDocument, asm: Assembly, placements: Record<string, AssemblyTransform>) {
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;
  const grow = (p: Vec3) => {
    if (!min) min = { ...p };
    if (!max) max = { ...p };
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max!.x = Math.max(max!.x, p.x); max!.y = Math.max(max!.y, p.y); max!.z = Math.max(max!.z, p.z);
  };
  for (const inst of asm.instances) {
    const def = asm.definitions.find((d) => d.id === inst.componentId)!;
    const ev = evaluateDocument(defDocument(def));
    const T = placements[inst.id] as unknown as RigidTransform;
    for (const b of ev.bodies) {
      if (!b.mesh || b.consumed || !b.visible) continue;
      const pos = b.mesh.positions;
      for (let i = 0; i < pos.length; i += 3) {
        grow(applyTransform(T, { x: pos[i]!, y: pos[i + 1]!, z: pos[i + 2]! }));
      }
    }
  }
  return min && max ? { min, max } : null;
}

/** Solve an assembly deterministically and report honest constraint/DOF state. */
export function solveAssembly(doc: CadDocument, assemblyId: string): SolvedAssembly {
  const asm = requireAssembly(doc, assemblyId);
  checkConflicts(asm);

  const reports = new Map<string, ConstraintReport>();
  for (const inst of asm.instances) {
    if (inst.fixed) {
      reports.set(`fixed:${inst.id}`, {
        id: `fixed:${inst.id}`,
        kind: "fixed",
        status: "applied",
        detail: "grounded at stored transform",
      });
    }
  }

  let progress = true;
  let pass = 0;
  const pending = new Set(asm.constraints.map((c) => c.id));
  while (progress && pass < MAX_PASSES) {
    progress = false;
    pass += 1;
    for (const c of asm.constraints) {
      if (!pending.has(c.id)) continue;
      let outcome: { moved: string } | "redundant";
      try {
        outcome = applyConstraint(asm, c);
      } catch (err) {
        // Reference resolution failures propagate as-is; solver bookkeeping unwinds naturally.
        throw err;
      }
      pending.delete(c.id);
      progress = true;
      reports.set(c.id, {
        id: c.id,
        kind: c.kind,
        status: outcome === "redundant" ? "redundant" : "applied",
        moved: outcome === "redundant" ? undefined : outcome.moved,
      });
    }
  }
  for (const c of asm.constraints) {
    if (pending.has(c.id)) {
      reports.set(c.id, { id: c.id, kind: c.kind, status: "deferred", detail: "could not be applied in order" });
    }
  }

  const placements: Record<string, AssemblyTransform> = {};
  const dof: InstanceDof[] = [];
  for (const inst of asm.instances) {
    placements[inst.id] = inst.transform;
    if (!inst.fixed) {
      // Coarse honest accounting: each applied constraint that MOVED this
      // instance removed DOF; exact symbolic counting is out of Phase 6 scope.
      const movedCount = [...reports.values()].filter((r) => r.moved === inst.id && r.status === "applied").length;
      const remaining = Math.max(0, 6 - Math.min(6, movedCount));
      dof.push({ instanceId: inst.id, remainingDof: remaining, freeTranslation: Math.min(3, remaining), freeRotation: Math.max(0, remaining - 3) });
    } else {
      dof.push({ instanceId: inst.id, remainingDof: 0, freeTranslation: 0, freeRotation: 0 });
    }
  }

  const deferred = [...reports.values()].filter((r) => r.status === "deferred");
  const worldBBox = meshWorldBBox(doc, asm, placements);
  return {
    solved: deferred.length === 0,
    placements,
    constraints: [...reports.values()],
    dof,
    worldBBox,
  };
}
