/**
 * Test-only synthetic backend.
 *
 * Proves the registry accepts a third ID without editing the public CAD
 * operation schema. Not a geometry engine. Not registered in production.
 */
import type { CadDocument } from "../types";
import { paramMap } from "../document";
import { resolveDim } from "../expressions";
import {
  MOCKCAD_BACKEND_ID,
  capabilityFlags,
  type BackendCapabilities,
} from "./capabilities";
import type { BackendRegistration } from "./registry";

export function mockcadCapabilities(opts: { available?: boolean } = {}): BackendCapabilities {
  return {
    id: MOCKCAD_BACKEND_ID,
    name: "mockcad (test-only)",
    role: "preview",
    roles: ["preview"],
    available: opts.available ?? true,
    test_only: true,
    version: "0",
    capabilities: capabilityFlags({
      "primitives.box": true,
    }),
    notes: [
      "Synthetic backend for registry pluggability tests.",
      "Advertises primitives.box only. Holes, fillets, STEP, and assemblies are BACKEND_UNSUPPORTED.",
      "Never authoritative. Never registered in production.",
    ],
  };
}

export function mockcadRegistration(opts: { available?: boolean } = {}): BackendRegistration {
  const caps = mockcadCapabilities(opts);
  return {
    id: caps.id,
    name: caps.name,
    roles: caps.roles,
    capabilities: caps.capabilities,
    notes: caps.notes,
    testOnly: true,
    available: caps.available,
    version: caps.version,
  };
}

/** Deterministic in-memory box volume from the IR. Ignores holes/fillets. */
export function mockcadInspect(doc: CadDocument): {
  valid: boolean;
  volume_mm3: number;
  solid_count: number;
  bounding_box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  kernel: string;
} {
  const vars = paramMap(doc);
  let volume = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  let solids = 0;
  for (const f of doc.features) {
    if (f.kind !== "box" || f.suppressed) continue;
    const L = resolveDim(f.length, vars, "length");
    const W = resolveDim(f.width, vars, "width");
    const H = resolveDim(f.height, vars, "height");
    volume += L * W * H;
    maxX = Math.max(maxX, L);
    maxY = Math.max(maxY, W);
    maxZ = Math.max(maxZ, H);
    solids += 1;
  }
  return {
    valid: solids > 0,
    volume_mm3: volume,
    solid_count: solids,
    bounding_box: solids
      ? { min: { x: 0, y: 0, z: 0 }, max: { x: maxX, y: maxY, z: maxZ } }
      : null,
    kernel: MOCKCAD_BACKEND_ID,
  };
}
