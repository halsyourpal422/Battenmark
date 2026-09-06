/**
 * Phase 7C.2 — Evaluation-only row checkpoint and resume integrity.
 * Stores scored Layer-B rows, never provider requests or credentials.
 */
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { readAndValidateCompletedTrace } from "./trace.mjs";

export const CHECKPOINT_SCHEMA_VERSION = "battenmark.eval.checkpoint.v2";

export class CheckpointError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CheckpointError";
    this.code = code;
  }
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

export function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function createExperimentDefinition(input) {
  const frozen = {
    battenmark_sha: String(input.battenmark_sha),
    provider: String(input.provider),
    model: String(input.model),
    temperature: Number(input.temperature),
    max_output_tokens: Number(input.max_output_tokens),
    conditions: [...input.conditions],
    repetitions: Number(input.repetitions),
    agent_turn_budget: Number(input.agent_turn_budget),
    tool_catalog_hash: String(input.tool_catalog_hash),
    evaluation_semantics: String(
      input.evaluation_semantics ?? "battenmark.phase7c.backend-recovery.v1",
    ),
    trace_schema_version: String(input.trace_schema_version ?? "none"),
    scenarios: input.scenarios.map((scenario) => ({
      key: String(scenario.key),
      id: String(scenario.id),
      scenario_hash: String(scenario.scenario_hash),
      skill: String(scenario.skill),
      skill_hash: String(scenario.skill_hash),
    })),
  };
  if (input.enclosure_scorer_semantics !== undefined) {
    frozen.enclosure_scorer_semantics = String(input.enclosure_scorer_semantics);
  }
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    experiment_id: sha256Canonical(frozen),
    ...frozen,
  };
}

export function buildMatrix(experiment) {
  const matrix = [];
  for (const scenario of experiment.scenarios) {
    for (const condition of experiment.conditions) {
      for (let run = 1; run <= experiment.repetitions; run++) {
        matrix.push({
          matrix_key: `${scenario.key}|${condition}|${run}`,
          scenario_key: scenario.key,
          scenario_id: scenario.id,
          skill: scenario.skill,
          condition,
          run,
        });
      }
    }
  }
  if (new Set(matrix.map((entry) => entry.matrix_key)).size !== matrix.length) {
    throw new CheckpointError(
      "CHECKPOINT_MATRIX_INVALID",
      "Expected matrix contains duplicate keys",
    );
  }
  return matrix;
}

function newCheckpoint(experiment) {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    experiment_id: experiment.experiment_id,
    status: "in_progress",
    experiment,
    completed_rows: [],
  };
}

export async function atomicWriteJson(path, value) {
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

export function atomicWriteCheckpoint(path, checkpoint) {
  return atomicWriteJson(path, checkpoint);
}

export async function readCheckpoint(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new CheckpointError("CHECKPOINT_NOT_FOUND", `Checkpoint not found: ${path}`);
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.completed_rows))
      throw new Error("invalid structure");
    return parsed;
  } catch (err) {
    throw new CheckpointError(
      "CHECKPOINT_CORRUPT",
      `Checkpoint is invalid JSON or has an invalid structure: ${err.message}`,
    );
  }
}

function assertRowMatches(entry, row, experiment) {
  const traceRequired = experiment.trace_schema_version !== "none";
  const valid =
    row &&
    typeof row === "object" &&
    row.schema === "battenmark.eval.agent.v1" &&
    row.matrix_key === entry.matrix_key &&
    row.scenario_id === entry.scenario_id &&
    row.skill === entry.skill &&
    row.condition === entry.condition &&
    row.run === entry.run &&
    row.execution_mode === "real-agent" &&
    row.provider === experiment.provider &&
    row.model === experiment.model &&
    row.temperature === experiment.temperature &&
    row.evaluation_semantics === experiment.evaluation_semantics &&
    (!traceRequired ||
      (row.trace_status === "complete" &&
        row.trace_schema_version === experiment.trace_schema_version &&
        typeof row.trace_path === "string" &&
        /^[a-f0-9]{64}$/.test(row.trace_sha256))) &&
    typeof row.score === "number" &&
    typeof row.verdict === "string" &&
    typeof row.termination === "string";
  if (!valid) {
    throw new CheckpointError(
      "CHECKPOINT_ROW_INVALID",
      `Completed row is invalid for matrix key ${entry.matrix_key}`,
    );
  }
}

function checkpointSafeRow(row) {
  const allowed = [
    "schema",
    "matrix_key",
    "scenario_id",
    "skill",
    "condition",
    "provider",
    "model",
    "temperature",
    "run",
    "turns",
    "tool_call_count",
    "score",
    "verdict",
    "hard_failures",
    "metrics",
    "checks",
    "termination",
    "context_cost",
    "remaining_dof",
    "usage",
    "execution_mode",
    "evaluation_semantics",
    "trace_path",
    "trace_sha256",
    "trace_schema_version",
    "trace_status",
  ];
  return Object.fromEntries(
    allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  );
}

