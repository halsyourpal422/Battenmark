import type { MeshData, Vec3 } from "../types";
import { encodePng } from "./png";

export type PreviewView = "isometric" | "front" | "top" | "right" | "thumbnail";

export interface RasterOptions {
  width?: number;
  height?: number;
  background?: [number, number, number, number];
  color?: [number, number, number];
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

const LIGHT = norm3(0.42, 0.55, 0.78);

function norm3(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function project(view: PreviewView, x: number, y: number, z: number): Projected {
  switch (view) {
    case "front":
      return { x, y: -z, z: y };
    case "top":
      return { x, y: -y, z: z };
    case "right":
      return { x: y, y: -z, z: x };
    case "isometric":
    case "thumbnail": {
      const c = Math.cos(Math.PI / 6);
      const s = Math.sin(Math.PI / 6);
      return {
        x: (x - y) * c,
        y: (x + y) * s - z,
        z: (x + y) * 0.35 + z * 0.6,
      };
    }
  }
}

function shade(nx: number, ny: number, nz: number, base: [number, number, number]): [number, number, number] {
  const ndotl = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
  const ambient = 0.22;
  const t = ambient + (1 - ambient) * ndotl;
  const rim = Math.max(0, 1 - Math.abs(nz)) * 0.08;
  return [
    Math.min(255, (base[0] * t + 18 * rim) | 0),
    Math.min(255, (base[1] * t + 22 * rim) | 0),
    Math.min(255, (base[2] * t + 26 * rim) | 0),
  ];
}

function edgePass(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  color: [number, number, number],
) {
  const [r, g, b] = color;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const z = zbuf[i]!;
      if (!Number.isFinite(z)) continue;
      const dz =
        Math.abs(z - zbuf[i - 1]!) +
        Math.abs(z - zbuf[i + 1]!) +
        Math.abs(z - zbuf[i - width]!) +
        Math.abs(z - zbuf[i + width]!);
      if (dz > 0.012) {
        const p = i * 4;
        rgba[p] = Math.min(255, r + 40);
        rgba[p + 1] = Math.min(255, g + 36);
        rgba[p + 2] = Math.min(255, b + 28);
      }
    }
  }
}

export function rasterizeMeshes(
  meshes: MeshData[],
  view: PreviewView,
  options: RasterOptions = {},
): { png: Buffer; width: number; height: number; triangleCount: number } {
  const width = Math.max(64, Math.min(1280, options.width ?? (view === "thumbnail" ? 256 : 640)));
  const height = Math.max(64, Math.min(1280, options.height ?? (view === "thumbnail" ? 256 : 480)));
  const bg = options.background ?? [12, 13, 16, 255];
  const base = options.color ?? [158, 184, 196];

  let triCount = 0;
  const projected: number[] = [];
  for (const mesh of meshes) {
    const pos = mesh.positions;
    for (let i = 0; i + 8 < pos.length; i += 9) {
      const a = project(view, pos[i]!, pos[i + 1]!, pos[i + 2]!);
      const b = project(view, pos[i + 3]!, pos[i + 4]!, pos[i + 5]!);
      const c = project(view, pos[i + 6]!, pos[i + 7]!, pos[i + 8]!);
      projected.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      triCount++;
    }
  }
  if (triCount === 0) {
    throw Object.assign(new Error("No visible solid geometry to render."), { code: "PREVIEW_FAILED" });
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < projected.length; i += 3) {
    const x = projected[i]!,
      y = projected[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const pad = 0.12;
  const scale = (1 - 2 * pad) * Math.min(width / spanX, height / spanY);
  const ox = width / 2 - ((minX + maxX) / 2) * scale;
  const oy = height / 2 - ((minY + maxY) / 2) * scale;

  const rgba = new Uint8Array(width * height * 4);
  const zbuf = new Float32Array(width * height);
  zbuf.fill(Number.NEGATIVE_INFINITY);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bg[0];
    rgba[i + 1] = bg[1];
    rgba[i + 2] = bg[2];
    rgba[i + 3] = bg[3];
  }

  for (let t = 0; t < projected.length; t += 9) {
    const ax = projected[t]! * scale + ox;
    const ay = projected[t + 1]! * scale + oy;
    const az = projected[t + 2]!;
    const bx = projected[t + 3]! * scale + ox;
    const by = projected[t + 4]! * scale + oy;
    const bz = projected[t + 5]!;
    const cx = projected[t + 6]! * scale + ox;
    const cy = projected[t + 7]! * scale + oy;
    const cz = projected[t + 8]!;
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-12) continue;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    if (nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const [sr, sg, sb] = shade(nx, ny, nz, base);
    const minXi = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxXi = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minYi = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxYi = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-8) continue;
    const inv = 1 / area;
    for (let py = minYi; py <= maxYi; py++) {
      for (let px = minXi; px <= maxXi; px++) {
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
        const z = w0 * az + w1 * bz + w2 * cz;
        const idx = py * width + px;
        if (z >= zbuf[idx]!) {
          zbuf[idx] = z;
          const p = idx * 4;
          rgba[p] = sr;
          rgba[p + 1] = sg;
          rgba[p + 2] = sb;
          rgba[p + 3] = 255;
        }
      }
    }
  }

  edgePass(rgba, zbuf, width, height, base);
  return { png: encodePng(width, height, rgba), width, height, triangleCount: triCount };
}
