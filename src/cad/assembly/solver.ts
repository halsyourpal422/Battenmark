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
  AssemblyConstraintKind,
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
  normalizeQuat,
  quatMultiply,
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
  removedDof?: number;
  residual?: string;
  reason?: string;
}

export interface DofReport {
  instanceId: string;
  remainingDof: number;
  freeTranslation: string[];
  freeRotation: string[];
}

export type AssemblyConstraintState = "fully_constrained" | "underconstrained" | "conflicted" | "unsolved";

/**
 * Linearized rigid-body DOF rows in the solved world frame:
 * rows[0..2] constrain translation along x/y/z, rows[3..5] rotation about
 * x/y/z. Rank of the collected rows gives remaining freedom. This is a
 * first-order (Level-1) model relative to solved anchors — exact for
 * axis-aligned fixtures, an honest linearization otherwise. See
 * docs/adr/0002-assembly-dof-model.md.
 */
/**
 * Linearized rigid-body constraint rows in the solved world frame.
 *
 * Every row is exactly six elements: [Tx, Ty, Tz, Rx, Ry, Rz].
 * translationRow restricts translational columns only; rotationRow restricts
 * rotational columns only. The distinction is deliberate and load-bearing —
 * see docs/adr/0002-assembly-dof-model.md.
 */
export function translationRow(v: Vec3): number[] {
  return [v.x, v.y, v.z, 0, 0, 0];
}

export function rotationRow(v: Vec3): number[] {
  return [0, 0, 0, v.x, v.y, v.z];
}

export function constraintRows(c: AssemblyConstraint, frames: { a: ResolvedFrame; b: ResolvedFrame }): number[][] {
  const rows: number[][] = [];
  switch (c.kind) {
    case "fixed":
      return [
        translationRow({ x: 1, y: 0, z: 0 }),
        translationRow({ x: 0, y: 1, z: 0 }),
        translationRow({ x: 0, y: 0, z: 1 }),
        rotationRow({ x: 1, y: 0, z: 0 }),
        rotationRow({ x: 0, y: 1, z: 0 }),
        rotationRow({ x: 0, y: 0, z: 1 }),
      ];
    case "mate_faces": {
      // Plane coincidence: one translation along the normal, two rotations
      // that would tilt the normal. In-plane slide and spin stay free.
      const n = normalizeVec(frames.a.normal ?? { x: 0, y: 0, z: 1 });
      const { first, second } = orthogonalPair(n);
      return [translationRow(n), rotationRow(first), rotationRow(second)];
    }
    case "distance": {
      // Signed separation along the anchor normal: one translational row.
      const n = normalizeVec(frames.a.normal ?? { x: 0, y: 0, z: 1 });
      return [translationRow(n)];
    }
    case "align_axes": case "parallel": {
      // Orientation-only: remove the two tilts of the common direction;
      // spin about it stays free. No translational row (translation preserved).
      const d = normalizeVec(frames.a.direction ?? frames.a.normal ?? { x: 0, y: 0, z: 1 });
      const { first, second } = orthogonalPair(d);
      return [rotationRow(first), rotationRow(second)];
    }
    case "concentric": {
      // Axis-line coincidence: two tilts + two transverse translations;
      // axial slide and spin remain free.
      const d = normalizeVec(frames.a.direction ?? frames.a.normal ?? { x: 0, y: 0, z: 1 });
      const { first, second } = orthogonalPair(d);
      return [rotationRow(first), rotationRow(second), translationRow(first), translationRow(second)];
    }
    case "angle": case "perpendicular": {
      // One scalar angular relationship: a single rotational row along the
      // effective relative-rotation axis. Linearized approximation.
      const k = crossVec(
        frames.b.normal ?? frames.b.direction ?? { x: 0, y: 0, z: 1 },
        frames.a.normal ?? frames.a.direction ?? { x: 0, y: 1, z: 0 },
      );
      if (vecLen(k) < EPS) return [];
      return [rotationRow(normalizeVec(k))];
    }
    default:
      return [];
  }
}

function orthogonalPair(v: Vec3): { first: Vec3; second: Vec3 } {
  const n = normalizeVec(v);
  const seed = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const first = normalizeVec(crossVec(n, seed));
  const second = normalizeVec(crossVec(n, first));
  return { first, second };
}

