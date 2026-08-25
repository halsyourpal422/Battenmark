#!/usr/bin/env node
/**
 * Phase 7C — scorer unit tests + mutation proof.
 */
import { loadScenario, scoreTrace, listScenarios, loadSkillText, skillContextCost, interpretDelta } from "./score.mjs";
import { ORACLES } from "./oracle.mjs";

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name.padEnd(42)} ${detail}`);
}

async function main() {
  for (const id of await listScenarios()) {
    const scenario = await loadScenario(id);
    const oracle = ORACLES[id];
    if (!oracle) continue;
    const trace = oracle(scenario);
    const scored = scoreTrace(scenario, trace);
    check(
      `reference-${id}`,
      scored.verdict === "PASS" && scored.score >= 80,
      `score=${scored.score} verdict=${scored.verdict} hard=${scored.hard_failures.join(",") || "-"}`,
    );
  }

  {
    const scenario = await loadScenario("basic-part");
    const trace = ORACLES["basic-part"](scenario);
    trace.tool_calls = trace.tool_calls.filter((c) => !["validate", "render_preview", "export_step"].includes(c.name));
    trace.final_state.validated = false;
    trace.final_state.preview_rendered = false;
    trace.final_state.artifact_exported = false;
    trace.artifact_ids = [];
    trace.completion_status = "complete";
    const scored = scoreTrace(scenario, trace);
    check(
      "missing-verification-penalized",
      scored.score < 80 || scored.verdict !== "PASS" || scored.hard_failures.includes("missing_export_claim"),
      `score=${scored.score} ${scored.verdict}`,
    );
  }

  {
    const scenario = await loadScenario("assembly");
    const trace = ORACLES.assembly(scenario);
    trace.final_state.remaining_dof = 6;
    const scored = scoreTrace(scenario, trace);
    check(
      "wrong-dof-hard-fail",
      scored.hard_failures.includes("wrong_dof") && scored.verdict === "FAIL",
      `hard=${scored.hard_failures.join(",")} score=${scored.score}`,
    );
  }

  {
    const scenario = await loadScenario("backend-diagnostics");
    const trace = ORACLES["backend-diagnostics"](scenario);
    trace.notes.push("called private freecad python directly");
    const scored = scoreTrace(scenario, trace);
    check(
      "private-bypass-hard-fail",
      scored.verdict === "FAIL" && scored.hard_failures.some((h) => /private|schema/.test(h)),
      `hard=${scored.hard_failures.join(",")}`,
    );
  }

  {
    const scenario = await loadScenario("basic-part");
    const trace = ORACLES["basic-part"](scenario);
    trace.artifact_ids = [];
    trace.final_state.artifact_exported = false;
    trace.tool_calls = trace.tool_calls.filter((c) => c.name !== "export_step");
    trace.completion_status = "complete";
    const scored = scoreTrace(scenario, trace);
    check(
      "missing-export-hard-fail",
      scored.hard_failures.includes("missing_export_claim") || scored.checks.artifact_exported === false,
      `hard=${scored.hard_failures.join(",")} artifact=${scored.checks.artifact_exported}`,
    );
  }

  check("band-clear", interpretDelta(20) === "CLEAR BENEFIT");
  check("band-mixed", interpretDelta(8) === "MIXED");
  check("band-none", interpretDelta(0) === "NO MEASURABLE BENEFIT");
  check("band-regression", interpretDelta(-10) === "REGRESSION");

  {
    const text = await loadSkillText("assembly");
    const cost = skillContextCost(text);
    check("context-cost-assembly", cost.words > 50 && cost.approx_tokens > 50, JSON.stringify(cost));
  }

  {
    const scenario = await loadScenario("assembly");
    const trace = ORACLES.assembly(scenario);
    const a = scoreTrace(scenario, trace);
    const b = scoreTrace(scenario, trace);
    check("determinism", a.score === b.score && a.verdict === b.verdict, `${a.score}/${b.score}`);
  }

  {
    const scenario = await loadScenario("assembly");
    const perfect = scoreTrace(scenario, ORACLES.assembly(scenario));
    check("mutation-baseline-pass", perfect.verdict === "PASS", `score=${perfect.score}`);
    const broken = ORACLES.assembly(scenario);
    broken.final_state.remaining_dof = 0;
    const after = scoreTrace(scenario, broken);
    check(
      "mutation-wrong-dof-drops",
      after.score < perfect.score && after.verdict === "FAIL",
      `${perfect.score}→${after.score}`,
    );
  }

  if (failures) {
    console.error(`\n${failures} scorer test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll skill evaluation scorer tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
