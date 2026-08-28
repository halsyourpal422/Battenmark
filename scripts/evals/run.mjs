#!/usr/bin/env node
/**
 * Phase 7C / 7C.2 — CAD skill evaluation harness.
 * Modes: reference | agent | agent-mock
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, listScenarios, scoreTrace, loadSkillText, skillContextCost } from "./score.mjs";
import { ORACLES } from "./oracle.mjs";
import { runAgentLoop, assemblyMockScript } from "./agent-loop.mjs";
import { createMockProvider } from "./providers/mock.mjs";
import { loadProviderConfig, hasProviderCredential } from "./providers/provider-config.mjs";
import { summarizeRuns } from "./summarize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
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

async function runAgent(scenarioFilter, conditionArg, { forceMock = false, repeats = 1 } = {}) {
  const cfg = loadProviderConfig(forceMock ? { provider: "mock", model: "mock-model" } : {});
  if (!forceMock && cfg.provider !== "mock" && !hasProviderCredential(cfg)) {
    console.error(`CREDENTIAL_MISSING: set ${cfg.apiKeyEnv} for provider ${cfg.provider}`);
    process.exit(2);
  }
  if (!forceMock && cfg.provider !== "mock" && hasProviderCredential(cfg) && !flag("authorize-paid")) {
    console.log("SKIP real-agent paid run — pass --authorize-paid to execute credentialed A/B");
    console.log(`Configured provider=${cfg.provider} model=${cfg.model || "(required)"}`);
    return;
  }

  const ids = scenarioFilter ? [scenarioFilter] : ["assembly", "enclosure", "backend-diagnostics"];
  const conditions = conditionArg === "both" || !conditionArg ? ["no-skill", "with-skill"] : [conditionArg];
  const results = [];
  for (const id of ids) {
    for (const condition of conditions) {
      for (let run = 1; run <= Number(repeats); run++) {
        const row = await runAgentLoop({
          scenarioId: id,
          condition,
          provider: forceMock && id === "assembly" ? createMockProvider({ script: assemblyMockScript() }) : undefined,
          config: forceMock ? { provider: "mock", model: "mock-model" } : {},
          runId: run,
        });
        results.push(row);
        console.log(
          `${row.verdict === "PASS" ? "PASS" : "INFO"} ${id} ${condition} run=${run} score=${row.score} dof=${row.remaining_dof ?? "-"} term=${row.termination}`,
        );
      }
    }
  }
  const outDir = join(ROOT, "scripts/evals/results");
  await mkdir(outDir, { recursive: true });
  const payload = {
    kind: "agent",
    battenmark_sha: process.env.GITHUB_SHA || "local",
    provider: forceMock ? "mock" : cfg.provider,
    model: cfg.model,
    results,
    summary: summarizeRuns(results),
  };
  await writeFile(join(outDir, "agent-summary.json"), JSON.stringify(payload, null, 2) + "\n");
  console.log("\nA/B summary:");
  for (const row of payload.summary) console.log(`  ${row.scenario} Δ=${row.delta} ${row.classification}`);
}

async function main() {
  const mode = arg("mode", "reference");
  const scenario = arg("scenario", null);
  const condition = arg("condition", "both");
  const repeats = arg("repeats", "1");
  if (mode === "reference") await runReference(scenario);
  else if (mode === "agent") await runAgent(scenario, condition, { forceMock: false, repeats });
  else if (mode === "agent-mock") await runAgent(scenario, condition, { forceMock: true, repeats });
  else {
    console.error(`Unknown mode: ${mode}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