const AXIS_T = ["x", "y", "z"];
const AXIS_R = ["about_x", "about_y", "about_z"];

/** Gaussian-elimination rank with tolerance; also yields free-axis labels. */
function rank6(rows: number[][]): { rank: number; freeT: number[]; freeR: number[] } {
  const m = rows.map((r) => [...r]);
  const pivots: number[] = [];
  let r = 0;
  for (let col = 0; col < 6 && r < m.length; col += 1) {
    let pivotRow = -1;
    for (let i = r; i < m.length; i += 1) {
      if (Math.abs(m[i]![col]!) > 1e-8) { pivotRow = i; break; }
    }
    if (pivotRow < 0) continue;
    [m[r], m[pivotRow]] = [m[pivotRow]!, m[r]!];
    const pv = m[r]![col]!;
    for (let i = r + 1; i < m.length; i += 1) {
      const f = m[i]![col]! / pv;
      if (Math.abs(f) < 1e-12) continue;
      for (let j = col; j < 6; j += 1) m[i]![j] = m[i]![j]! - f * m[r]![j]!;
    }
    pivots.push(col);
    r += 1;
  }
  const free: number[] = [];
  for (let col = 0; col < 6; col += 1) if (!pivots.includes(col)) free.push(col);
  return { rank: pivots.length, freeT: free.filter((c) => c < 3), freeR: free.filter((c) => c >= 3).map((c) => c - 3) };
}

