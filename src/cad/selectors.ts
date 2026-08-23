import { cadError } from "./errors";
import { resolveDim, resolveVec3 } from "./expressions";
import type {
  Dim,
  FaceName,
  GeometryMatch,
  GeometryQueryResult,
  GeometrySelector,
  Vec3,
  Vec3Expr,
} from "./types";

export const FACE_SELECTOR_KINDS = [
  "top_face",
  "bottom_face",
  "front_face",
  "back_face",
  "left_face",
  "right_face",
  "planar",
  "cylindrical",
  "largest_planar",
  "smallest_planar",
  "largest_planar_face",
  "smallest_planar_face",
  "normal_positive_x",
  "normal_negative_x",
  "normal_positive_y",
  "normal_negative_y",
  "normal_positive_z",
  "normal_negative_z",
  "highest_z",
  "lowest_z",
] as const;

export const EDGE_SELECTOR_KINDS = [
  "all",
  "all_edges",
  "all_vertical",
  "all_horizontal",
  "parallel_to_x",
  "parallel_to_y",
  "parallel_to_z",
  "top_perimeter",
  "bottom_perimeter",
  "convex",
  "concave",
  "convex_edges",
  "concave_edges",
] as const;

export type FaceSelectorKind = (typeof FACE_SELECTOR_KINDS)[number];
export type EdgeSelectorKind = (typeof EDGE_SELECTOR_KINDS)[number];

const FACE_NAME_SET = new Set<string>([
  "top_face",
  "bottom_face",
  "front_face",
  "back_face",
  "left_face",
  "right_face",
]);

export function normalizeSelector(
  raw: GeometrySelector | FaceName | undefined | null,
  defaultEntity: "edge" | "face",
  fallbackKind: string,
): Extract<GeometrySelector, object> {
  if (raw === undefined || raw === null || raw === "") {
    return { entity: defaultEntity, selector: fallbackKind };
  }
  if (typeof raw === "string") {
    const entity = FACE_NAME_SET.has(raw) ? "face" : defaultEntity;
    return { entity, selector: raw };
  }
  return {
    entity: raw.entity ?? defaultEntity,
    selector: raw.selector ?? fallbackKind,
    created_by: raw.created_by,
    adjacent_to: raw.adjacent_to,
    nearest: raw.nearest,
    within_bbox: raw.within_bbox,
    length_between: raw.length_between,
    centroid_near: raw.centroid_near,
    gref: raw.gref,
    unique: raw.unique,
  };
}

export function selectorLabel(sel: GeometrySelector | undefined): string {
  if (!sel) return "default";
  if (typeof sel === "string") return sel;
  return sel.gref ?? sel.selector ?? sel.entity ?? "selector";
}

function roundN(n: number, d = 4) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function parallel(dir: Vec3, axis: Vec3, tol = 0.08) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  return Math.abs(Math.abs(d.x * axis.x + d.y * axis.y + d.z * axis.z) - 1) <= tol;
}

export interface EnvelopeBox {
  origin: Vec3;
  L: number;
  W: number;
  H: number;
  createdBy?: string;
  bodyId?: string;
}

function boxFaces(env: EnvelopeBox): GeometryMatch[] {
  const { x: ox, y: oy, z: oz } = env.origin;
  const { L, W, H } = env;
  const faces: Array<{
    kind: string;
    name: FaceName;
    centroid: Vec3;
    normal: Vec3;
    area: number;
    bbox: { min: Vec3; max: Vec3 };
  }> = [
    {
      kind: "top_face",
      name: "top_face",
      centroid: v3(ox + L / 2, oy + W / 2, oz + H),
      normal: v3(0, 0, 1),
      area: L * W,
      bbox: { min: v3(ox, oy, oz + H), max: v3(ox + L, oy + W, oz + H) },
    },
    {
      kind: "bottom_face",
      name: "bottom_face",
      centroid: v3(ox + L / 2, oy + W / 2, oz),
      normal: v3(0, 0, -1),
      area: L * W,
      bbox: { min: v3(ox, oy, oz), max: v3(ox + L, oy + W, oz) },
    },
    {
      kind: "front_face",
      name: "front_face",
      centroid: v3(ox + L / 2, oy + W, oz + H / 2),
      normal: v3(0, 1, 0),
      area: L * H,
      bbox: { min: v3(ox, oy + W, oz), max: v3(ox + L, oy + W, oz + H) },
    },
    {
      kind: "back_face",
      name: "back_face",
      centroid: v3(ox + L / 2, oy, oz + H / 2),
      normal: v3(0, -1, 0),
      area: L * H,
      bbox: { min: v3(ox, oy, oz), max: v3(ox + L, oy, oz + H) },
    },
    {
      kind: "right_face",
      name: "right_face",
      centroid: v3(ox + L, oy + W / 2, oz + H / 2),
      normal: v3(1, 0, 0),
      area: W * H,
      bbox: { min: v3(ox + L, oy, oz), max: v3(ox + L, oy + W, oz + H) },
    },
    {
      kind: "left_face",
      name: "left_face",
      centroid: v3(ox, oy + W / 2, oz + H / 2),
      normal: v3(-1, 0, 0),
      area: W * H,
      bbox: { min: v3(ox, oy, oz), max: v3(ox, oy + W, oz + H) },
    },
  ];
  return faces.map((f, i) => ({
    semantic_id: `gref_face_${String(i + 1).padStart(3, "0")}`,
    entity: "face" as const,
    occt_index: i + 1,
    surface_type: "Plane",
    area_mm2: roundN(f.area),
    centroid: f.centroid,
    normal: f.normal,
    bbox: f.bbox,
    role: f.kind,
    created_by: env.createdBy,
    fingerprint: {
      surface_type: "Plane",
      role: f.kind,
      area: roundN(f.area, 2),
      nx: Math.round(f.normal.x),
      ny: Math.round(f.normal.y),
      nz: Math.round(f.normal.z),
    },
    confidence: "exact" as const,
  }));
}

