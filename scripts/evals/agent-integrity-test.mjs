#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildRealAgentExperiment, resolveLayerBConfig } from "./run.mjs";
import { isLayerBEvidence, summarizeLayerB, summarizeRuns } from "./summarize.mjs";
import { buildMatrix } from "./checkpoint.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(id, fn) {
  try {
    await fn();
    out.push({ id, passed: true });
    console.log(`PASS ${id}`);
  } catch (err) {
    out.push({ id, passed: false });
    console.log(`FAIL ${id} ${err instanceof Error ? err.message : err}`);
  }
}

function refuseCode(env, extraArgs = []) {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/evals/run.mjs",
      "--mode",
      "agent",
      "--scenario",
      "assembly",
      "--condition",
      "both",
      "--repeats",
      "1",
      ...extraArgs,
    ],
    {
      cwd: root,
      env: { ...process.env, ...env, OPENAI_API_KEY: env.OPENAI_API_KEY ?? "" },
      encoding: "utf8",
    },
  );
  return result;
}

await test("real-agent-refuses-implicit-mock", () => {
  const env = { ...process.env };
  delete env.BATTENMARK_EVAL_PROVIDER;
  delete env.OPENAI_API_KEY;
  try {
    resolveLayerBConfig({ env, authorizePaid: true });
    throw new Error("expected throw");
  } catch (err) {
    assert(err.code === "REAL_AGENT_PROVIDER_REQUIRED", String(err.code));
    assert(/REAL_AGENT_PROVIDER_REQUIRED/.test(err.message), err.message);
  }
});

await test("real-agent-refuses-explicit-mock", () => {
  try {
    resolveLayerBConfig({
      env: {
        BATTENMARK_EVAL_PROVIDER: "mock",
        OPENAI_API_KEY: "BATTENMARK_TEST_SECRET_DO_NOT_LEAK",
      },
      authorizePaid: true,
    });
    throw new Error("expected throw");
  } catch (err) {
    assert(err.code === "REAL_AGENT_PROVIDER_REQUIRED", String(err.code));
  }
});

await test("model-name-is-not-credential", () => {
  try {
    resolveLayerBConfig({
      env: {
        BATTENMARK_EVAL_PROVIDER: "openai-compatible",
        BATTENMARK_EVAL_MODEL: "gpt-4o",
        BATTENMARK_EVAL_API_KEY_ENV: "OPENAI_API_KEY",
        OPENAI_API_KEY: "",
      },
      authorizePaid: true,
    });
    throw new Error("expected throw");
  } catch (err) {
    assert(err.code === "CREDENTIAL_MISSING", String(err.code));
  }
});

await test("credential-without-authorize-paid-refuses", () => {
  try {
    resolveLayerBConfig({
      env: {
        BATTENMARK_EVAL_PROVIDER: "openai-compatible",
        BATTENMARK_EVAL_MODEL: "gpt-4o",
        OPENAI_API_KEY: "BATTENMARK_TEST_SECRET_DO_NOT_LEAK",
      },
      authorizePaid: false,
    });
    throw new Error("expected throw");
  } catch (err) {
    assert(err.code === "PAID_AUTHORIZATION_REQUIRED", String(err.code));
  }
});

await test("authorized-path-reaches-provider-seam", () => {
  const cfg = resolveLayerBConfig({
    env: {
      BATTENMARK_EVAL_PROVIDER: "openai-compatible",
      BATTENMARK_EVAL_MODEL: "gpt-4o-mini",
      BATTENMARK_EVAL_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "BATTENMARK_TEST_SECRET_DO_NOT_LEAK",
    },
    authorizePaid: true,
  });
  assert(cfg.provider === "openai-compatible", cfg.provider);
  assert(cfg.model === "gpt-4o-mini", cfg.model);
});

