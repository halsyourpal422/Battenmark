/**
 * Phase 7C.2 — Bounded evaluation-only agent loop.
 * Uses EvalProvider + Battenmark public operations only.
 */
import { loadScenario, loadSkillText, scoreTrace, skillContextCost } from "./score.mjs";
import { resolveRunContext, EvalProviderError } from "./providers/provider.mjs";
import { loadProviderConfig, hasProviderCredential } from "./providers/provider-config.mjs";
import { executePublicTool, loadPublicCatalog, privilegedRejected } from "./public-executor.mjs";

export const DEFAULT_TURN_BUDGET = 12;

export async function buildConditionEnvelope(scenario, condition) {
  const skillText = condition === "with-skill" ? await loadSkillText(scenario.skill) : "";
  const system = [
    "You are operating Battenmark through its public CAD tools only.",
    "Do not use private FreeCAD Python, worker commands, or schema bypasses.",
    "Call tools to complete the task. Inspect and export when required.",
  ].join(" ");
  const userParts = [`Task:\n${scenario.task}`];
  if (skillText) userParts.push(`Battenmark skill (${scenario.skill}):\n${skillText}`);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n\n") },
  ];
  return {
    condition,
    skillId: scenario.skill,
    skillInjected: Boolean(skillText),
    skillText,
    messages,
    contextCost: skillText ? skillContextCost(skillText) : { chars: 0, words: 0, approx_tokens: 0 },
  };
}

export function envelopesDifferOnlyBySkill(noSkill, withSkill) {
  if (noSkill.messages[0].content !== withSkill.messages[0].content) return false;
  if (noSkill.skillInjected || !withSkill.skillInjected) return false;
  const a = noSkill.messages[1].content;
  const b = withSkill.messages[1].content;
  if (!b.startsWith(a)) return false;
  return b.slice(a.length).includes(`Battenmark skill (${withSkill.skillId}):`);
}

function catalogTools(catalog) {
  return catalog.entries.map((e) => ({
    name: e.name,
    description: e.description || e.name,
    parameters: e.parameters || { type: "object", properties: {} },
  }));
}

export async function runAgentLoop({
  scenarioId,
  condition,
  provider: providerOverride,
  config: configOverrides = {},
  turnBudget = DEFAULT_TURN_BUDGET,
  executor = executePublicTool,
  runId = 1,
}) {
  const scenario = typeof scenarioId === "string" ? await loadScenario(scenarioId) : scenarioId;
  const envelope = await buildConditionEnvelope(scenario, condition);
  const cfg = loadProviderConfig(configOverrides);
  let provider = providerOverride;
  if (!provider) {
    if (cfg.provider !== "mock" && !hasProviderCredential(cfg)) {
      throw new EvalProviderError("CREDENTIAL_MISSING", `Missing credential in ${cfg.apiKeyEnv} for provider ${cfg.provider}`);
    }
    provider = resolveRunContext(configOverrides).provider;
  }
  const catalog = await loadPublicCatalog();
  const tools = catalogTools(catalog);
  const messages = envelope.messages.map((m) => ({ ...m }));
  const tool_calls = [];
  const errors = [];
  const notes = [];
  const artifact_ids = [];
  const final_state = {};
  let termination = "completed";
  let lastResult = null;
  let turns = 0;

  for (let turn = 1; turn <= turnBudget; turn++) {
    turns = turn;
    lastResult = await provider.run({
      model: cfg.model || "mock-model",
      messages,
      tools,
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxOutputTokens,
      timeoutMs: cfg.timeoutMs,
    });
    const calls = lastResult.toolCalls || [];
    if (!calls.length) {
      termination = lastResult.output ? "model_stop" : "empty_response";
      break;
    }
    const observations = [];
    for (const call of calls) {
      if (privilegedRejected(call.name, catalog)) {
        tool_calls.push({ name: call.name, args: call.args || {}, ok: false, error: "PRIVILEGED_TOOL" });
        errors.push({ code: "PRIVILEGED_TOOL", message: call.name });
        notes.push("bypass schema");
        observations.push(`error PRIVILEGED_TOOL ${call.name}`);
        continue;
      }
      const executed = await executor(call.name, call.args || {}, { catalog, state: final_state });
      tool_calls.push({
        name: call.name,
        args: call.args || {},
        ok: executed.ok !== false,
        error: executed.error || undefined,
      });
      if (executed.ok === false) errors.push({ code: executed.code || "TOOL_ERROR", message: executed.error || call.name });
      if (executed.state) Object.assign(final_state, executed.state);
      if (executed.artifact_id) artifact_ids.push(executed.artifact_id);
      observations.push(executed.observation || JSON.stringify({ ok: executed.ok !== false, name: call.name }));
    }
    messages.push({ role: "assistant", content: lastResult.output || "" });
    messages.push({ role: "user", content: `Tool results:\n${observations.join("\n")}` });
    if (turn === turnBudget) termination = "budget_exhausted";
  }

  const completion_status = termination === "completed" || termination === "model_stop" ? "complete" : "incomplete";
  const trace = { tool_calls, final_state, artifact_ids, notes, errors, completion_status };
  const scored = scoreTrace(scenario, trace);
  return {
    schema: "battenmark.eval.agent.v1",
    scenario_id: scenario.id,
    skill: scenario.skill,
    condition,
    provider: provider.id,
    model: cfg.model || "mock-model",
    temperature: cfg.temperature,
    run: runId,
    turns,
    tool_call_count: tool_calls.length,
    score: scored.score,
    verdict: scored.verdict,
    hard_failures: scored.hard_failures,
    metrics: scored.metrics,
    checks: scored.checks,
    termination,
    context_cost: envelope.contextCost,
    remaining_dof: final_state.remaining_dof,
    usage: lastResult?.usage,
  };
}

export function assemblyMockScript() {
  return [
    { toolCalls: [{ name: "project_create", args: { name: "eval-assembly" } }] },
    { toolCalls: [{ name: "create_box", args: { length_mm: 60, width_mm: 40, height_mm: 10, name: "Anchor" } }] },
    { toolCalls: [{ name: "create_box", args: { length_mm: 30, width_mm: 30, height_mm: 12, name: "Mover" } }] },
    { toolCalls: [{ name: "create_assembly", args: { name: "asm" } }] },
    { toolCalls: [{ name: "define_component", args: { assembly_id: "asm", component_id: "anchor", name: "anchor" } }, { name: "define_component", args: { assembly_id: "asm", component_id: "mover", name: "mover" } }] },
    { toolCalls: [{ name: "create_instance", args: { assembly_id: "asm", component_id: "anchor", instance_id: "a1" } }, { name: "create_instance", args: { assembly_id: "asm", component_id: "mover", instance_id: "b1" } }] },
    { toolCalls: [{ name: "fix_instance", args: { assembly_id: "asm", instance_id: "a1" } }] },
    { toolCalls: [{ name: "mate_faces", args: { assembly_id: "asm", a_instance: "a1", a_face: "top_face", b_instance: "b1", b_face: "bottom_face" } }] },
    { toolCalls: [{ name: "inspect_assembly", args: { assembly_id: "asm" } }] },
    { toolCalls: [{ name: "check_interference", args: { assembly_id: "asm" } }] },
    { toolCalls: [{ name: "export_assembly", args: { assembly_id: "asm", format: "step" } }] },
    { output: "done", toolCalls: [] },
  ];
}
