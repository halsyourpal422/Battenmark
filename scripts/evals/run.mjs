#!/usr/bin/env node
/**
 * Phase 7C / 7C.2 — CAD skill evaluation harness.
 * Modes: reference | agent | agent-mock
 *
 * --mode agent is Layer B only: explicit non-mock provider required.
 * --mode agent-mock / eval:agent:mock remains the credential-free path.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, listScenarios, scoreTrace, loadSkillText, skillContextCost } from "./score.mjs";
import { ORACLES } from "./oracle.mjs";
import { runAgentLoop, assemblyMockScript } from "./agent-loop.mjs";
import { createMockProvider } from "./providers/mock.mjs";
import { loadProviderConfig, hasProviderCredential, validateProviderConfig } from "./providers/provider-config.mjs";
import { summarizeRuns, summarizeLayerB, isLayerBEvidence } from "./summarize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const REAL_AGENT_REFUSAL = `REAL_AGENT_PROVIDER_REQUIRED

Layer B evaluation requires an explicitly configured non-mock provider.
Set BATTENMARK_EVAL_PROVIDER=openai-compatible or use eval:agent:mock for mock tests.`;

export function resolveLayerBConfig({ env = process.env, authorizePaid = false } = {}) {
  const explicit = env.BATTENMARK_EVAL_PROVIDER;
  if (!explicit || explicit === "mock") {
    const err = new Error(REAL_AGENT_REFUSAL);
    err.code = "REAL_AGENT_PROVIDER_REQUIRED";
    throw err;
  }
  const overrides = { provider: explicit };
  if (env.BATTENMARK_EVAL_MODEL !== undefined) overrides.model = env.BATTENMARK_EVAL_MODEL;
  if (env.BATTENMARK_EVAL_API_KEY_ENV) overrides.apiKeyEnv = env.BATTENMARK_EVAL_API_KEY_ENV;
  if (env.BATTENMARK_EVAL_BASE_URL) overrides.baseUrl = env.BATTENMARK_EVAL_BASE_URL;
  const cfg = validateProviderConfig(loadProviderConfig(overrides));
  if (cfg.provider === "mock") {
    const err = new Error(REAL_AGENT_REFUSAL);
    err.code = "REAL_AGENT_PROVIDER_REQUIRED";
    throw err;
  }
  if (!hasProviderCredential(cfg, env)) {
    const err = new Error(`CREDENTIAL_MISSING: set ${cfg.apiKeyEnv} for provider ${cfg.provider}`);
    err.code = "CREDENTIAL_MISSING";
    throw err;
  }
  if (!authorizePaid) {
    const err = new Error("PAID_AUTHORIZATION_REQUIRED: pass --authorize-paid to execute credentialed A/B");
    err.code = "PAID_AUTHORIZATION_REQUIRED";
    throw err;
  }
  return cfg;
}

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
        execution_mode: "reference",
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
      results.push({ scenario_id: id, mode: "reference", execution_mode: "reference", score: 0, verdict: "FAIL", error: e.message });
    }
  }
  const outDir = join(ROOT, "scripts/evals/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "reference-summary.json"),
    JSON.stringify({ kind: "reference", execution_mode: "reference", battenmark_sha: process.env.GITHUB_SHA || "local", results, failures }, null, 2) + "\n",
  );
  console.log(`\nReference evaluation: ${results.length - failures}/${results.length} PASS`);
  if (failures) process.exit(1);
}

async function runAgent(scenarioFilter, conditionArg, { forceMock = false, repeats = 1 } = {}) {
  let cfg;
  let execution_mode;
  if (forceMock) {
    cfg = loadProviderConfig({ provider: "mock", model: "mock-model" });
    execution_mode = "mock-agent";
  } else {
    try {
      cfg = resolveLayerBConfig({ authorizePaid: flag("authorize-paid") });
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    execution_mode = "real-agent";
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
          config: forceMock ? { provider: "mock", model: "mock-model" } : cfg,
          runId: run,
        });
        results.push({
          ...row,
          execution_mode,
          provider: cfg.provider,
          model: cfg.model,
        });
        console.log(
          `${row.verdict === "PASS" ? "PASS" : "INFO"} ${id} ${condition} run=${run} score=${row.score} dof=${row.remaining_dof ?? "-"} term=${row.termination} mode=${execution_mode}`,
        );
      }
    }
  }
  const outDir = join(ROOT, "scripts/evals/results");
  await mkdir(outDir, { recursive: true });
  const summary = execution_mode === "real-agent" ? summarizeLayerB(results) : summarizeRuns(results);
  const payload = {
    kind: execution_mode === "real-agent" ? "real-agent" : "mock-agent",
    execution_mode,
    battenmark_sha: process.env.GITHUB_SHA || "local",
    provider: cfg.provider,
    model: cfg.model,
    results,
    summary,
    layer_b_rows: results.filter((r) => isLayerBEvidence(r)).length,
  };
  const filename = execution_mode === "real-agent" ? "agent-summary.json" : "agent-mock-summary.json";
  await writeFile(join(outDir, filename), JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nA/B summary (${execution_mode}):`);
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

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
 if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
