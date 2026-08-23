import modeling from "@jscad/modeling";
import type {
  BodyEval,
  CadDocument,
  Evaluation,
  FaceFrame,
  Feature,
  Issue,
  MeshData,
  Vec3,
} from "./types";
import { paramMap } from "./document";
import { requirePositive, resolveDim, resolveVec3 } from "./expressions";
import { resolveHoleFace, resolveHoleUV } from "./holes";

const { primitives, booleans, extrusions, transforms, measurements, geometries } = modeling;

type Solid = ReturnType<typeof primitives.cuboid>;
type Profile2 = ReturnType<typeof primitives.rectangle>;

const OVER = 0.08;
const SEGMENTS = 24;

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function emptyBbox() {
  return { min: v3(0, 0, 0), max: v3(0, 0, 0) };
}

function boxFaces(origin: Vec3, L: number, W: number, H: number): FaceFrame[] {
  const { x: ox, y: oy, z: oz } = origin;
  return [
    {
      name: "bottom_face",
      origin: v3(ox, oy, oz),
      uDir: v3(1, 0, 0),
      vDir: v3(0, 1, 0),
      normal: v3(0, 0, -1),
      width: L,
      height: W,
      thickness: H,
    },
    {
      name: "top_face",
      origin: v3(ox, oy, oz + H),
      uDir: v3(1, 0, 0),
      vDir: v3(0, 1, 0),
      normal: v3(0, 0, 1),
      width: L,
      height: W,
      thickness: H,
    },
    {
      name: "back_face",
      origin: v3(ox, oy, oz),
      uDir: v3(1, 0, 0),
      vDir: v3(0, 0, 1),
      normal: v3(0, -1, 0),
      width: L,
      height: H,
      thickness: W,
    },
    {
      name: "front_face",
      origin: v3(ox, oy + W, oz),
      uDir: v3(1, 0, 0),
      vDir: v3(0, 0, 1),
      normal: v3(0, 1, 0),
      width: L,
      height: H,
      thickness: W,
    },
    {
      name: "left_face",
      origin: v3(ox, oy, oz),
      uDir: v3(0, 1, 0),
      vDir: v3(0, 0, 1),
      normal: v3(-1, 0, 0),
      width: W,
      height: H,
      thickness: L,
    },
    {
      name: "right_face",
      origin: v3(ox + L, oy, oz),
      uDir: v3(0, 1, 0),
      vDir: v3(0, 0, 1),
      normal: v3(1, 0, 0),
      width: W,
      height: H,
      thickness: L,
    },
  ];
}

function makeBox(origin: Vec3, L: number, W: number, H: number, round = 0): Solid {
  const center: [number, number, number] = [origin.x + L / 2, origin.y + W / 2, origin.z + H / 2];
  if (round > 0) {
    return primitives.roundedCuboid({
      size: [L, W, H],
      center,
      roundRadius: round,
      segments: 8,
    });
  }
  return primitives.cuboid({ size: [L, W, H], center });
}

function makeCylinder(
  origin: Vec3,
  radius: number,
  height: number,
  axis: "X" | "Y" | "Z",
): Solid {
  let cyl = primitives.cylinder({
    height,
    radius,
    center: [0, 0, 0],
    segments: SEGMENTS,
  });
  if (axis === "X") cyl = transforms.rotateY(Math.PI / 2, cyl);
  if (axis === "Y") cyl = transforms.rotateX(-Math.PI / 2, cyl);
  const c: [number, number, number] =
    axis === "X"
      ? [origin.x + height / 2, origin.y, origin.z]
      : axis === "Y"
        ? [origin.x, origin.y + height / 2, origin.z]
        : [origin.x, origin.y, origin.z + height / 2];
  return transforms.translate(c, cyl);
}

