import { AGENTCAD_SCHEMA_VERSION } from "../schema";
import { CadError, cadError } from "../errors";
import type { CadErrorBody, CadErrorCode, ToolResult } from "../types";

export interface ServiceResult {
  ok: boolean;
  operation: string;
  agentcad_schema_version: typeof AGENTCAD_SCHEMA_VERSION;
  project_id?: string;
  document_id?: string;
  revision_id?: string | null;
  feature_id?: string;
  data?: unknown;
  validation?: { valid: boolean; issues?: unknown };
  error?: CadErrorBody;
  warnings?: string[];
  dry_run?: boolean;
}

export function okResult(
  operation: string,
  extra: Omit<ServiceResult, "ok" | "operation" | "agentcad_schema_version"> = {},
): ServiceResult {
  return {
    ok: true,
    operation,
    agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
    ...extra,
  };
}

export function failResult(
  operation: string,
  error: CadErrorBody,
  extra: Omit<ServiceResult, "ok" | "operation" | "agentcad_schema_version" | "error"> = {},
): ServiceResult {
  return {
    ok: false,
    operation,
    agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
    error,
    ...extra,
  };
}

export function fromToolResult(
  result: ToolResult,
  handles: { project_id?: string; document_id?: string; revision_id?: string | null },
): ServiceResult {
  const data = sanitizeData(result.data);
  const feature_id =
    data && typeof data === "object" && "id" in data && typeof (data as { id: unknown }).id === "string"
      ? (data as { id: string }).id
      : undefined;
  return {
    ok: result.ok,
    operation: result.operation,
    agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
    ...handles,
    feature_id,
    data,
    error: result.error,
    warnings: result.warnings,
  };
}

export function sanitizeData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const copy = { ...(data as Record<string, unknown>) };
  delete copy.ascii;
  delete copy.base64;
  delete copy.document;
  if (typeof copy.path === "string") delete copy.path;
  return copy;
}

export function asServiceError(err: unknown, operation: string): ServiceResult {
  if (err instanceof CadError) {
    return failResult(operation, err.body);
  }
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? ((err as { code: string }).code as CadErrorCode)
      : "INVALID_REFERENCE";
  const message = err instanceof Error ? err.message : String(err);
  return failResult(operation, { error: code, message });
}

export function httpStatusFor(result: ServiceResult): number {
  if (result.ok) return 200;
  const code = result.error?.error;
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "FORBIDDEN":
    case "PRIVILEGED_DENIED":
    case "PATH_DENIED":
      return 403;
    case "PROJECT_NOT_FOUND":
    case "ARTIFACT_NOT_FOUND":
    case "UNKNOWN_REVISION":
    case "UNKNOWN_BODY":
    case "UNKNOWN_FEATURE":
    case "UNKNOWN_PARAMETER":
    case "BACKEND_NOT_FOUND":
      return 404;
    case "PROJECT_BUSY":
    case "IDEMPOTENCY_CONFLICT":
    case "SCHEMA_MISMATCH":
    case "BACKEND_ROLE_CONFLICT":
    case "BACKEND_REGISTRATION_CONFLICT":
      return 409;
    case "MALFORMED_REQUEST":
      return 400;
    case "PARSE_ERROR":
      return 400;
    case "WORKER_CRASHED":
    case "OPERATION_TIMEOUT":
    case "KERNEL_UNAVAILABLE":
    case "BACKEND_UNAVAILABLE":
      return 503;
    default:
      return result.error ? 422 : 500;
  }
}

export { cadError };