function boxEdges(env: EnvelopeBox): GeometryMatch[] {
  const { x: ox, y: oy, z: oz } = env.origin;
  const { L, W, H } = env;
  const corners = [
    v3(ox, oy, oz),
    v3(ox + L, oy, oz),
    v3(ox + L, oy + W, oz),
    v3(ox, oy + W, oz),
    v3(ox, oy, oz + H),
    v3(ox + L, oy, oz + H),
    v3(ox + L, oy + W, oz + H),
    v3(ox, oy + W, oz + H),
  ];
  const pairs: Array<[number, number, string]> = [
    [0, 1, "bottom_perimeter"],
    [1, 2, "bottom_perimeter"],
    [2, 3, "bottom_perimeter"],
    [3, 0, "bottom_perimeter"],
    [4, 5, "top_perimeter"],
    [5, 6, "top_perimeter"],
    [6, 7, "top_perimeter"],
    [7, 4, "top_perimeter"],
    [0, 4, "all_vertical"],
    [1, 5, "all_vertical"],
    [2, 6, "all_vertical"],
    [3, 7, "all_vertical"],
  ];
  return pairs.map(([a, b, role], i) => {
    const p = corners[a]!;
    const q = corners[b]!;
    const direction = v3(q.x - p.x, q.y - p.y, q.z - p.z);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    const midpoint = v3((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    const axis =
      Math.abs(direction.z) > 0.5 * length
        ? "z"
        : Math.abs(direction.x) > 0.5 * length
          ? "x"
          : "y";
    return {
      semantic_id: `gref_edge_${String(i + 1).padStart(3, "0")}`,
      entity: "edge" as const,
      occt_index: i + 1,
      curve_type: "Line",
      length_mm: roundN(length),
      midpoint,
      direction,
      bbox: {
        min: v3(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.min(p.z, q.z)),
        max: v3(Math.max(p.x, q.x), Math.max(p.y, q.y), Math.max(p.z, q.z)),
      },
      role,
      convex: true,
      created_by: env.createdBy,
      fingerprint: {
        curve_type: "Line",
        role,
        axis,
        length: roundN(length, 2),
        mx: roundN(midpoint.x, 2),
        my: roundN(midpoint.y, 2),
        mz: roundN(midpoint.z, 2),
      },
      confidence: "exact" as const,
    };
  });
}

function kindOf(sel: Extract<GeometrySelector, object>): string {
  return (sel.selector ?? "").toLowerCase();
}

function isLine(e: GeometryMatch) {
  return !e.curve_type || e.curve_type.toLowerCase().includes("line");
}

function filterFaces(
  faces: GeometryMatch[],
  sel: Extract<GeometrySelector, object>,
  vars: Record<string, number>,
): GeometryMatch[] {
  let out = faces;
  const kind = kindOf(sel);
  if (kind && kind !== "face" && kind !== "planar") {
    if (FACE_NAME_SET.has(kind)) out = out.filter((f) => f.role === kind);
    else if (kind === "largest_planar" || kind === "largest_planar_face") {
      const max = Math.max(...out.map((f) => f.area_mm2 ?? 0));
      out = out.filter((f) => Math.abs((f.area_mm2 ?? 0) - max) < 1e-6);
    } else if (kind === "smallest_planar" || kind === "smallest_planar_face") {
      const min = Math.min(...out.map((f) => f.area_mm2 ?? Infinity));
      out = out.filter((f) => Math.abs((f.area_mm2 ?? 0) - min) < 1e-6);
    } else if (kind === "normal_positive_x") out = out.filter((f) => (f.normal?.x ?? 0) > 0.9);
    else if (kind === "normal_negative_x") out = out.filter((f) => (f.normal?.x ?? 0) < -0.9);
    else if (kind === "normal_positive_y") out = out.filter((f) => (f.normal?.y ?? 0) > 0.9);
    else if (kind === "normal_negative_y") out = out.filter((f) => (f.normal?.y ?? 0) < -0.9);
    else if (kind === "normal_positive_z") out = out.filter((f) => (f.normal?.z ?? 0) > 0.9);
    else if (kind === "normal_negative_z") out = out.filter((f) => (f.normal?.z ?? 0) < -0.9);
    else if (kind === "highest_z") {
      const max = Math.max(...out.map((f) => f.centroid?.z ?? -Infinity));
      out = out.filter((f) => Math.abs((f.centroid?.z ?? 0) - max) < 1e-6);
    } else if (kind === "lowest_z") {
      const min = Math.min(...out.map((f) => f.centroid?.z ?? Infinity));
      out = out.filter((f) => Math.abs((f.centroid?.z ?? 0) - min) < 1e-6);
    } else if (kind === "cylindrical") out = out.filter((f) => f.surface_type === "Cylinder");
  }
  if (sel.created_by) out = out.filter((f) => f.created_by === sel.created_by);
  if (sel.centroid_near && out.length) {
    const p = resolveVec3(sel.centroid_near as Vec3Expr, vars, "centroid_near");
    const scored = out.map((f) => ({ f, d: dist(f.centroid ?? v3(0, 0, 0), p) }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0]!.d;
    const tied = scored.filter((s) => Math.abs(s.d - best) < 1e-6);
    out = tied.map((s) => s.f);
  }
  if (sel.nearest && out.length) {
    const p = resolveVec3(sel.nearest as Vec3Expr, vars, "nearest");
    const scored = out.map((f) => ({ f, d: dist(f.centroid ?? v3(0, 0, 0), p) }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0]!.d;
    const tied = scored.filter((s) => Math.abs(s.d - best) < 1e-4);
    out = tied.map((s) => s.f);
  }
  return out;
}

function filterEdges(
  edges: GeometryMatch[],
  sel: Extract<GeometrySelector, object>,
  vars: Record<string, number>,
  faces: GeometryMatch[],
): GeometryMatch[] {
  let out = edges;
  const kind = kindOf(sel);
  if (kind && kind !== "edge" && kind !== "all" && kind !== "all_edges") {
    if (kind === "all_vertical" || kind === "parallel_to_z") {
      out = out.filter((e) => e.direction && parallel(e.direction, v3(0, 0, 1)));
    } else if (kind === "parallel_to_x") {
      out = out.filter((e) => e.direction && parallel(e.direction, v3(1, 0, 0)));
    } else if (kind === "parallel_to_y") {
      out = out.filter((e) => e.direction && parallel(e.direction, v3(0, 1, 0)));
    } else if (kind === "all_horizontal") {
      out = out.filter((e) => e.direction && Math.abs(e.direction.z) < 0.08 * (e.length_mm ?? 1));
    } else if (kind === "top_perimeter") {
      out = out.filter((e) => e.role === "top_perimeter" && isLine(e));
    } else if (kind === "bottom_perimeter") {
      out = out.filter((e) => e.role === "bottom_perimeter" && isLine(e));
    } else if (kind === "convex" || kind === "convex_edges") out = out.filter((e) => e.convex !== false);
    else if (kind === "concave" || kind === "concave_edges") out = out.filter((e) => e.convex === false);
  }
  if (sel.created_by) out = out.filter((e) => e.created_by === sel.created_by);
  if (sel.length_between) {
    const min = resolveDim(sel.length_between.min as Dim, vars, "length_between.min");
    const max = resolveDim(sel.length_between.max as Dim, vars, "length_between.max");
    out = out.filter((e) => (e.length_mm ?? 0) >= min - 1e-6 && (e.length_mm ?? 0) <= max + 1e-6);
  }
  if (sel.adjacent_to) {
    const adj = normalizeSelector(sel.adjacent_to, "face", "top_face");
    const matchedFaces = filterFaces(faces, adj, vars);
    const roles = new Set(matchedFaces.map((f) => f.role));
    // Envelope approximation: top perimeter is adjacent to top_face, vertical to all sides, etc.
    out = out.filter((e) => {
      if (e.role === "top_perimeter" && roles.has("top_face")) return true;
      if (e.role === "bottom_perimeter" && roles.has("bottom_face")) return true;
      if (e.role === "all_vertical" && (roles.has("left_face") || roles.has("right_face") || roles.has("front_face") || roles.has("back_face"))) {
        return true;
      }
      return matchedFaces.length === 0;
    });
  }
  if (sel.nearest && out.length) {
    const p = resolveVec3(sel.nearest as Vec3Expr, vars, "nearest");
    const scored = out.map((e) => ({ e, d: dist(e.midpoint ?? v3(0, 0, 0), p) }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0]!.d;
    const tied = scored.filter((s) => Math.abs(s.d - best) < 1e-4);
    out = tied.map((s) => s.e);
  }
  if (sel.centroid_near && out.length) {
    const p = resolveVec3(sel.centroid_near as Vec3Expr, vars, "centroid_near");
    const scored = out.map((e) => ({ e, d: dist(e.midpoint ?? v3(0, 0, 0), p) }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0]!.d;
    const tied = scored.filter((s) => Math.abs(s.d - best) < 1e-4);
    out = tied.map((s) => s.e);
  }
  return out;
}

export function queryEnvelopeGeometry(
  env: EnvelopeBox,
  selector: GeometrySelector,
  vars: Record<string, number> = {},
): GeometryQueryResult {
  const sel = normalizeSelector(selector, "edge", "all_edges");
  const faces = boxFaces(env);
  const edges = boxEdges(env);
  const entity = sel.entity ?? "edge";
  let matches = entity === "face" ? filterFaces(faces, sel, vars) : filterEdges(edges, sel, vars, faces);

  if (sel.gref) {
    const hit = [...faces, ...edges].find((m) => m.semantic_id === sel.gref);
    if (!hit) {
      throw cadError("GEOMETRY_REFERENCE_LOST", `Geometry reference '${sel.gref}' is no longer present.`, {
        gref: sel.gref,
      });
    }
    matches = [hit];
  }

  if ((sel.unique || sel.nearest || sel.centroid_near) && matches.length > 1) {
    throw cadError(
      sel.nearest || sel.centroid_near ? "GEOMETRY_REFERENCE_AMBIGUOUS" : "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
      `Selector resolved to ${matches.length} equally valid candidates.`,
      {
        match_count: matches.length,
        selector: sel,
        candidates: matches.map((m) => ({ semantic_id: m.semantic_id, role: m.role, midpoint: m.midpoint, centroid: m.centroid })),
      },
    );
  }

  const confidence =
    matches.length === 1 ? "exact" : matches.length === 0 ? "missing" : "strong";

  return {
    selector: sel,
    entity,
    kernel: "jscad",
    match_count: matches.length,
    matches,
    confidence,
    note: "JSCAD envelope query approximates box topology. Authoritative resolution uses FreeCAD/OpenCascade.",
  };
}

export function requireMatches(
  result: GeometryQueryResult,
  opts: { min?: number; max?: number; unique?: boolean } = {},
): GeometryMatch[] {
  const min = opts.unique ? 1 : (opts.min ?? 1);
  const max = opts.unique ? 1 : opts.max;
  if (result.match_count === 0) {
    throw cadError("GEOMETRY_SELECTOR_NO_MATCH", "Selector resolved to no geometry.", {
      selector: result.selector,
      match_count: 0,
      suggestion: "Inspect faces/edges first and use a more specific semantic selector.",
    });
  }
  if (max !== undefined && result.match_count > max) {
    throw cadError(
      result.match_count > 1 && max === 1
        ? "GEOMETRY_SELECTOR_MULTIPLE_MATCHES"
        : "GEOMETRY_REFERENCE_AMBIGUOUS",
      `Selector resolved to ${result.match_count} entities but the operation requires ${max}.`,
      {
        selector: result.selector,
        match_count: result.match_count,
        candidates: result.matches.map((m) => ({
          semantic_id: m.semantic_id,
          role: m.role,
          midpoint: m.midpoint,
          centroid: m.centroid,
        })),
      },
    );
  }
  if (result.match_count < min) {
    throw cadError("GEOMETRY_SELECTOR_NO_MATCH", `Selector resolved to ${result.match_count} entities.`, {
      match_count: result.match_count,
    });
  }
  return result.matches;
}