function alignZTo(geom: Solid, dir: Vec3): Solid {
  if (Math.abs(dir.z) > 0.999) {
    return dir.z < 0 ? transforms.rotateX(Math.PI, geom) : geom;
  }
  if (Math.abs(dir.y) > 0.999) {
    return transforms.rotateX(dir.y > 0 ? -Math.PI / 2 : Math.PI / 2, geom);
  }
  if (Math.abs(dir.x) > 0.999) {
    return transforms.rotateY(dir.x > 0 ? Math.PI / 2 : -Math.PI / 2, geom);
  }
  return geom;
}

function holeSolid(face: FaceFrame, u: number, v: number, radius: number, depth: number, through: boolean): Solid {
  const P = add(face.origin, add(scale(face.uDir, u), scale(face.vDir, v)));
  const inward = scale(face.normal, -1);
  const cut = (through ? face.thickness : depth) + 2 * OVER;
  const center = add(P, scale(inward, cut / 2 - OVER));
  let cyl = primitives.cylinder({
    height: cut,
    radius,
    center: [0, 0, 0],
    segments: SEGMENTS,
  });
  cyl = alignZTo(cyl, inward);
  return transforms.translate([center.x, center.y, center.z], cyl);
}

function counterboreSolid(face: FaceFrame, u: number, v: number, radius: number, depth: number): Solid {
  const P = add(face.origin, add(scale(face.uDir, u), scale(face.vDir, v)));
  const inward = scale(face.normal, -1);
  const cut = depth + OVER;
  const center = add(P, scale(inward, cut / 2 - OVER * 0.25));
  let cyl = primitives.cylinder({
    height: cut,
    radius,
    center: [0, 0, 0],
    segments: SEGMENTS,
  });
  cyl = alignZTo(cyl, inward);
  return transforms.translate([center.x, center.y, center.z], cyl);
}

function countersinkSolid(face: FaceFrame, u: number, v: number, innerR: number, outerR: number, angleDeg: number): Solid {
  const depth = (outerR - innerR) / Math.tan(((angleDeg / 2) * Math.PI) / 180);
  const P = add(face.origin, add(scale(face.uDir, u), scale(face.vDir, v)));
  const inward = scale(face.normal, -1);
  const cut = Math.max(depth, 0.2) + OVER;
  const center = add(P, scale(inward, cut / 2 - OVER * 0.25));
  let cone = primitives.cylinderElliptic({
    height: cut,
    startRadius: [outerR, outerR],
    endRadius: [Math.max(innerR * 0.5, 0.05), Math.max(innerR * 0.5, 0.05)],
    center: [0, 0, 0],
    segments: SEGMENTS,
  });
  cone = alignZTo(cone, inward);
  return transforms.translate([center.x, center.y, center.z], cone);
}

function chamferCuts(origin: Vec3, L: number, W: number, H: number, d: number): Solid[] {
  const tri = primitives.polygon({ points: [
    [0, 0],
    [d, 0],
    [0, d],
  ] });
  const prism = extrusions.extrudeLinear({ height: H + 2 }, tri);
  const z = origin.z - 1;
  return [
    transforms.translate([origin.x, origin.y, z], prism),
    transforms.translate(
      [origin.x + L, origin.y, z],
      transforms.rotateZ(Math.PI / 2, prism),
    ),
    transforms.translate(
      [origin.x + L, origin.y + W, z],
      transforms.rotateZ(Math.PI, prism),
    ),
    transforms.translate(
      [origin.x, origin.y + W, z],
      transforms.rotateZ((3 * Math.PI) / 2, prism),
    ),
  ];
}

function subtractAll(base: Solid, tools: Solid[]): Solid {
  if (tools.length === 0) return base;
  let acc = base;
  for (const t of tools) acc = booleans.subtract(acc, t);
  return acc;
}

