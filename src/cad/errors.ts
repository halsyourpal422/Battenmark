import type { CadErrorBody, CadErrorCode } from "./types";

export class CadError extends Error {
  body: CadErrorBody;

  constructor(body: CadErrorBody) {
    super(body.message);
    this.name = "CadError";
    this.body = body;
  }
}

export function cadError(
  code: CadErrorCode,
  message: string,
  extra: Omit<CadErrorBody, "error" | "message"> = {},
): CadError {
  return new CadError({ error: code, message, ...extra });
}

export function asToolError(err: unknown, operation: string) {
  if (err instanceof CadError) {
    return { ok: false as const, operation, error: err.body };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false as const,
    operation,
    error: {
      error: "TESSELLATION_FAILED" as const,
      message,
    },
  };
}