export interface SolvedAssembly {
  solved: boolean;
  constraintState: AssemblyConstraintState;
  placements: Record<string, AssemblyTransform>;
  constraints: ConstraintReport[];
  dof: DofReport[];
  remainingDofTotal: number;
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

/** Centralized solver/inspection tolerances. Units are explicit per field. */
export const SOLVER_TOLERANCES = {
  distanceMm: 1e-6,
  angleDeg: 1e-4,
  orientationDot: 1e-9,
  interferenceVolumeMm3: 1e-6,
};

function secondRef(c: AssemblyConstraint): AssemblyRef {
  const r = c.refs[1];
  if (!r) throw cadError("INVALID_ASSEMBLY_REFERENCE", "Constraint needs two references.", { constraint: c.id });
  return r;
}

/** Constraint-kind pairs that cannot coexist on the same reference pair. */
const CONTRADICTORY_KINDS: Array<[AssemblyConstraintKind, AssemblyConstraintKind]> = [
  ["parallel", "perpendicular"],
];

function checkConflicts(asm: Assembly): void {
  interface Group {
    first: AssemblyConstraint;
    kinds: Map<AssemblyConstraintKind, AssemblyConstraint>;
  }
  const groups = new Map<string, Group>();
  for (const c of asm.constraints) {
    if (c.refs.length !== 2) continue;
    const base = [c.refs[0].instance, refLabel(c.refs[0]), c.refs[1].instance, refLabel(c.refs[1])].join("|");
    let g = groups.get(base);
    if (!g) {
      g = { first: c, kinds: new Map() };
      groups.set(base, g);
    }
    if (!g.kinds.has(c.kind)) {
      g.kinds.set(c.kind, c);
      continue;
    }
    // Same kind, same references: value comparison decides conflict/redundant.
    const prev = g.kinds.get(c.kind)!;
    const valueOf = (x: AssemblyConstraint) => x.distanceMm ?? x.angleDeg ?? x.offsetMm ?? 0;
    const hasValue = c.distanceMm !== undefined || c.angleDeg !== undefined || c.offsetMm !== undefined;
    if (hasValue && Math.abs(valueOf(prev) - valueOf(c)) > 1e-6) {
      throw cadError(
        "CONSTRAINT_CONFLICT",
        `Constraints '${prev.id}' and '${c.id}' demand different values (${valueOf(prev)} vs ${valueOf(c)}) for the same references.`,
        { constraint_a: prev.id, constraint_b: c.id },
      );
    }
    if (!hasValue || Math.abs(valueOf(prev) - valueOf(c)) <= 1e-6) {
      (c as AssemblyConstraint & { _redundantOf?: string })._redundantOf = prev.id;
    }
  }
  for (const [base, g] of groups) {
    for (const [a, b] of CONTRADICTORY_KINDS) {
      if (g.kinds.has(a) && g.kinds.has(b)) {
        throw cadError(
          "CONSTRAINT_CONFLICT",
          `Constraints on '${base}' demand both ${a} and ${b} — mechanically impossible.`,
          { key: base },
        );
      }
    }
  }
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
    case "parallel": {
      const { a, b } = worldFrames(asm, c);
      const na = a.direction ?? a.normal;
      const nb = b.direction ?? b.normal;
      if (!na || !nb) throw invalidRef(c, "planar faces or axes");
      // Parallel accepts both orientations; choose the one requiring the
      // SMALLER rotation from the current placement (no surprise 180° flips).
      const dotNow = dotVec(nb!, na!);
      const target = dotNow >= 0 ? na! : scaleVec(na!, -1);
      const qDelta = quatFromTo(nb!, target);
      // Pure orientation relationship: rotate about the mover's own reference
      // point so its position is unchanged; only orientation is adjusted.
      // Orientation-only relationship: translation vector is preserved.
      bInst.transform = {
        translation: current.translation,
        rotation: normalizeQuat(quatMultiply(qDelta, current.rotation)),
      } as unknown as AssemblyTransform;
      return { moved: bInst.id };
    }
    case "perpendicular": {
      const { a, b } = worldFrames(asm, c);
      const na = a.direction ?? a.normal;
      const nb = b.direction ?? b.normal;
      if (!na || !nb) throw invalidRef(c, "planar faces or axes");
      // Minimal rotation onto the plane orthogonal to the anchor direction:
      // project the moving normal onto that plane and rotate onto it.
      const d = dotVec(nb!, na!);
      if (Math.abs(d) < EPS) return "redundant";
      let proj = subVec(nb!, scaleVec(na!, d));
      if (vecLen(proj) < EPS) {
        // Moving normal is parallel to the anchor: infinitely many valid
        // perpendicular orientations. Stable secondary rule: pivot about the
        // least-aligned coordinate axis of the anchor normal.
        const axis =
          Math.abs(na!.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
        proj = normalizeVec(crossVec(na!, axis));
      }
      const qDelta = quatFromTo(nb!, normalizeVec(proj));
      bInst.transform = {
        translation: current.translation,
        rotation: normalizeQuat(quatMultiply(qDelta, current.rotation)),
      } as unknown as AssemblyTransform;
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

/** Unit-consistent residuals per applied constraint (diagnostic + enforcement). */
interface Residual { distance_mm?: number; angle_deg?: number; axis_offset_mm?: number; axis_angle_deg?: number }
function residualOf(asm: Assembly, c: AssemblyConstraint): Residual {
  const { a, b } = worldFrames(asm, c);
  const deg = (dot: number) => Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  switch (c.kind) {
    case "mate_faces": case "distance": {
      const n = normalizeVec(a.normal ?? { x: 0, y: 0, z: 1 });
      const gap = dotVec(subVec(a.point, b.point), n);
      const want = c.kind === "distance" ? -(c.distanceMm ?? 0) : -(c.offsetMm ?? 0);
      return { distance_mm: Math.abs(gap - want) };
    }
    case "parallel": {
      const d = dotVec(normalizeVec(b.direction ?? b.normal ?? {x:0,y:0,z:1}), normalizeVec(a.direction ?? a.normal ?? {x:0,y:0,z:1}));
      return { angle_deg: Math.abs(deg(Math.abs(d))) };
    }
    case "perpendicular": {
      const d = dotVec(normalizeVec(b.direction ?? b.normal ?? {x:0,y:0,z:1}), normalizeVec(a.direction ?? a.normal ?? {x:0,y:1,z:0}));
      return { angle_deg: Math.abs(deg(d) - 90) };
    }
    case "concentric": {
      const da = normalizeVec(a.direction ?? a.normal ?? {x:0,y:0,z:1});
      const db = normalizeVec(b.direction ?? b.normal ?? {x:0,y:0,z:1});
      const off = subVec(b.point, a.point);
      const perp = subVec(off, scaleVec(da, dotVec(off, da)));
      return { axis_offset_mm: vecLen(perp), axis_angle_deg: deg(Math.abs(dotVec(da, db))) };
    }
    case "angle": {
      const na = normalizeVec(a.normal ?? {x:0,y:0,z:1});
      const nb = normalizeVec(b.normal ?? {x:0,y:1,z:0});
      const cur = deg(dotVec(na, nb));
      let delta = Math.abs(cur - (c.angleDeg ?? 90));
      delta = Math.min(delta, 360 - delta);
      return { angle_deg: delta };
    }
    default: return {};
  }
}

function residualWithinTolerance(r: Residual): boolean {
  if ((r.distance_mm ?? 0) > SOLVER_TOLERANCES.distanceMm) return false;
  if ((r.angle_deg ?? 0) > SOLVER_TOLERANCES.angleDeg) return false;
  if ((r.axis_offset_mm ?? 0) > SOLVER_TOLERANCES.distanceMm) return false;
  if ((r.axis_angle_deg ?? 0) > SOLVER_TOLERANCES.angleDeg) return false;
  return true;
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
  const dof: DofReport[] = [];
  for (const inst of asm.instances) {
    placements[inst.id] = inst.transform;
    if (inst.fixed) {
      dof.push({ instanceId: inst.id, remainingDof: 0, freeTranslation: [], freeRotation: [] });
      continue;
    }
    // Level-1 rank model: rows from constraints that MOVED this instance,
    // evaluated in the solved world frame relative to their anchors.
    const rows: number[][] = [];
    const removedByConstraint = new Map<string, number>();
    let beforeRank = 0;
    // Mechanically active constraints: applied AND redundant-but-satisfied
    // relationships still restrict future motion, so they contribute rows.
    // Deferred/conflicted constraints do not.
    const ordered = asm.constraints.filter((c) => {
      const rep = reports.get(c.id);
      if (!rep || rep.moved !== inst.id) return false;
      return rep.status === "applied" || rep.status === "redundant";
    });
    const rowCache = new Map<string, number[][]>();
    for (const c of ordered) {
      const frames = worldFrames(asm, c);
      const rs = constraintRows(c, frames);
      rowCache.set(c.id, rs);
      const probe = rank6([...rows, ...rs]);
      removedByConstraint.set(c.id, probe.rank - beforeRank);
      beforeRank = probe.rank;
      rows.push(...rs);
    }
    // Re-rank with final geometry for the honest end-state number.
    const finalRows: number[][] = [];
    for (const c of ordered) finalRows.push(...(rowCache.get(c.id) ?? constraintRows(c, worldFrames(asm, c))));
    const { rank, freeT, freeR } = rank6(finalRows);
    for (const c of ordered) {
      const rep = reports.get(c.id)!;
      rep.removedDof = removedByConstraint.get(c.id) ?? 0;
      rep.residual = residualOf(asm, c) as unknown as string;
    }
    dof.push({
      instanceId: inst.id,
      remainingDof: 6 - rank,
      freeTranslation: freeT.map((i) => AXIS_T[i]!),
      freeRotation: freeR.map((i) => AXIS_R[i]!),
    });
  }

  // Post-solve residual validation: an applied relationship that violates
  // tolerance invalidates the solve (unit-consistent residuals only).
  for (const c of asm.constraints) {
    const rep = reports.get(c.id);
    if (!rep || rep.status !== "applied") continue;
    const r = residualOf(asm, c);
    rep.residual = r as unknown as string;
    if (!residualWithinTolerance(r)) {
      rep.status = "deferred";
      rep.reason = `residual out of tolerance: ${JSON.stringify(r)}`;
    }
  }
  const deferred = [...reports.values()].filter((r) => r.status === "deferred");
  const worldBBox = meshWorldBBox(doc, asm, placements);
  const totalRemaining = dof.reduce((acc, d) => acc + d.remainingDof, 0);
  const anyFree = dof.some((d) => d.remainingDof > 0);
  const constraintState: AssemblyConstraintState = deferred.length
    ? "unsolved"
    : totalRemaining === 0 && !anyFree
      ? "fully_constrained"
      : "underconstrained";
  return {
    solved: deferred.length === 0,
    constraintState,
    placements,
    constraints: [...reports.values()],
    dof,
    remainingDofTotal: totalRemaining,
    worldBBox,
  };
}