function geomToMesh(bodyId: string, bodyName: string, geom: Solid, color?: string): MeshData {
  const polygons = geometries.geom3.toPolygons(geom);
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const poly of polygons) {
    const verts = poly.vertices;
    if (verts.length < 3) continue;
    const a = verts[0]!;
    for (let i = 1; i < verts.length - 1; i++) {
      const b = verts[i]!;
      const c = verts[i + 1]!;
      const e1x = b[0]! - a[0]!;
      const e1y = b[1]! - a[1]!;
      const e1z = b[2]! - a[2]!;
      const e2x = c[0]! - a[0]!;
      const e2y = c[1]! - a[1]!;
      const e2z = c[2]! - a[2]!;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      pos.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!);
      nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }
  }
  const bbox = bboxOf(pos);
  let volume = 0;
  try {
    volume = measurements.measureVolume(geom) as number;
  } catch {
    volume = 0;
  }
  return {
    bodyId,
    bodyName,
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    triangleCount: pos.length / 9,
    bbox,
    volumeMm3: volume,
    color,
  };
}

function bboxOf(pos: number[]) {
  if (pos.length < 3) return emptyBbox();
  const min = v3(Infinity, Infinity, Infinity);
  const max = v3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { min, max };
}

function mergeBbox(a: { min: Vec3; max: Vec3 } | null, b: { min: Vec3; max: Vec3 }) {
  if (!a) return b;
  return {
    min: v3(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)),
    max: v3(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)),
  };
}

interface Envelope {
  origin: Vec3;
  L: number;
  W: number;
  H: number;
  faces: FaceFrame[];
}

function meshFromTessellation(bodyId: string, bodyName: string, positions: number[], color?: string): MeshData | null {
  if (positions.length < 9) return null;
  const nrm: number[] = [];
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i]!,
      ay = positions[i + 1]!,
      az = positions[i + 2]!;
    const bx = positions[i + 3]!,
      by = positions[i + 4]!,
      bz = positions[i + 5]!;
    const cx = positions[i + 6]!,
      cy = positions[i + 7]!,
      cz = positions[i + 8]!;
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  const bbox = bboxOf(positions);
  return {
    bodyId,
    bodyName,
    positions: new Float32Array(positions),
    normals: new Float32Array(nrm),
    triangleCount: positions.length / 9,
    bbox,
    volumeMm3: 0,
    color,
  };
}

function sketchProfiles(
  sketch: Extract<Feature, { kind: "sketch" }>,
  vars: Record<string, number>,
): Profile2[] {
  const out: Profile2[] = [];
  for (const pr of sketch.profiles) {
    if (pr.type === "rectangle") {
      const w = requirePositive(resolveDim(pr.width, vars, "width"), "width");
      const h = requirePositive(resolveDim(pr.height, vars, "height"), "height");
      const x = resolveDim(pr.x, vars, "x");
      const y = resolveDim(pr.y, vars, "y");
      out.push(primitives.rectangle({ size: [w, h], center: [x + w / 2, y + h / 2] }));
    } else {
      const r = requirePositive(resolveDim(pr.radius, vars, "radius"), "radius");
      const cx = resolveDim(pr.cx, vars, "cx");
      const cy = resolveDim(pr.cy, vars, "cy");
      out.push(primitives.circle({ radius: r, center: [cx, cy], segments: SEGMENTS }));
    }
  }
  return out;
}

function extrudeSketch(
  sketch: Extract<Feature, { kind: "sketch" }>,
  depth: number,
  reverse: boolean,
  vars: Record<string, number>,
): Solid | null {
  const profiles = sketchProfiles(sketch, vars);
  if (profiles.length === 0) return null;
  let profile: Profile2 = profiles[0]!;
  for (let i = 1; i < profiles.length; i++) {
    try {
      profile = booleans.subtract(profile, profiles[i]!);
    } catch {
      profile = booleans.union(profile, profiles[i]!);
    }
  }
  const height = reverse ? -Math.abs(depth) : Math.abs(depth);
  let solid = extrusions.extrudeLinear({ height }, profile);
  if (sketch.plane === "XZ") solid = transforms.rotateX(Math.PI / 2, solid);
  if (sketch.plane === "YZ") solid = transforms.rotateY(-Math.PI / 2, solid);
  const o = resolveVec3(sketch.origin, vars, "sketch.origin");
  solid = transforms.translate([o.x, o.y, o.z], solid);
  return solid;
}

