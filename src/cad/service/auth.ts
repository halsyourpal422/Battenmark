import type { CadPermission } from "./config";
import { loadConfig } from "./config";
import { cadError } from "../errors";

export interface AuthContext {
  ok: true;
  mode: "token" | "developer";
  scopes: CadPermission[];
  client: string;
}

export interface AuthFailure {
  ok: false;
  code: "AUTH_REQUIRED" | "FORBIDDEN";
  message: string;
}

const ALL_SCOPES: CadPermission[] = ["cad:read", "cad:write", "cad:export", "cad:admin"];

function isLoopbackHost(host: string) {
  const h = host.replace(/:\d+$/, "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const alt = request.headers.get("x-api-key");
  return alt?.trim() || null;
}

export function authorizeRequest(
  request: Request,
  needed: CadPermission,
  opts?: { allowDeveloper?: boolean },
): AuthContext | AuthFailure {
  const config = loadConfig();
  const token = extractBearer(request);
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.hostname;
  const local = isLoopbackHost(host.split(",")[0] ?? host);
  const allowDev = opts?.allowDeveloper !== false && local && !config.requireAuth;

  if (!token) {
    if (allowDev) {
      return { ok: true, mode: "developer", scopes: ALL_SCOPES, client: "developer" };
    }
    return { ok: false, code: "AUTH_REQUIRED", message: "Bearer token required (AGENTCAD_API_TOKEN)." };
  }

  if (!config.apiToken) {
    if (allowDev) return { ok: true, mode: "developer", scopes: ALL_SCOPES, client: "developer" };
    return { ok: false, code: "AUTH_REQUIRED", message: "AGENTCAD_API_TOKEN is not configured on the server." };
  }

  if (token !== config.apiToken) {
    return { ok: false, code: "FORBIDDEN", message: "Invalid API token." };
  }

  if (!config.apiScopes.includes(needed) && needed !== "cad:admin") {
    return { ok: false, code: "FORBIDDEN", message: `Token is missing scope ${needed}.` };
  }

  return { ok: true, mode: "token", scopes: config.apiScopes, client: "token" };
}

export function assertScope(ctx: AuthContext, needed: CadPermission) {
  if (ctx.mode === "developer") return;
  if (needed === "cad:admin" && !ctx.scopes.includes("cad:admin")) {
    throw cadError("FORBIDDEN", "cad:admin scope required.");
  }
  if (!ctx.scopes.includes(needed) && !ctx.scopes.includes("cad:admin")) {
    throw cadError("FORBIDDEN", `Missing permission ${needed}.`);
  }
}

export function corsHeaders(request: Request): Record<string, string> {
  const config = loadConfig();
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Api-Key, Idempotency-Key, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Max-Age": "600",
  };
  if (origin && config.corsOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
