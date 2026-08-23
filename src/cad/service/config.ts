import { resolve } from "node:path";
import { AGENTCAD_SCHEMA_VERSION } from "../schema";

export type CadPermission = "cad:read" | "cad:write" | "cad:export" | "cad:admin";

export interface AgentCadConfig {
  workspace: string;
  apiToken: string;
  apiScopes: CadPermission[];
  host: string;
  port: number;
  logLevel: string;
  requireAuth: boolean;
  corsOrigins: string[];
  schemaVersion: typeof AGENTCAD_SCHEMA_VERSION;
}

function splitList(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): AgentCadConfig {
  const scopes = splitList(
    process.env.AGENTCAD_API_SCOPES,
    "cad:read,cad:write,cad:export,cad:admin",
  ) as CadPermission[];
  return {
    workspace: process.env.AGENTCAD_WORKSPACE || resolve(process.cwd(), "projects"),
    apiToken: process.env.AGENTCAD_API_TOKEN ?? "",
    apiScopes: scopes,
    host: process.env.AGENTCAD_HOST || "127.0.0.1",
    port: Number(process.env.AGENTCAD_PORT || 8787),
    logLevel: process.env.AGENTCAD_LOG_LEVEL || "info",
    requireAuth: process.env.AGENTCAD_REQUIRE_AUTH === "1",
    corsOrigins: splitList(
      process.env.AGENTCAD_CORS_ORIGINS,
      "http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:8787,http://localhost:8787",
    ),
    schemaVersion: AGENTCAD_SCHEMA_VERSION,
  };
}