function featureSolid(
  f: Feature,
  vars: Record<string, number>,
  sketches: Map<string, Extract<Feature, { kind: "sketch" }>>,
  round: number,
): Solid | null {
  switch (f.kind) {
    case "box": {
      const L = requirePositive(resolveDim(f.length, vars, "length"), "length");
      const W = requirePositive(resolveDim(f.width, vars, "width"), "width");
      const H = requirePositive(resolveDim(f.height, vars, "height"), "height");
      const origin = resolveVec3(f.origin, vars, "origin");
      const r = round > 0 ? Math.min(round, Math.min(L, W, H) / 2 - 0.05) : 0;
      return makeBox(origin, L, W, H, r > 0.05 ? r : 0);
    }
    case "cylinder": {
      const r = requirePositive(resolveDim(f.radius, vars, "radius"), "radius");
      const h = requirePositive(resolveDim(f.height, vars, "height"), "height");
      return makeCylinder(resolveVec3(f.origin, vars, "origin"), r, h, f.axis);
    }
    case "sphere": {
      const r = requirePositive(resolveDim(f.radius, vars, "radius"), "radius");
      const origin = resolveVec3(f.origin, vars, "origin");
      return primitives.sphere({
        radius: r,
        center: [origin.x, origin.y, origin.z],
        segments: 32,
      });
    }
    case "pad": {
      const sk = sketches.get(f.sketchId);
      if (!sk) return null;
      const d = requirePositive(resolveDim(f.depth, vars, "depth"), "depth");
      return extrudeSketch(sk, d, f.reverse, vars);
    }
    default:
      return null;
  }
}

