export interface ServiceLogFields {
  request_id?: string;
  client?: string;
  transport?: string;
  project_id?: string;
  document_id?: string;
  revision_id?: string | null;
  operation?: string;
  duration_ms?: number;
  kernel?: string;
  worker_pid?: number | null;
  result?: "ok" | "error";
  error_code?: string;
}

export function serviceLog(message: string, fields: ServiceLogFields = {}) {
  const level = process.env.AGENTCAD_LOG_LEVEL || "info";
  if (level === "silent") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    msg: message,
    ...fields,
  });
  process.stderr.write(line + "\n");
}
