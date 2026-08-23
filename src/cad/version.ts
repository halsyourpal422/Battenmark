/**
 * Single source of truth for protocol versions.
 *
 * Schema version is independent of the application / MCP package version.
 * MCP 5.x speaks schema 2. Documents with schema 1 remain readable.
 *
 * The working identifier for this codebase is "cad-service".
 * "AgentCAD" remains a historical module prefix, not a final product name.
 */

export const AGENTCAD_SCHEMA_VERSION = 2 as const;
export const AGENTCAD_SCHEMA_MIN_READABLE = 1 as const;
export const AGENTCAD_MCP_VERSION = "5.0.0";
export const CAD_SERVICE_VERSION = "0.5.6";

/** Working identifier. Not a public brand. */
export const WORKING_PACKAGE_NAME = "cad-service";

export type SchemaVersion = 1 | 2;

export const SCHEMA_POLICY = {
  current: AGENTCAD_SCHEMA_VERSION,
  minReadable: AGENTCAD_SCHEMA_MIN_READABLE,
  note:
    "Schema 2 is the wire format. Schema 1 documents load. Unknown versions are SCHEMA_MISMATCH.",
} as const;

export function isReadableSchemaVersion(value: unknown): value is SchemaVersion {
  return value === 1 || value === 2;
}

export function assertCompatibleSchema(value: unknown): void {
  if (value === undefined || value === null) return;
  if (isReadableSchemaVersion(value)) return;
  const received = typeof value === "number" || typeof value === "string" ? value : typeof value;
  throw Object.assign(new Error(`Unsupported schema version '${received}'. This service speaks schema ${AGENTCAD_SCHEMA_VERSION}.`), {
    code: "SCHEMA_MISMATCH",
  });
}

/**
 * Logical freeze after Phase 5.5.1. Not a Git tag.
 * Phase 6 must build on these contracts rather than redesign them.
 */
export const FOUNDATION_FREEZE = {
  marker: "Universal CAD Foundation: Frozen after Phase 5.5.1",
  phase: "5.5.1",
  schema: AGENTCAD_SCHEMA_VERSION,
  mcp: AGENTCAD_MCP_VERSION,
  package: CAD_SERVICE_VERSION,
  operations: "backend-neutral",
  registry: true,
  roles: "dynamic",
  authoritative_today: "freecad",
  preview_today: "jscad",
  apple_silicon: "implemented-not-hardware-verified",
} as const;
