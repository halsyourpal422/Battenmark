#!/usr/bin/env node
import { buildConditionEnvelope, envelopesDifferOnlyBySkill, runAgentLoop, assemblyMockScript } from "./agent-loop.mjs";
import { loadScenario } from "./score.mjs";
import { createMockProvider } from "./providers/mock.mjs";

async function main() {
  let failed = 0;
  const check = (id, cond, detail = "") => {
    if (!cond) failed++;
    console.log(`${cond ? "PASS" : "FAIL"} ${id}${detail ? " " + detail : ""}`);
  };

  const scenario = await loadScenario("assembly");
  const noSkill = await buildConditionEnvelope(scenario, "no-skill");
  const withSkill = await buildConditionEnvelope(scenario, "with-skill");
  check("envelope-control", envelopesDifferOnlyBySkill(noSkill, withSkill));
  check("no-skill-has-no-skill-text", noSkill.skillInjected === false && !noSkill.messages[1].content.includes("Battenmark skill"));
  check("with-skill-injects-shipping-md", withSkill.skillInjected && withSkill.skillText.includes("assembly"));

  const noResult = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider: createMockProvider({ script: assemblyMockScript() }),
    config: { provider: "mock", model: "mock-model" },
    runId: 1,
  });
  const yesResult = await runAgentLoop({
    scenarioId: "assembly",
    condition: "with-skill",
    provider: createMockProvider({ script: assemblyMockScript() }),
    config: { provider: "mock", model: "mock-model" },
    runId: 1,
  });
  check("mock-loop-public-ops", noResult.tool_call_count > 0);
  check("assembly-dof-3", noResult.remaining_dof === 3, `dof=${noResult.remaining_dof}`);
  check("same-model-both-conditions", noResult.model === yesResult.model && noResult.provider === yesResult.provider);
  check("export-present", Boolean(noResult.checks.artifact_exported));
  check("no-secrets-in-result", !JSON.stringify(noResult).includes("sk-") && !JSON.stringify(yesResult).includes("OPENAI_API_KEY="));

  const priv = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider: createMockProvider({
      script: [{ toolCalls: [{ name: "eval_python", args: { code: "print(1)" } }] }, { toolCalls: [] }],
    }),
    config: { provider: "mock", model: "mock-model" },
  });
  check("rejects-private-tools", priv.hard_failures.includes("schema_bypass") || priv.checks.public_ops_only === false);

  console.log(`\n${failed ? "FAIL" : "PASS"} mock agent A/B tests`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