export function evaluateDocument(doc: CadDocument): Evaluation {
  const issues: Issue[] = [];
  let vars: Record<string, number> = {};
  try {
    vars = paramMap(doc);
  } catch (err) {
    const body =
      err && typeof err === "object" && "body" in err
        ? (err as { body: { error?: string; message?: string; suggestion?: string } }).body
        : null;
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: body?.error ?? "INVALID_EXPRESSION",
          message: body?.message ?? (err instanceof Error ? err.message : String(err)),
          suggestion: body?.suggestion,
        },
      ],
      bodies: [],
      triangleCount: 0,
      volumeMm3: 0,
      bbox: null,
    };
  }
  const solids = new Map<string, Solid>();
  const envelopes = new Map<string, Envelope>();
  const importedMeshes = new Map<string, MeshData>();
  const sketches = new Map<string, Extract<Feature, { kind: "sketch" }>>();
  const filletOf = new Map<string, number>();
  const chamferOf = new Map<string, number>();

  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.kind === "fillet") {
      try {
        filletOf.set(f.bodyId, requirePositive(resolveDim(f.radius, vars, "radius"), "fillet radius"));
      } catch (err) {
        issues.push(issueFrom(err, f));
      }
    }
    if (f.kind === "chamfer") {
      try {
        chamferOf.set(f.bodyId, requirePositive(resolveDim(f.distance, vars, "distance"), "chamfer"));
      } catch (err) {
        issues.push(issueFrom(err, f));
      }
    }
    if (f.kind === "sketch") sketches.set(f.id, f);
  }

  const applyUnion = (bodyId: string, geom: Solid | null) => {
    if (!geom) return;
    const prev = solids.get(bodyId);
    solids.set(bodyId, prev ? booleans.union(prev, geom) : geom);
  };

  const applySubtract = (bodyId: string, geom: Solid | null, f: Feature) => {
    if (!geom) return;
    const prev = solids.get(bodyId);
    if (!prev) {
      issues.push({
        severity: "error",
        code: "BOOLEAN_MISSING_SOLID",
        message: `${f.name}: body has no solid to cut.`,
        featureId: f.id,
        bodyId,
        suggestion: "Create a box, cylinder, or pad first.",
      });
      return;
    }
    try {
      solids.set(bodyId, booleans.subtract(prev, geom));
    } catch (err) {
      issues.push({
        severity: "error",
        code: "TESSELLATION_FAILED",
        message: `${f.name}: boolean subtract failed. ${err instanceof Error ? err.message : String(err)}`,
        featureId: f.id,
        bodyId,
      });
    }
  };

  for (const f of doc.features) {
    if (f.suppressed) continue;
    try {
      switch (f.kind) {
        case "box": {
          const L = requirePositive(resolveDim(f.length, vars, "length"), "length");
          const W = requirePositive(resolveDim(f.width, vars, "width"), "width");
          const H = requirePositive(resolveDim(f.height, vars, "height"), "height");
          const origin = resolveVec3(f.origin, vars, "origin");
          const requested = filletOf.get(f.bodyId) ?? 0;
          const maxR = Math.min(L, W, H) / 2 - 0.05;
          let round = 0;
          if (requested > 0) {
            if (requested > maxR) {
              issues.push({
                severity: "error",
                code: "FILLET_RADIUS_TOO_LARGE",
                message: `${f.name}: fillet radius ${requested} mm exceeds maximum ${maxR.toFixed(2)} mm for this box.`,
                featureId: f.id,
                bodyId: f.bodyId,
                suggestion: `Use a radius below ${maxR.toFixed(2)} mm or enlarge the box.`,
              });
            } else {
              round = requested;
            }
          }
          applyUnion(f.bodyId, makeBox(origin, L, W, H, round));
          if (!envelopes.has(f.bodyId)) {
            envelopes.set(f.bodyId, {
              origin,
              L,
              W,
              H,
              faces: boxFaces(origin, L, W, H),
            });
          }
          break;
        }
        case "cylinder":
        case "sphere":
        case "pad": {
          applyUnion(f.bodyId, featureSolid(f, vars, sketches, 0));
          if (f.kind === "pad" && !envelopes.has(f.bodyId)) {
            const sk = sketches.get(f.sketchId);
            if (sk) {
              const d = requirePositive(resolveDim(f.depth, vars, "depth"), "depth");
              const rect = sk.profiles.find((p) => p.type === "rectangle");
              if (rect && rect.type === "rectangle") {
                const w = resolveDim(rect.width, vars, "width");
                const h = resolveDim(rect.height, vars, "height");
                const x = resolveDim(rect.x, vars, "x");
                const y = resolveDim(rect.y, vars, "y");
                const origin = resolveVec3(sk.origin, vars, "sketch.origin");
                const ox = add(origin, v3(x, y, 0));
                envelopes.set(f.bodyId, {
                  origin: ox,
                  L: w,
                  W: h,
                  H: d,
                  faces: boxFaces(ox, w, h, d),
                });
              }
            }
          }
          break;
        }
        case "sketch":
        case "fillet":
          break;
        case "chamfer": {
          const env = envelopes.get(f.bodyId);
          const d = requirePositive(resolveDim(f.distance, vars, "distance"), "chamfer");
          const solid = solids.get(f.bodyId);
          if (!env || !solid) break;
          const maxD = Math.min(env.L, env.W) / 2 - 0.05;
          if (d > maxD) {
            issues.push({
              severity: "error",
              code: "CHAMFER_DISTANCE_TOO_LARGE",
              message: `${f.name}: chamfer ${d} mm exceeds maximum ${maxD.toFixed(2)} mm.`,
              featureId: f.id,
              bodyId: f.bodyId,
              suggestion: `Use a distance below ${maxD.toFixed(2)} mm.`,
            });
            break;
          }
          if (filletOf.has(f.bodyId)) {
            issues.push({
              severity: "warning",
              code: "CHAMFER_SKIPPED",
              message: `${f.name}: skipped because a fillet is already applied to this body.`,
              featureId: f.id,
              bodyId: f.bodyId,
            });
            break;
          }
          solids.set(f.bodyId, subtractAll(solid, chamferCuts(env.origin, env.L, env.W, env.H, d)));
          break;
        }
        case "pocket": {
          const sk = sketches.get(f.sketchId);
          const d = requirePositive(resolveDim(f.depth, vars, "depth"), "depth");
          if (!sk) {
            issues.push({
              severity: "error",
              code: "UNKNOWN_SKETCH",
              message: `${f.name}: sketch not found.`,
              featureId: f.id,
            });
            break;
          }
          const geom = extrudeSketch(sk, d + OVER, false, vars);
          applySubtract(f.bodyId, geom, f);
          break;
        }
        case "hole": {
          const env = envelopes.get(f.bodyId);
          if (!env) {
            issues.push({
              severity: "error",
              code: "UNKNOWN_FACE",
              message: `${f.name}: body has no envelope faces yet. Create a box or pad first.`,
              featureId: f.id,
              bodyId: f.bodyId,
            });
            break;
          }
          let face: FaceFrame;
          try {
            face = resolveHoleFace(f, env, vars);
          } catch (err) {
            issues.push(issueFrom(err, f));
            break;
          }
          const dia = requirePositive(resolveDim(f.diameter, vars, "diameter"), "diameter");
          const { u, v } = resolveHoleUV(f, face, vars);
          const r = dia / 2;
          if (dia >= Math.min(face.width, face.height)) {
            issues.push({
              severity: "error",
              code: "HOLE_DIAMETER_INVALID",
              message: `${f.name}: diameter ${dia} mm is larger than the ${face.name} (${face.width} × ${face.height} mm).`,
              featureId: f.id,
              suggestion: `Use a diameter below ${Math.min(face.width, face.height).toFixed(2)} mm.`,
            });
            break;
          }
          if (u < r || v < r || u > face.width - r || v > face.height - r) {
            issues.push({
              severity: "error",
              code: "HOLE_OUTSIDE_FACE",
              message: `${f.name}: center (${u.toFixed(2)}, ${v.toFixed(2)}) with ⌀${dia} does not fit on ${face.name} (${face.width} × ${face.height} mm). Coordinates start at the min-corner of the face unless from_right/from_front are used.`,
              featureId: f.id,
              suggestion: `Keep x between ${r.toFixed(1)} and ${(face.width - r).toFixed(1)}, y between ${r.toFixed(1)} and ${(face.height - r).toFixed(1)}.`,
            });
            break;
          }
          const through = f.through || f.holeType === "through";
          const depth = through ? face.thickness : requirePositive(resolveDim(f.depth, vars, "depth"), "depth");
          if (!through && depth > face.thickness + 1e-6) {
            issues.push({
              severity: "warning",
              code: "POCKET_DEPTH_EXCEEDS_BODY",
              message: `${f.name}: blind depth ${depth} mm exceeds thickness ${face.thickness} mm; treating as through.`,
              featureId: f.id,
            });
          }
          applySubtract(f.bodyId, holeSolid(face, u, v, r, depth, through || depth >= face.thickness), f);
          if (f.counterbore) {
            const cbR = resolveDim(f.counterbore.diameter, vars, "counterbore.diameter") / 2;
            const cbD = requirePositive(resolveDim(f.counterbore.depth, vars, "counterbore.depth"), "counterbore depth");
            if (cbR <= r) {
              issues.push({
                severity: "error",
                code: "HOLE_CONFIGURATION_INVALID",
                message: `${f.name}: counterbore diameter must be larger than the hole diameter.`,
                featureId: f.id,
              });
            } else {
              applySubtract(f.bodyId, counterboreSolid(face, u, v, cbR, cbD), f);
            }
          }
          if (f.countersink) {
            const csR = resolveDim(f.countersink.diameter, vars, "countersink.diameter") / 2;
            const csA = resolveDim(f.countersink.angle, vars, "countersink.angle");
            if (csR <= r) {
              issues.push({
                severity: "error",
                code: "HOLE_CONFIGURATION_INVALID",
                message: `${f.name}: countersink diameter must be larger than the hole diameter.`,
                featureId: f.id,
              });
            } else {
              applySubtract(f.bodyId, countersinkSolid(face, u, v, r, csR, csA), f);
            }
          }
          break;
        }
        case "boolean": {
          const target = solids.get(f.bodyId);
          const tool = solids.get(f.toolBodyId);
          if (!target || !tool) {
            issues.push({
              severity: "error",
              code: "BOOLEAN_MISSING_SOLID",
              message: `${f.name}: both bodies must have solid geometry.`,
              featureId: f.id,
              bodyId: f.bodyId,
            });
            break;
          }
          try {
            const result =
              f.operation === "union"
                ? booleans.union(target, tool)
                : f.operation === "intersect"
                  ? booleans.intersect(target, tool)
                  : booleans.subtract(target, tool);
            solids.set(f.bodyId, result);
          } catch (err) {
            issues.push({
              severity: "error",
              code: "TESSELLATION_FAILED",
              message: `${f.name}: boolean ${f.operation} failed. ${err instanceof Error ? err.message : String(err)}`,
              featureId: f.id,
            });
          }
          break;
        }
        case "imported_solid": {
          const bb = f.bbox;
          const L = Math.max(1e-6, bb.max.x - bb.min.x);
          const W = Math.max(1e-6, bb.max.y - bb.min.y);
          const H = Math.max(1e-6, bb.max.z - bb.min.z);
          if (!envelopes.has(f.bodyId)) {
            envelopes.set(f.bodyId, {
              origin: { ...bb.min },
              L,
              W,
              H,
              faces: boxFaces(bb.min, L, W, H),
            });
          }
          if (f.tessellation && f.tessellation.length >= 9) {
            const mesh = meshFromTessellation(f.bodyId, f.name, f.tessellation);
            if (mesh) {
              mesh.volumeMm3 = f.volumeMm3;
              importedMeshes.set(f.bodyId, mesh);
            }
          } else {
            applyUnion(f.bodyId, makeBox(bb.min, L, W, H, 0));
          }
          issues.push({
            severity: "info",
            code: "IMPORT_NOT_PARAMETRIC",
            message: `${f.name}: imported ${f.sourceFormat} is B-rep, not a parametric feature tree.`,
            featureId: f.id,
            bodyId: f.bodyId,
          });
          break;
        }
        case "pattern": {
          const src = doc.features.find((x) => x.id === f.sourceFeatureId);
          if (!src) {
            issues.push({
              severity: "error",
              code: "UNKNOWN_FEATURE",
              message: `${f.name}: source feature not found.`,
              featureId: f.id,
            });
            break;
          }
          const offsets: Array<[number, number, number]> = [];
          if (f.patternKind === "rectangular") {
            const nx = Math.max(1, Math.floor(resolveDim(f.countX ?? f.count, vars, "count_x")));
            const ny = Math.max(1, Math.floor(resolveDim(f.countY ?? 1, vars, "count_y")));
            const sx = resolveDim(f.spacingX ?? f.dx, vars, "spacing_x");
            const sy = resolveDim(f.spacingY ?? f.dy, vars, "spacing_y");
            for (let ix = 0; ix < nx; ix++) {
              for (let iy = 0; iy < ny; iy++) {
                if (ix === 0 && iy === 0) continue;
                offsets.push([ix * sx, iy * sy, 0]);
              }
            }
          } else {
            const dx = resolveDim(f.dx, vars, "dx");
            const dy = resolveDim(f.dy, vars, "dy");
            const dz = resolveDim(f.dz, vars, "dz");
            const count = Math.floor(resolveDim(f.count, vars, "count"));
            for (let i = 1; i < count; i++) offsets.push([i * dx, i * dy, i * dz]);
          }
          const copies: Solid[] = [];
          if (src.kind === "hole") {
            const env = envelopes.get(src.bodyId);
            if (env) {
              try {
                const face = resolveHoleFace(src, env, vars);
                const dia = resolveDim(src.diameter, vars, "diameter");
                const uv0 = resolveHoleUV(src, face, vars);
                const depth = src.through ? face.thickness : resolveDim(src.depth, vars, "depth");
                for (const [dx, dy] of offsets) {
                  copies.push(holeSolid(face, uv0.u + dx, uv0.v + dy, dia / 2, depth, src.through));
                }
              } catch (err) {
                issues.push(issueFrom(err, f));
                break;
              }
            }
          } else {
            const base = featureSolid(src, vars, sketches, 0);
            if (base) {
              for (const [dx, dy, dz] of offsets) {
                copies.push(transforms.translate([dx, dy, dz], base));
              }
            }
          }
          const subtractive = src.kind === "hole" || src.kind === "pocket";
          for (const c of copies) {
            if (subtractive) applySubtract(f.bodyId, c, f);
            else applyUnion(f.bodyId, c);
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      issues.push(issueFrom(err, f));
    }
  }

  const bodies: BodyEval[] = doc.bodies.map((b) => {
    const geom = solids.get(b.id);
    const env = envelopes.get(b.id);
    const local: Issue[] = [];
    let mesh: MeshData | null = null;
    let volume = 0;
    let bbox = emptyBbox();
    let triangles = 0;
    let valid = true;
    if (geom) {
      try {
        mesh = geomToMesh(b.id, b.name, geom, b.color);
        volume = mesh.volumeMm3;
        bbox = mesh.bbox;
        triangles = mesh.triangleCount;
        if (volume <= 1e-6 && !b.consumed) {
          valid = false;
          local.push({
            severity: "error",
            code: "INVALID_SOLID",
            message: `${b.name}: computed volume is ~0. The boolean likely consumed the solid.`,
            bodyId: b.id,
          });
        }
      } catch (err) {
        valid = false;
        local.push({
          severity: "error",
          code: "TESSELLATION_FAILED",
          message: `${b.name}: failed to tessellate. ${err instanceof Error ? err.message : String(err)}`,
          bodyId: b.id,
        });
      }
      try {
        geometries.geom3.validate(geom);
      } catch (err) {
        local.push({
          severity: "warning",
          code: "INVALID_SOLID",
          message: `${b.name}: non-manifold edges after boolean (common with CSG holes). Mesh is still usable.`,
          bodyId: b.id,
        });
        void err;
      }
    } else if (importedMeshes.has(b.id)) {
      mesh = importedMeshes.get(b.id)!;
      mesh.color = b.color;
      volume = mesh.volumeMm3;
      bbox = mesh.bbox;
      triangles = mesh.triangleCount;
    } else if (!b.consumed) {
      local.push({
        severity: "info",
        code: "EMPTY_BODY",
        message: `${b.name} has no solid geometry yet.`,
        bodyId: b.id,
      });
    }
    issues.push(...local);
    return {
      bodyId: b.id,
      name: b.name,
      visible: b.visible,
      consumed: b.consumed,
      volumeMm3: volume,
      bbox,
      triangleCount: triangles,
      faces: env?.faces ?? [],
      mesh: b.visible && !b.consumed ? mesh : null,
      valid,
      issues: local,
    };
  });

  let totalVol = 0;
  let totalTri = 0;
  let bbox: Evaluation["bbox"] = null;
  for (const b of bodies) {
    if (!b.visible || b.consumed || !b.mesh) continue;
    totalVol += b.volumeMm3;
    totalTri += b.triangleCount;
    bbox = mergeBbox(bbox, b.bbox);
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues, bodies, triangleCount: totalTri, volumeMm3: totalVol, bbox };
}

function issueFrom(err: unknown, f: Feature): Issue {
  const body =
    err && typeof err === "object" && "body" in err
      ? (err as { body: { error?: string; message?: string; suggestion?: string } }).body
      : null;
  return {
    severity: "error",
    code: body?.error ?? "TESSELLATION_FAILED",
    message: `${f.name}: ${body?.message ?? (err instanceof Error ? err.message : String(err))}`,
    featureId: f.id,
    bodyId: f.bodyId,
    suggestion: body?.suggestion,
  };
}

