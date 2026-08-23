/**
 * Backend-neutral capability contract.
 *
 * Callers ask for design intent (create_hole). Backends advertise what they
 * can actually execute. Unavailable capabilities fail with BACKEND_UNSUPPORTED
 * rather than silently changing design intent.
 *
 * Backend IDs are open strings (validated), not a closed two-member union.
 * Well-known IDs (freecad, jscad, mockcad) are constants, not the type.
 */

export const CAPABILITY_KEYS = [
  "primitives.box",
  "primitives.cylinder",
  "primitives.sphere",
  "primitives.sketch",
  "feature.pad",
  "feature.pocket",
  "feature.hole.through",
  "feature.hole.blind",
  "feature.hole.counterbore",
  "feature.hole.countersink",
  "feature.hole.thread_cosmetic",
  "feature.hole.helical_thread",
  "feature.fillet",
  "feature.chamfer",
  "pattern.linear",
  "pattern.rectangular",
  "pattern.circular",
  "boolean.union",
  "boolean.subtract",
  "boolean.intersect",
  "geometry.semantic_selectors",
  "geometry.persistent_gref",
  "parametric.expressions",
  "parametric.native",
  "parametric.rebuild",
  "import.step",
  "import.fcstd",
  "export.step",
  "export.fcstd",
  "export.stl",
  "export.3mf",
  "render.preview",
  "assembly",
  "constraints",
  "assembly.instances",
  "assembly.fixed",
  "assembly.face_mate",
  "assembly.axis_alignment",
  "assembly.concentric",
  "assembly.distance",
  "assembly.angle",
  "assembly.preview",
  "assembly.authoritative",
  "assembly.interference",
  "assembly.nested",
  "assembly.parallel",
  "assembly.perpendicular",
  "assembly.instance_links",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type CapabilityFlag = boolean;

/** Open identifier. Validated by the registry; not a closed union. */
export type BackendId = string;

export const FREECAD_BACKEND_ID = "freecad";
export const JSCAD_BACKEND_ID = "jscad";
export const MOCKCAD_BACKEND_ID = "mockcad";

export type BackendRole =
  | "authoritative"
  | "preview"
  | "import"
  | "export"
  | "analysis"
  | "render"
  | "assembly"
  | "manufacturing";

export const BACKEND_ROLES: BackendRole[] = [
  "authoritative",
  "preview",
  "import",
  "export",
  "analysis",
  "render",
  "assembly",
  "manufacturing",
];

export interface BackendCapabilities {
  id: BackendId;
  name: string;
  /** Primary role (first of `roles`). Kept for older readers. */
  role: BackendRole;
  roles: BackendRole[];
  available: boolean;
  version?: string | null;
  executable?: string | null;
  platform?: string;
  arch?: string;
  discovery_mode?: string;
  detail?: string;
  test_only?: boolean;
  capabilities: Record<CapabilityKey, CapabilityFlag>;
  notes: string[];
}

export function capabilityFlags(overrides: Partial<Record<CapabilityKey, CapabilityFlag>> = {}): Record<CapabilityKey, CapabilityFlag> {
  const out = {} as Record<CapabilityKey, CapabilityFlag>;
  for (const key of CAPABILITY_KEYS) out[key] = false;
  return { ...out, ...overrides };
}

/** FreeCAD / OpenCascade — current authoritative B-rep adapter. */
export function freecadCapabilities(opts: {
  available: boolean;
  version?: string | null;
  executable?: string | null;
  platform?: string;
  arch?: string;
  discovery_mode?: string;
  detail?: string;
} = { available: false }): BackendCapabilities {
  return {
    id: FREECAD_BACKEND_ID,
    name: "FreeCAD / OpenCascade",
    role: "authoritative",
    roles: ["authoritative", "import", "export"],
    available: opts.available,
    version: opts.version,
    executable: opts.executable,
    platform: opts.platform,
    arch: opts.arch,
    discovery_mode: opts.discovery_mode,
    detail: opts.detail,
    capabilities: capabilityFlags({
      "primitives.box": true,
      "primitives.cylinder": true,
      "primitives.sphere": true,
      "primitives.sketch": true,
      "feature.pad": true,
      "feature.pocket": true,
      "feature.hole.through": true,
      "feature.hole.blind": true,
      "feature.hole.counterbore": true,
      "feature.hole.countersink": true,
      "feature.hole.thread_cosmetic": true,
      "feature.hole.helical_thread": false,
      "feature.fillet": true,
      "feature.chamfer": true,
      "pattern.linear": true,
      "pattern.rectangular": true,
      "pattern.circular": false,
      "boolean.union": true,
      "boolean.subtract": true,
      "boolean.intersect": true,
      "geometry.semantic_selectors": true,
      "geometry.persistent_gref": true,
      "parametric.expressions": true,
      "parametric.native": true,
      "parametric.rebuild": true,
      "import.step": true,
      "import.fcstd": true,
      "export.step": true,
      "export.fcstd": true,
      "export.stl": true,
      "export.3mf": true,
      "render.preview": false,
      "assembly": true,
      "constraints": true,
      "assembly.instances": true,
      "assembly.fixed": true,
      "assembly.face_mate": true,
      "assembly.axis_alignment": true,
      "assembly.concentric": true,
      "assembly.distance": true,
      "assembly.angle": true,
      "assembly.preview": false,
      "assembly.authoritative": true,
      "assembly.interference": true,
      "assembly.nested": false,
      "assembly.parallel": true,
      "assembly.perpendicular": true,
      "assembly.instance_links": false,
    }),
    notes: [
      "Authoritative manufacturing geometry. PartDesign Hole/Fillet/LinearPattern when a body is box + hole/fillet/chamfer/pattern; otherwise CSG.",
      "Helical threads, circular patterns, assemblies, and mates are not implemented.",
      "Sketch hole centers are written at rebuild time; desktop FreeCAD Param edits do not move them until this service rebuilds.",
    ],
  };
}

/** JSCAD — current preview / envelope adapter. Never authoritative for B-rep. */
export function jscadCapabilities(opts: { available: boolean; version?: string | null } = { available: true }): BackendCapabilities {
  return {
    id: JSCAD_BACKEND_ID,
    name: "JSCAD CSG preview",
    role: "preview",
    roles: ["preview", "render"],
    available: opts.available,
    version: opts.version ?? "2",
    capabilities: capabilityFlags({
      "primitives.box": true,
      "primitives.cylinder": true,
      "primitives.sphere": true,
      "primitives.sketch": true,
      "feature.pad": true,
      "feature.pocket": true,
      "feature.hole.through": true,
      "feature.hole.blind": true,
      "feature.hole.counterbore": true,
      "feature.hole.countersink": true,
      "feature.fillet": true,
      "feature.chamfer": true,
      "pattern.linear": true,
      "pattern.rectangular": true,
      "boolean.union": true,
      "boolean.subtract": true,
      "boolean.intersect": true,
      "geometry.semantic_selectors": true,
      "parametric.expressions": true,
      "parametric.rebuild": true,
      "export.stl": true,
      "render.preview": true,
      "assembly": true,
      "constraints": false,
      "assembly.instances": true,
      "assembly.fixed": true,
      "assembly.face_mate": false,
      "assembly.axis_alignment": false,
      "assembly.concentric": false,
      "assembly.distance": false,
      "assembly.angle": false,
      "assembly.preview": true,
      "assembly.authoritative": false,
      "assembly.interference": false,
      "assembly.nested": false,
      "assembly.parallel": false,
      "assembly.perpendicular": false,
      "assembly.instance_links": false,
    }),
    notes: [
      "Preview mesh and envelope selectors only. Manufacturing exports (STEP/FCStd) go through the authoritative backend.",
      "Fillet/chamfer in JSCAD are visual approximations, not OCC fillets.",
    ],
  };
}

export interface CapabilityReport {
  default_backend: BackendId;
  /** Derived from roles.authoritative — not a hard-coded name. */
  authoritative_geometry: BackendId;
  /** Derived from roles.preview — not a hard-coded name. */
  preview: BackendId;
  roles: Partial<Record<BackendRole, BackendId>>;
  backends: BackendCapabilities[];
}

function rolesOf(b: Pick<BackendCapabilities, "roles" | "role">): BackendRole[] {
  if (b.roles && b.roles.length) return b.roles;
  return b.role ? [b.role] : [];
}

/** Pick the first available backend that advertises `role`, else the first registered. */
export function pickRole(backends: BackendCapabilities[], role: BackendRole): BackendId {
  const available = backends.find((b) => b.available && rolesOf(b).includes(role));
  if (available) return available.id;
  const any = backends.find((b) => rolesOf(b).includes(role));
  return any?.id ?? "";
}

/**
 * Build a capability report from registered backends.
 * Role holders are derived from each backend's advertised roles + availability.
 * This function does not mention FreeCAD or JSCAD.
 */
export function capabilityReport(backends: BackendCapabilities[]): CapabilityReport {
  const roles: Partial<Record<BackendRole, BackendId>> = {};
  for (const role of BACKEND_ROLES) {
    const id = pickRole(backends, role);
    if (id) roles[role] = id;
  }
  const authoritative = roles.authoritative ?? "";
  const preview = roles.preview ?? "";
  return {
    default_backend: authoritative,
    authoritative_geometry: authoritative,
    preview,
    roles,
    backends: backends.map((b) => {
      const list = rolesOf(b);
      return { ...b, roles: list, role: list[0] ?? b.role };
    }),
  };
}

export function capabilityReportFromStatus(opts: {
  freecad: Parameters<typeof freecadCapabilities>[0];
  jscad?: Parameters<typeof jscadCapabilities>[0];
}): CapabilityReport {
  return capabilityReport([
    freecadCapabilities(opts.freecad),
    jscadCapabilities(opts.jscad ?? { available: true }),
  ]);
}

const OP_CAPABILITY: Record<string, CapabilityKey | CapabilityKey[]> = {
  create_box: "primitives.box",
  create_cylinder: "primitives.cylinder",
  create_sphere: "primitives.sphere",
  create_sketch: "primitives.sketch",
  pad: "feature.pad",
  pocket: "feature.pocket",
  create_hole: ["feature.hole.through", "feature.hole.blind"],
  fillet: "feature.fillet",
  chamfer: "feature.chamfer",
  create_pattern: "pattern.linear",
  boolean: "boolean.subtract",
  export_step: "export.step",
  export_fcstd: "export.fcstd",
  export_stl: "export.stl",
  export_3mf: "export.3mf",
  import_step: "import.step",
  import_fcstd: "import.fcstd",
  render_preview: "render.preview",
  query_geometry: "geometry.semantic_selectors",
};

export function capabilitiesForOperation(op: string): CapabilityKey[] {
  const raw = OP_CAPABILITY[op];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Capability keys required to execute this operation as requested (kind/type-sensitive). */
export function requiredCapabilitiesFor(op: string, args: Record<string, unknown> = {}): CapabilityKey[] {
  switch (op) {
    case "create_hole": {
      const keys: CapabilityKey[] = [];
      const type = args.type ?? (args.through === false || args.depth_mm !== undefined ? "blind" : "through");
      keys.push(type === "blind" ? "feature.hole.blind" : "feature.hole.through");
      if (args.counterbore_diameter_mm !== undefined) keys.push("feature.hole.counterbore");
      if (args.countersink_diameter_mm !== undefined) keys.push("feature.hole.countersink");
      if (args.thread) keys.push("feature.hole.thread_cosmetic");
      return keys;
    }
    case "create_pattern":
    case "pattern": {
      const kind = String(args.kind ?? (args.count_y !== undefined ? "rectangular" : "linear"));
      if (kind === "circular") return ["pattern.circular"];
      if (kind === "rectangular") return ["pattern.rectangular"];
      return ["pattern.linear"];
    }
    case "boolean":
    case "boolean_union":
    case "boolean_cut":
    case "boolean_intersect": {
      const operation = String(
        args.operation ??
          (op === "boolean_union" ? "union" : op === "boolean_intersect" ? "intersect" : "subtract"),
      );
      if (operation === "union") return ["boolean.union"];
      if (operation === "intersect") return ["boolean.intersect"];
      return ["boolean.subtract"];
    }
    default:
      return capabilitiesForOperation(op);
  }
}

export function firstUnsupportedCapability(
  backend: BackendCapabilities,
  keys: CapabilityKey[],
): CapabilityKey | null {
  if (!backend.available && keys.length) return keys[0] ?? null;
  for (const key of keys) {
    if (!backend.capabilities[key]) return key;
  }
  return null;
}
