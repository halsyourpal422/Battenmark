/**
 * Canonical rigid-transform math for Battenmark assemblies.
 *
 * Convention: translation in millimetres, rotation as a unit quaternion stored
 * scalar-last ({x,y,z,w}) — the same component order FreeCAD's
 * `App.Rotation(x, y, z, w)` accepts, so serialization is backend-adjacent
 * without being backend-owned.
 */
import type { Vec3 } from "../types";

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RigidTransform {
  translation: Vec3;
  rotation: Quaternion;
}

export const EPS = 1e-9;

export const IDENTITY_QUAT: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

export function identityTransform(): RigidTransform {
  return { translation: { x: 0, y: 0, z: 0 }, rotation: { ...IDENTITY_QUAT } };
}

export function normalizeQuat(q: Quaternion): Quaternion {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(len) || len < EPS) return { ...IDENTITY_QUAT };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatFromAxisAngle(axis: Vec3, angleDeg: number): Quaternion {
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len < EPS) return { ...IDENTITY_QUAT };
  const half = (angleDeg * Math.PI) / 180 / 2;
  const s = Math.sin(half) / len;
  return normalizeQuat({ x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) });
}

/** Intrinsic XYZ Euler angles in degrees -> quaternion (applied X, then Y, then Z). */
export function quatFromEulerXYZDeg(rx: number, ry: number, rz: number): Quaternion {
  const qx = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, rx);
  const qy = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, ry);
  const qz = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, rz);
  return normalizeQuat(quatMultiply(qz, quatMultiply(qy, qx)));
}

export function rotateVector(q: Quaternion, v: Vec3): Vec3 {
  // v' = q * v * q^-1 (optimized form)
  const { x, y, z, w } = q;
  const uvx = y * v.z - z * v.y;
  const uvy = z * v.x - x * v.z;
  const uvz = x * v.y - y * v.x;
  const uux = y * uvz - z * uvy;
  const uuy = z * uvx - x * uvz;
  const uuz = x * uvy - y * uvx;
  return {
    x: v.x + 2 * (w * uvx + uux),
    y: v.y + 2 * (w * uvy + uuy),
    z: v.z + 2 * (w * uvz + uuz),
  };
}

export function applyTransform(t: RigidTransform, p: Vec3): Vec3 {
  const r = rotateVector(t.rotation, p);
  return { x: r.x + t.translation.x, y: r.y + t.translation.y, z: r.z + t.translation.z };
}

export function composeTransform(outer: RigidTransform, inner: RigidTransform): RigidTransform {
  // outer ∘ inner : first inner, then outer.
  return {
    translation: applyTransform(outer, inner.translation),
    rotation: normalizeQuat(quatMultiply(outer.rotation, inner.rotation)),
  };
}

export function invertTransform(t: RigidTransform): RigidTransform {
  const inv = conjugate(t.rotation);
  const tr = rotateVector(inv, t.translation);
  return {
    rotation: inv,
    translation: { x: -tr.x, y: -tr.y, z: -tr.z },
  };
}

function conjugate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function dotVec(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function vecLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalizeVec(a: Vec3): Vec3 {
  const l = vecLen(a);
  if (l < EPS) return { x: 0, y: 0, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function scaleVec(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Minimal rotation carrying vector `from` onto vector `to` (both normalized
 * internally). Returns identity when they are parallel; the shortest arc is
 * otherwise unique except for the exact antiparallel case, where a stable
 * fallback axis is chosen deterministically.
 */
export function quatFromTo(from: Vec3, to: Vec3): Quaternion {
  const f = normalizeVec(from);
  const t = normalizeVec(to);
  const d = dotVec(f, t);
  if (d > 1 - 1e-12) return { ...IDENTITY_QUAT };
  if (d < -(1 - 1e-12)) {
    // Exact antiparallel: pick a deterministic orthogonal pivot axis.
    const axis =
      Math.abs(f.x) < 0.5 ? crossVec(f, { x: 1, y: 0, z: 0 }) : crossVec(f, { x: 0, y: 1, z: 0 });
    return quatFromAxisAngle(normalizeVec(axis), 180);
  }
  const c = crossVec(f, t);
  return normalizeQuat({
    x: c.x,
    y: c.y,
    z: c.z,
    w: 1 + d,
  });
}
