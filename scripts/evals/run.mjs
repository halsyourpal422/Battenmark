#!/usr/bin/env node
/**
 * Phase 7C — CAD skill evaluation harness entry.
 * Modes: reference | agent (credential-gated SKIP)
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, listScenarios, scoreTrace, loadSkillText, skillContextCost } from "./score.mjs";
import { ORACLES } from "./oracle.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}

async function runReference(scenarioFilter) {
  const ids = scenarioFilter ? [scenarioFilter] : await listScenarios();
  const results = [];
  let failures = 0;

  for (const id of ids) {
    const scenario = await loadScenario(id);
    const oracle = ORACLES[id];
    if (!oracle) {
      console.log(`SKIP ${id.padEnd(22)} no oracle`);
      continue;
    }
    try {
      const trace = oracle(scenario);
      const scored = scoreTrace(scenario, trace);
      const skillText = await loadSkillText(scenario.skill);
      const cost = skillContextCost(skillText);
      results.push({
        scenario_id: scenario.id,
        skill: scenario.skill,
        mode: "reference",
        score: scored.score,
        verdict: scored.verdict,
        hard_failures: scored.hard_failures,
        metrics: scored.metrics,
        checks: scored.checks,
        context_cost: cost,
        remaining_dof: trace.final_state?.remaining_dof,
      });
      const ok = scored.verdict === "PASS";
      if (!ok) failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${id.padEnd(22)} score=${scored.score} ${scored.verdict}` +
          (scored.hard_failures.length ? ` hard=${scored.hard_failures.join(",")}` : "") +
          (trace.final_state?.remaining_dof !== undefined ? ` dof=${trace.final_state.remaining_dof}` : ""),
      );
    } catch (e) {
      failures++;
      console.log(`FAIL ${id.padEnd(22)} oracle error: ${e.message}`);
      results.push({ scenario_id: id, mode: "reference", score: 0, verdict: "FAIL", error: e.message });
    }
  }

  const outDir = join(ROOT, "scripts/evals/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "reference-summary.json"),
    JSON.stringify({ kind: "reference", battenmark_sha: process.env.GITHUB_SHA || "local", results, failures }, null, 2) + "\n",
  );
  console.log(`\nReference evaluation: ${results.length - failures}/${results.length} PASS`);
  if (failures) process.exit(1);
}

async function runAgentPlaceholder(scenarioFilter, condition) {
  const hasCreds = Boolean(process.env.BATTENMARK_EVAL_MODEL || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  if (!hasCreds) {
    console.log("SKIP agent A/B — no model credentials (expected for CI)");
    console.log("Set BATTENMARK_EVAL_MODEL + provider key to enable manual agent runs.");
    console.log(`Would run: scenario=${scenarioFilter || "all"} condition=${condition || "both"}`);
    return;
  }
  console.log("Agent A/B credentials detected; schedule manual Layer B runs separately from CI.");
}

async function main() {
  const mode = arg("mode", "reference");
  const scenario = arg("scenario", null);
  const condition = arg("condition", null);
  if (mode === "reference") await runReference(scenario);
  else if (mode === "agent") await runAgentPlaceholder(scenario, condition);
  else {
    console.error(`Unknown mode: ${mode}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