await test("real-experiment-identity-binds-frozen-inputs", async () => {
  const cfg = validateTestConfig();
  const experiment = await buildRealAgentExperiment({
    cfg,
    scenarioKeys: ["assembly", "enclosure", "backend-diagnostics"],
    conditions: ["no-skill", "with-skill"],
    repetitions: 3,
    battenmarkSha: "test-sha",
  });
  assert(experiment.battenmark_sha === "test-sha", experiment.battenmark_sha);
  assert(
    experiment.model === "gpt-4o" &&
      experiment.temperature === 0 &&
      experiment.max_output_tokens === 4096,
    "frozen config",
  );
  assert(experiment.agent_turn_budget === 12, String(experiment.agent_turn_budget));
  assert(
    experiment.scenarios.every(
      (scenario) => scenario.scenario_hash.length === 64 && scenario.skill_hash.length === 64,
    ),
    "content hashes",
  );
  assert(experiment.tool_catalog_hash.length === 64, "tool catalog hash");
  assert(buildMatrix(experiment).length === 18, "matrix size");
  assert(
    !JSON.stringify(experiment).includes("BATTENMARK_TEST_SECRET_DO_NOT_LEAK"),
    "secret in identity",
  );
});

function validateTestConfig() {
  return {
    provider: "openai-compatible",
    model: "gpt-4o",
    temperature: 0,
    maxOutputTokens: 4096,
    timeoutMs: 30000,
  };
}

await test("cli-refuses-implicit-mock", () => {
  const env = { ...process.env, BATTENMARK_EVAL_PROVIDER: "", OPENAI_API_KEY: "" };
  delete env.BATTENMARK_EVAL_PROVIDER;
  const result = refuseCode(env, ["--authorize-paid"]);
  assert(result.status === 2, `status=${result.status} ${result.stderr}${result.stdout}`);
  assert(
    /REAL_AGENT_PROVIDER_REQUIRED/.test(result.stderr + result.stdout),
    result.stderr + result.stdout,
  );
});

await test("cli-refuses-non-frozen-paid-matrix", () => {
  const result = refuseCode(
    {
      BATTENMARK_EVAL_PROVIDER: "openai-compatible",
      BATTENMARK_EVAL_MODEL: "gpt-4o",
      BATTENMARK_EVAL_API_KEY_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "BATTENMARK_TEST_SECRET_DO_NOT_LEAK",
    },
    ["--authorize-paid"],
  );
  assert(result.status === 2, `status=${result.status}`);
  assert(
    /FROZEN_LAYER_B_MATRIX_REQUIRED/.test(result.stderr + result.stdout),
    result.stderr + result.stdout,
  );
});

await test("mock-rows-excluded-from-layer-b-aggregate", () => {
  const mixed = [
    {
      scenario_id: "assembly-planar-001",
      condition: "no-skill",
      score: 90,
      execution_mode: "mock-agent",
      provider: "mock",
    },
    {
      scenario_id: "assembly-planar-001",
      condition: "with-skill",
      score: 99,
      execution_mode: "mock-agent",
      provider: "mock",
    },
    {
      scenario_id: "assembly-planar-001",
      condition: "no-skill",
      score: 40,
      execution_mode: "real-agent",
      provider: "openai-compatible",
    },
    {
      scenario_id: "assembly-planar-001",
      condition: "with-skill",
      score: 70,
      execution_mode: "real-agent",
      provider: "openai-compatible",
    },
  ];
  const all = summarizeRuns(mixed);
  const layerB = summarizeLayerB(mixed);
  assert(all[0].delta === 19.5 || all[0].skill_n === 2, JSON.stringify(all));
  assert(layerB.length === 1, JSON.stringify(layerB));
  assert(layerB[0].baseline_mean === 40, JSON.stringify(layerB[0]));
  assert(layerB[0].skill_mean === 70, JSON.stringify(layerB[0]));
  assert(layerB[0].delta === 30, JSON.stringify(layerB[0]));
  assert(!isLayerBEvidence(mixed[0]), "mock flagged as layer B");
  assert(isLayerBEvidence(mixed[2]), "real not flagged");
});

const failed = out.filter((t) => !t.passed).length;
console.log(`\n${out.length - failed}/${out.length} agent integrity tests passed`);
if (failed) process.exit(1);
