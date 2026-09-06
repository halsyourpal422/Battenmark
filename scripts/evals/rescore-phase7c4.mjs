#!/usr/bin/env node
/**
 * Read-only forensic re-score of the preserved Phase 7C.4 real-agent traces.
 * This never writes the checkpoint, summary, or trace files.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatrix, createExperimentDefinition } from "./checkpoint.mjs";
import { interpretDelta, scoreTrace } from "./score.mjs";
import { readAndValidateCompletedTrace } from "./trace.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const resultsDir = join(root, "scripts/evals/results");
const tracesDir = join(resultsDir, "traces");
const checkpointPath = join(resultsDir, "agent-checkpoint.json");

function scorerTrace(forensic) {
  const results = new Map(
    forensic.events
      .filter((event) => event.kind === "tool_result")
      .map((event) => [`${event.tool_call_id}:${event.order}`, event.result]),
  );
  const tool_calls = forensic.events
    .filter((event) => event.kind === "tool_call")
    .map((event) => {
      const result = results.get(`${event.tool_call_id}:${event.order}`) || {};
      return {
        id: event.tool_call_id,
        order: event.order,
        name: event.name,
        args: event.args || {},
        ok: result.ok !== false,
        code: result.code,
        error: result.message,
        details: result.details,
        data: result.data,
      };
    });
  const artifact_ids = forensic.events
    .filter((event) => event.kind === "tool_result" && event.result?.artifact_id)
    .map((event) => event.result.artifact_id);
  const errors = tool_calls
    .filter((call) => call.ok === false)
    .map((call) => ({ code: call.code, message: call.error }));
  return {
    tool_calls,
    final_state: forensic.final?.final_state || {},
    artifact_ids,
    notes: [],
    errors,
    completion_status: forensic.termination === "model_stop" ? "complete" : "incomplete",
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
const experiment = createExperimentDefinition(checkpoint.experiment);
if (experiment.experiment_id !== checkpoint.experiment_id) {
  throw new Error("Preserved checkpoint experiment identity is invalid");
}
const matrix = buildMatrix(experiment);
if (checkpoint.completed_rows.length !== 18 || matrix.length !== 18) {
  throw new Error(`Expected 18 preserved rows, found ${checkpoint.completed_rows.length}`);
}

const scenarios = new Map();
for (const entry of matrix) {
  if (!scenarios.has(entry.scenario_key)) {
    scenarios.set(
      entry.scenario_key,
      JSON.parse(
        await readFile(join(root, "scripts/evals/scenarios", `${entry.scenario_key}.json`), "utf8"),
      ),
    );
  }
}

const rows = [];
const byKey = new Map(checkpoint.completed_rows.map((row) => [row.matrix_key, row]));
for (const entry of matrix) {
  const historical = byKey.get(entry.matrix_key);
  if (!historical) throw new Error(`Missing preserved row ${entry.matrix_key}`);
  const forensic = await readAndValidateCompletedTrace({
    tracesDir,
    tracePath: historical.trace_path,
    traceSha256: historical.trace_sha256,
    expected: {
      trace_schema_version: experiment.trace_schema_version,
      evaluation_semantics: experiment.evaluation_semantics,
      experiment_id: experiment.experiment_id,
      battenmark_sha: experiment.battenmark_sha,
      provider: historical.provider,
      model: historical.model,
      matrix_key: historical.matrix_key,
      scenario_id: historical.scenario_id,
      condition: historical.condition,
      run: historical.run,
    },
  });
  const corrected = scoreTrace(scenarios.get(entry.scenario_key), scorerTrace(forensic));
  rows.push({
    scenario: entry.scenario_key,
    condition: entry.condition,
    run: entry.run,
    old_score: historical.score,
    corrected_score: corrected.score,
    delta: corrected.score - historical.score,
    corrected_checks: corrected.checks,
  });
}

const aggregates = [];
for (const scenario of [...new Set(rows.map((row) => row.scenario))]) {
  const noSkill = rows
    .filter((row) => row.scenario === scenario && row.condition === "no-skill")
    .map((row) => row.corrected_score);
  const withSkill = rows
    .filter((row) => row.scenario === scenario && row.condition === "with-skill")
    .map((row) => row.corrected_score);
  const delta = Math.round((mean(withSkill) - mean(noSkill)) * 100) / 100;
  aggregates.push({
    scenario,
    no_skill_scores: noSkill,
    with_skill_scores: withSkill,
    no_skill_mean: Math.round(mean(noSkill) * 100) / 100,
    with_skill_mean: Math.round(mean(withSkill) * 100) / 100,
    delta,
    classification: interpretDelta(delta),
  });
}

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        label: "PHASE 7C.4 TRACE RE-SCORE UNDER ENCLOSURE-SCORER-V2",
        source_experiment_id: experiment.experiment_id,
        source_battenmark_sha: experiment.battenmark_sha,
        rows,
        aggregates,
      },
      null,
      2,
    ),
  );
} else {
  console.log("PHASE 7C.4 TRACE RE-SCORE UNDER ENCLOSURE-SCORER-V2");
  console.log("OFFLINE RE-SCORE — NOT A NEW REAL-AGENT EXPERIMENT\n");
  console.log("| Scenario | Condition | Run | Old | Corrected | Delta |");
  console.log("|---|---|---:|---:|---:|---:|");
  for (const row of rows) {
    console.log(
      `| ${row.scenario} | ${row.condition} | ${row.run} | ${row.old_score} | ${row.corrected_score} | ${row.delta} |`,
    );
  }
  console.log("\n| Scenario | No-skill | With-skill | Means | Delta | Classification |");
  console.log("|---|---|---|---|---:|---|");
  for (const row of aggregates) {
    console.log(
      `| ${row.scenario} | ${row.no_skill_scores.join(", ")} | ${row.with_skill_scores.join(", ")} | ${row.no_skill_mean.toFixed(2)} vs ${row.with_skill_mean.toFixed(2)} | ${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(2)} | ${row.classification} |`,
    );
  }
}
