import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const TRACE_SCHEMA_VERSION = "battenmark.eval.trace.v1";
export const EVALUATION_SEMANTICS_VERSION = "battenmark.phase7c.agent-protocol.v3";
export const MODEL_TOOL_RESULT_SCHEMA_VERSION = "battenmark.eval.tool-result.v1";

const MODEL_RESULT_MAX_DEPTH = 5;
const MODEL_RESULT_MAX_OBJECT_KEYS = 40;
const MODEL_RESULT_MAX_ARRAY_ITEMS = 24;
const MODEL_RESULT_MAX_STRING_CHARS = 1_000;
const MODEL_RESULT_MAX_MESSAGE_CHARS = 24_000;

const FORBIDDEN_KEY =
  /authorization|api[_-]?key|credential|secret|headers?|provider.?metadata|billing|account|access[_-]?token|refresh[_-]?token|session[_-]?token|password|private[_-]?key|cookie/i;
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /sk-[A-Za-z0-9_-]+/g,
  /OPENAI_API_KEY\s*=\s*\S+/gi,
  /BATTENMARK_TEST_SECRET_DO_NOT_LEAK/g,
];

function redactString(value) {
  let safe = String(value);
  for (const pattern of SECRET_PATTERNS) safe = safe.replace(pattern, "[REDACTED]");
  return safe;
}

export function sanitizeTraceValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeTraceValue(item, seen));
  if (typeof value !== "object") return redactString(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const entries = [];
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key) || item === undefined) continue;
    entries.push([key, sanitizeTraceValue(item, seen)]);
  }
  seen.delete(value);
  return Object.fromEntries(entries);
}

export function sanitizeMessages(messages) {
  return (messages || []).map((message) => ({
    role: redactString(message?.role ?? ""),
    content: redactString(message?.content ?? ""),
  }));
}

export function sanitizeUsage(usage) {
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokens ?? usage.prompt_tokens ?? null,
    completionTokens: usage.completionTokens ?? usage.completion_tokens ?? null,
  };
}

export function sanitizeToolResult(result) {
  const safe = {
    ok: result?.ok !== false,
  };
  if (result?.code !== undefined) safe.code = redactString(result.code);
  const message = result?.message ?? result?.error;
  if (message !== undefined) safe.message = redactString(message);
  for (const key of ["details", "data", "state", "artifact_id", "observation"]) {
    if (result?.[key] !== undefined) safe[key] = sanitizeTraceValue(result[key]);
  }
  return safe;
}

function boundModelValue(value, depth = 0) {
  if (typeof value === "string") {
    return value.length > MODEL_RESULT_MAX_STRING_CHARS
      ? `${value.slice(0, MODEL_RESULT_MAX_STRING_CHARS)}[TRUNCATED]`
      : value;
  }
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (depth >= MODEL_RESULT_MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    const bounded = value
      .slice(0, MODEL_RESULT_MAX_ARRAY_ITEMS)
      .map((item) => boundModelValue(item, depth + 1));
    if (value.length > MODEL_RESULT_MAX_ARRAY_ITEMS) bounded.push("[TRUNCATED_ITEMS]");
    return bounded;
  }
  const keys = Object.keys(value).sort();
  const bounded = Object.fromEntries(
    keys
      .slice(0, MODEL_RESULT_MAX_OBJECT_KEYS)
      .map((key) => [key, boundModelValue(value[key], depth + 1)]),
  );
  if (keys.length > MODEL_RESULT_MAX_OBJECT_KEYS) bounded._truncated_keys = true;
  return bounded;
}

export function createModelToolResult({ operation, toolCallId, result }) {
  const safe = sanitizeToolResult(result);
  const modelResult = {
    tool_call_id: redactString(toolCallId ?? ""),
    operation: redactString(operation ?? ""),
    ok: safe.ok,
  };
  for (const key of ["code", "message", "details", "data", "state", "artifact_id"]) {
    if (safe[key] !== undefined) modelResult[key] = boundModelValue(safe[key]);
  }
  return modelResult;
}