async function validateCheckpointTraces(checkpoint, experiment, tracesDir) {
  if (experiment.trace_schema_version === "none") return;
  if (!tracesDir) {
    throw new CheckpointError(
      "CHECKPOINT_TRACE_INVALID",
      "Trace directory is required for traced experiment rows",
    );
  }
  for (const row of checkpoint.completed_rows) {
    try {
      await readAndValidateCompletedTrace({
        tracesDir,
        tracePath: row.trace_path,
        traceSha256: row.trace_sha256,
        expected: {
          trace_schema_version: experiment.trace_schema_version,
          evaluation_semantics: experiment.evaluation_semantics,
          experiment_id: experiment.experiment_id,
          battenmark_sha: experiment.battenmark_sha,
          provider: row.provider,
          model: row.model,
          matrix_key: row.matrix_key,
          scenario_id: row.scenario_id,
          condition: row.condition,
          run: row.run,
        },
      });
    } catch (error) {
      throw new CheckpointError(
        "CHECKPOINT_TRACE_INVALID",
        `Completed row trace is invalid for ${row.matrix_key}: ${error.message}`,
      );
    }
  }
}

function validateCheckpoint(checkpoint, experiment, matrix) {
  if (
    checkpoint.schema_version !== CHECKPOINT_SCHEMA_VERSION ||
    !checkpoint.experiment ||
    typeof checkpoint.experiment !== "object"
  ) {
    throw new CheckpointError(
      "CHECKPOINT_CORRUPT",
      "Checkpoint schema or experiment metadata is invalid",
    );
  }
  const recomputed = createExperimentDefinition(checkpoint.experiment);
  if (recomputed.experiment_id !== checkpoint.experiment_id) {
    throw new CheckpointError(
      "CHECKPOINT_CORRUPT",
      "Checkpoint experiment identity does not match its stored metadata",
    );
  }
  if (checkpoint.experiment_id !== experiment.experiment_id) {
    throw new CheckpointError(
      "CHECKPOINT_EXPERIMENT_MISMATCH",
      `Checkpoint experiment ${checkpoint.experiment_id} does not match requested experiment ${experiment.experiment_id}`,
    );
  }
  if (!Array.isArray(checkpoint.completed_rows)) {
    throw new CheckpointError("CHECKPOINT_CORRUPT", "Checkpoint completed_rows must be an array");
  }
  const expected = new Map(matrix.map((entry) => [entry.matrix_key, entry]));
  const seen = new Set();
  for (const row of checkpoint.completed_rows) {
    if (seen.has(row?.matrix_key)) {
      throw new CheckpointError(
        "CHECKPOINT_DUPLICATE_MATRIX_KEY",
        `Duplicate completed matrix key: ${row?.matrix_key}`,
      );
    }
    seen.add(row?.matrix_key);
    const entry = expected.get(row?.matrix_key);
    if (!entry)
      throw new CheckpointError(
        "CHECKPOINT_ROW_INVALID",
        `Unexpected completed matrix key: ${row?.matrix_key}`,
      );
    assertRowMatches(entry, row, experiment);
  }
  return checkpoint;
}

function orderedRows(checkpoint, matrix) {
  const byKey = new Map(checkpoint.completed_rows.map((row) => [row.matrix_key, row]));
  return matrix.map((entry) => byKey.get(entry.matrix_key)).filter(Boolean);
}

export async function runCheckpointedMatrix({
  experiment,
  matrix,
  checkpointPath,
  tracesDir,
  resume,
  executeRow,
}) {
  let checkpoint;
  if (resume) {
    checkpoint = validateCheckpoint(await readCheckpoint(checkpointPath), experiment, matrix);
    await validateCheckpointTraces(checkpoint, experiment, tracesDir);
  } else {
    checkpoint = newCheckpoint(experiment);
    await atomicWriteCheckpoint(checkpointPath, checkpoint);
  }

  const completedKeys = new Set(checkpoint.completed_rows.map((row) => row.matrix_key));
  for (const entry of matrix) {
    if (completedKeys.has(entry.matrix_key)) continue;
    const completedRow = checkpointSafeRow(await executeRow(entry));
    assertRowMatches(entry, completedRow, experiment);
    await validateCheckpointTraces({ completed_rows: [completedRow] }, experiment, tracesDir);
    checkpoint.completed_rows.push(completedRow);
    completedKeys.add(entry.matrix_key);
    await atomicWriteCheckpoint(checkpointPath, checkpoint);
  }

  validateCheckpoint(checkpoint, experiment, matrix);
  return { checkpoint, rows: orderedRows(checkpoint, matrix) };
}

export async function finalizeCheckpoint({
  checkpointPath,
  checkpoint,
  matrix,
  tracesDir,
  writeSummary,
}) {
  validateCheckpoint(checkpoint, checkpoint.experiment, matrix);
  await validateCheckpointTraces(checkpoint, checkpoint.experiment, tracesDir);
  const rows = orderedRows(checkpoint, matrix);
  if (
    rows.length !== matrix.length ||
    new Set(rows.map((row) => row.matrix_key)).size !== matrix.length
  ) {
    throw new CheckpointError(
      "CHECKPOINT_INCOMPLETE",
      `Checkpoint has ${rows.length}/${matrix.length} completed rows`,
    );
  }
  await writeSummary(rows);
  checkpoint.status = "complete";
  await atomicWriteCheckpoint(checkpointPath, checkpoint);
  return rows;
}