export function formatModelToolResults(results) {
  const payload = {
    schema_version: MODEL_TOOL_RESULT_SCHEMA_VERSION,
    results: (results || []).map((result) => boundModelValue(result)),
  };
  let content = JSON.stringify(payload, null, 2);
  if (content.length <= MODEL_RESULT_MAX_MESSAGE_CHARS) return `Tool results:\n${content}`;

  const summaries = payload.results.map((result) => ({
    tool_call_id: result.tool_call_id,
    operation: result.operation,
    ok: result.ok,
    code: result.code,
    message: result.message,
    state: result.state,
    artifact_id: result.artifact_id,
    truncated: true,
  }));
  content = JSON.stringify(
    { schema_version: MODEL_TOOL_RESULT_SCHEMA_VERSION, results: summaries },
    null,
    2,
  );
  if (content.length > MODEL_RESULT_MAX_MESSAGE_CHARS) {
    const minimal = summaries.map((result) => ({
      tool_call_id: result.tool_call_id,
      operation: result.operation,
      ok: result.ok,
      code: result.code,
      truncated: true,
    }));
    while (
      minimal.length > 1 &&
      JSON.stringify({ schema_version: MODEL_TOOL_RESULT_SCHEMA_VERSION, results: minimal })
        .length > MODEL_RESULT_MAX_MESSAGE_CHARS
    ) {
      minimal.pop();
    }
    content = JSON.stringify(
      {
        schema_version: MODEL_TOOL_RESULT_SCHEMA_VERSION,
        results: minimal,
        omitted_results: summaries.length - minimal.length,
      },
      null,
      2,
    );
  }
  return `Tool results:\n${content}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function sha256CanonicalTrace(trace) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(trace)))
    .digest("hex");
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, "w", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export function createTraceDocument(metadata) {
  return {
    schema_version: metadata.traceSchemaVersion ?? TRACE_SCHEMA_VERSION,
    evaluation_semantics: metadata.evaluationSemantics ?? EVALUATION_SEMANTICS_VERSION,
    status: "partial",
    experiment: {
      experiment_id: String(metadata.experimentId),
      battenmark_sha: String(metadata.battenmarkSha),
      provider: String(metadata.provider),
      model: String(metadata.model),
      execution_mode: String(metadata.executionMode),
      tool_catalog_hash: String(metadata.toolCatalogHash),
    },
    row: {
      matrix_key: String(metadata.matrixKey),
      scenario_id: String(metadata.scenarioId),
      condition: String(metadata.condition),
      run: Number(metadata.run),
    },
    events: [],
    termination: null,
    final: null,
  };
}

export function appendTraceEvent(trace, event) {
  trace.events.push({
    sequence: trace.events.length + 1,
    ...sanitizeTraceValue(event),
  });
}

export async function writePartialTrace(filePath, trace) {
  trace.status = "partial";
  await atomicWriteJson(filePath, trace);
}

export async function completeTrace(filePath, relativePath, trace, final) {
  trace.status = "complete";
  trace.termination = String(final.termination);
  trace.final = sanitizeTraceValue({
    final_state: final.final_state,
    score: final.score,
    verdict: final.verdict,
    checks: final.checks,
    hard_failures: final.hard_failures,
    metrics: final.metrics,
    remaining_dof: final.remaining_dof,
  });
  await atomicWriteJson(filePath, trace);
  return {
    trace_path: relativePath,
    trace_sha256: sha256CanonicalTrace(trace),
    trace_schema_version: trace.schema_version,
    trace_status: trace.status,
  };
}

export async function readAndValidateCompletedTrace({
  tracesDir,
  tracePath,
  traceSha256,
  expected = {},
}) {
  if (!tracesDir || !tracePath || isAbsolute(tracePath)) {
    throw new Error("Trace directory/path is missing or unsafe");
  }
  const root = resolve(tracesDir);
  const fullPath = resolve(root, tracePath);
  if (relative(root, fullPath).startsWith("..")) throw new Error("Trace path escapes trace root");
  const trace = JSON.parse(await readFile(fullPath, "utf8"));
  if (trace.status !== "complete") throw new Error("Trace is not complete");
  if (trace.schema_version !== expected.trace_schema_version)
    throw new Error("Trace schema version mismatch");
  if (trace.evaluation_semantics !== expected.evaluation_semantics)
    throw new Error("Trace evaluation semantics mismatch");
  if (trace.experiment?.experiment_id !== expected.experiment_id)
    throw new Error("Trace experiment identity mismatch");
  for (const key of ["battenmark_sha", "provider", "model"]) {
    if (expected[key] !== undefined && trace.experiment?.[key] !== expected[key])
      throw new Error(`Trace experiment ${key} mismatch`);
  }
  if (trace.row?.matrix_key !== expected.matrix_key) throw new Error("Trace matrix key mismatch");
  for (const key of ["scenario_id", "condition", "run"]) {
    if (expected[key] !== undefined && trace.row?.[key] !== expected[key])
      throw new Error(`Trace row ${key} mismatch`);
  }
  if (sha256CanonicalTrace(trace) !== traceSha256) throw new Error("Trace SHA-256 mismatch");
  return trace;
}
