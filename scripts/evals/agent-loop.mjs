/**
 * Phase 7C.2 — Bounded evaluation-only agent loop.
 * Uses EvalProvider + Battenmark public operations only.
 */
import { loadScenario, loadSkillText, scoreTrace, skillContextCost } from "./score.mjs";
import { resolveRunContext, EvalProviderError } from "./providers/provider.mjs";
import { loadProviderConfig, hasProviderCredential } from "./providers/provider-config.mjs";
import {
  createEvaluationFixture,
  executePublicTool,
  loadPublicCatalog,
  privilegedRejected,
} from "./public-executor.mjs";
import {
  appendTraceEvent,
  completeTrace,
  createModelToolResult,
  createTraceDocument,
  formatModelToolResults,
  sanitizeMessages,
  sanitizeToolResult,
  sanitizeTraceValue,
  sanitizeUsage,
  writePartialTrace,
} from "./trace.mjs";

export const DEFAULT_TURN_BUDGET = 12;
export const MAX_ZERO_TOOL_CONTINUATIONS = 1;

const PENDING_ACTION_PATTERN = new RegExp(
  [
    "\\b(?:i|we)(?:'ll| will| am going to| are going to)\\b",
    "\\b(?:let us|let's)\\s+(?:now\\s+)?(?:proceed|continue|execute|perform|run|invoke|call|apply|complete|finish)\\b",
    "\\b(?:next|following)\\s+(?:action|operation|step|tool|task)\\b",
    "\\b(?:now|next|then|after that)\\b[^.!?]{0,120}\\b(?:proceed|continue|execute|perform|invoke|call|apply|complete|finish)\\b",
    "\\bplease\\s+(?:provide|return|show|send)\\b[^.!?]{0,120}\\b(?:result|output|response|information|data)\\b",
  ].join("|"),
  "i",
);

export function classifyZeroToolResponse({ output, hadToolActivity, continuationAttempts }) {
  const text = String(output ?? "").trim();
  if (!text) return { classification: "empty", action: "stop", termination: "empty_response" };
  const pending = hadToolActivity && PENDING_ACTION_PATTERN.test(text);
  if (!pending)
    return { classification: "credible_final", action: "stop", termination: "model_stop" };
  if (continuationAttempts >= MAX_ZERO_TOOL_CONTINUATIONS) {
    return {
      classification: "explicit_continuation",
      action: "stop",
      termination: "continuation_exhausted",
    };
  }
  return { classification: "explicit_continuation", action: "continue", termination: null };
}

export async function buildConditionEnvelope(scenario, condition) {
  const skillText = condition === "with-skill" ? await loadSkillText(scenario.skill) : "";
  const system = [
    "You are operating Battenmark through its public CAD tools only.",
    "Do not use private FreeCAD Python, worker commands, or schema bypasses.",
    "Call tools to complete the task. Inspect and export when required.",
    "Tool results are supplied in subsequent messages as sanitized structured data; inspect those results directly instead of asking the user to provide them.",
    "Continue invoking tools until the task is actually complete; do not announce a future action and then stop before invoking its required tool.",
    "Stop only when no further required tool action remains.",
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
  traceOptions,
}) {
  const scenario = typeof scenarioId === "string" ? await loadScenario(scenarioId) : scenarioId;
  const envelope = await buildConditionEnvelope(scenario, condition);
  const cfg = loadProviderConfig(configOverrides);
  let provider = providerOverride;
  if (!provider) {
    if (cfg.provider !== "mock" && !hasProviderCredential(cfg)) {
      throw new EvalProviderError(
        "CREDENTIAL_MISSING",
        `Missing credential in ${cfg.apiKeyEnv} for provider ${cfg.provider}`,
      );
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
  let toolOrder = 0;
  let zeroToolContinuations = 0;
  const forensicTrace = traceOptions
    ? createTraceDocument({
        ...traceOptions,
        scenarioId: scenario.id,
        condition,
        run: runId,
        provider: provider.id,
        model: cfg.model || "mock-model",
      })
    : null;
  const persistPartial = async () => {
    if (forensicTrace) await writePartialTrace(traceOptions.filePath, forensicTrace);
  };
  const record = (event) => {
    if (forensicTrace) appendTraceEvent(forensicTrace, event);
  };

  await persistPartial();

  const fixture = createEvaluationFixture(scenario);
  const injected = await fixture.inject();
  if (injected) {
    toolOrder += 1;
    record({
      kind: "tool_call",
      source: "fixture",
      turn: 0,
      order: toolOrder,
      tool_call_id: injected.call_id,
      name: injected.name,
      args: injected.args,
    });
    record({
      kind: "tool_result",
      source: "fixture",
      turn: 0,
      order: toolOrder,
      tool_call_id: injected.call_id,
      name: injected.name,
      result: sanitizeToolResult(injected.result),
    });
    tool_calls.push({
      id: injected.call_id,
      name: injected.name,
      args: injected.args,
      ok: false,
      code: injected.result.code,
      error: injected.result.error,
      details: injected.result.details,
      order: toolOrder,
      source: "fixture",
    });
    errors.push({ code: injected.result.code, message: injected.result.error });
    messages.push({
      role: "user",
      content: formatModelToolResults([
        createModelToolResult({
          operation: injected.name,
          toolCallId: injected.call_id,
          result: injected.result,
        }),
      ]),
    });
    await persistPartial();
  }

  for (let turn = 1; turn <= turnBudget; turn++) {
    turns = turn;
    record({
      kind: "model_request",
      turn,
      messages: sanitizeMessages(messages),
      tool_catalog_hash: traceOptions?.toolCatalogHash,
      tool_names: tools.map((tool) => tool.name),
    });
    await persistPartial();
    lastResult = await provider.run({
      model: cfg.model || "mock-model",
      messages,
      tools,
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxOutputTokens,
      timeoutMs: cfg.timeoutMs,
    });
    record({
      kind: "assistant_response",
      turn,
      output: lastResult.output || "",
      finish_reason: lastResult.finishReason,
      usage: sanitizeUsage(lastResult.usage),
    });
    const calls = lastResult.toolCalls || [];
    if (!calls.length) {
      const decision = classifyZeroToolResponse({
        output: lastResult.output,
        hadToolActivity: tool_calls.length > 0,
        continuationAttempts: zeroToolContinuations,
      });
      if (decision.action === "continue" && turn === turnBudget) {
        record({
          kind: "continuation_decision",
          turn,
          reason: "turn_budget_exhausted",
          classification: decision.classification,
          action: "stop",
          attempt: zeroToolContinuations + 1,
          previous_finish_reason: lastResult.finishReason,
        });
        termination = "budget_exhausted";
        break;
      }
      record({
        kind: "continuation_decision",
        turn,
        reason: decision.action === "continue" ? "explicit_pending_action" : decision.termination,
        classification: decision.classification,
        action: decision.action,
        attempt:
          decision.classification === "explicit_continuation" ? zeroToolContinuations + 1 : 0,
        previous_finish_reason: lastResult.finishReason,
      });
      if (decision.action === "continue") {
        zeroToolContinuations += 1;
        messages.push({ role: "assistant", content: lastResult.output || "" });
        messages.push({
          role: "user",
          content:
            "Your response indicates that required tool work remains. Invoke the next public tool now. Do not repeat the plan or ask the user for tool results already supplied above.",
        });
        await persistPartial();
        continue;
      }
      termination = decision.termination;
      break;
    }
    const modelToolResults = [];
    for (let callIndex = 0; callIndex < calls.length; callIndex++) {
      const call = calls[callIndex];
      toolOrder += 1;
      const callId =
        call.id || `${traceOptions?.matrixKey || scenario.id}:turn:${turn}:call:${callIndex + 1}`;
      record({
        kind: "tool_call",
        source: "model",
        turn,
        order: toolOrder,
        tool_call_id: callId,
        name: call.name,
        args: sanitizeTraceValue(call.args || {}),
      });
      if (privilegedRejected(call.name, catalog)) {
        const rejected = {
          ok: false,
          code: "PRIVILEGED_TOOL",
          error: `private or privileged tool ${call.name}`,
        };
        tool_calls.push({
          id: callId,
          name: call.name,
          args: call.args || {},
          ok: false,
          code: rejected.code,
          error: rejected.error,
          order: toolOrder,
          source: "model",
        });
        errors.push({ code: "PRIVILEGED_TOOL", message: call.name });
        notes.push("bypass schema");
        modelToolResults.push(
          createModelToolResult({ operation: call.name, toolCallId: callId, result: rejected }),
        );
        record({
          kind: "tool_result",
          source: "model",
          turn,
          order: toolOrder,
          tool_call_id: callId,
          name: call.name,
          result: sanitizeToolResult(rejected),
        });
        continue;
      }
      const executed = await executor(call.name, call.args || {}, { catalog, state: final_state });
      tool_calls.push({
        id: callId,
        name: call.name,
        args: call.args || {},
        ok: executed.ok !== false,
        code: executed.code || undefined,
        error: executed.error || undefined,
        details: executed.details || undefined,
        order: toolOrder,
        source: "model",
      });
      if (executed.ok === false)
        errors.push({ code: executed.code || "TOOL_ERROR", message: executed.error || call.name });
      if (executed.state) Object.assign(final_state, executed.state);
      if (executed.artifact_id) artifact_ids.push(executed.artifact_id);
      modelToolResults.push(
        createModelToolResult({ operation: call.name, toolCallId: callId, result: executed }),
      );
      record({
        kind: "tool_result",
        source: "model",
        turn,
        order: toolOrder,
        tool_call_id: callId,
        name: call.name,
        result: sanitizeToolResult(executed),
      });
    }
    messages.push({ role: "assistant", content: lastResult.output || "" });
    messages.push({ role: "user", content: formatModelToolResults(modelToolResults) });
    await persistPartial();
    if (turn === turnBudget) termination = "budget_exhausted";
  }

  const completion_status =
    termination === "completed" || termination === "model_stop" ? "complete" : "incomplete";
  const trace = { tool_calls, final_state, artifact_ids, notes, errors, completion_status };
  const scored = scoreTrace(scenario, trace);
  const traceLink = forensicTrace
    ? await completeTrace(traceOptions.filePath, traceOptions.relativePath, forensicTrace, {
        termination,
        final_state,
        score: scored.score,
        verdict: scored.verdict,
        checks: scored.checks,
        hard_failures: scored.hard_failures,
        metrics: scored.metrics,
        remaining_dof: final_state.remaining_dof,
      })
    : {};
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
    evaluation_semantics: traceOptions?.evaluationSemantics,
    ...traceLink,
  };
}

export function assemblyMockScript() {
  let projectId;
  const withProject = (args = {}) => ({ project_id: projectId, ...args });
  return [
    { toolCalls: [{ name: "project_create", args: { name: "eval-assembly" } }] },
    (request) => {
      const content = request.messages.at(-1)?.content || "";
      const payload = JSON.parse(content.slice(content.indexOf("{")));
      projectId = payload.results.find((result) => result.operation === "project_create")?.data
        ?.project_id;
      if (!projectId) throw new Error("mock assembly script did not receive project_id");
      return {
        toolCalls: [
          {
            name: "create_box",
            args: withProject({ length_mm: 60, width_mm: 40, height_mm: 10, name: "Anchor" }),
          },
        ],
      };
    },
    () => ({
      toolCalls: [
        {
          name: "create_box",
          args: withProject({ length_mm: 30, width_mm: 30, height_mm: 12, name: "Mover" }),
        },
      ],
    }),
    () => ({ toolCalls: [{ name: "create_assembly", args: withProject({ name: "asm" }) }] }),
    () => ({
      toolCalls: [
        {
          name: "define_component",
          args: withProject({ assembly_id: "asm", component_id: "anchor", name: "anchor" }),
        },
        {
          name: "define_component",
          args: withProject({ assembly_id: "asm", component_id: "mover", name: "mover" }),
        },
      ],
    }),
    () => ({
      toolCalls: [
        {
          name: "create_instance",
          args: withProject({ assembly_id: "asm", component_id: "anchor", instance_id: "a1" }),
        },
        {
          name: "create_instance",
          args: withProject({ assembly_id: "asm", component_id: "mover", instance_id: "b1" }),
        },
      ],
    }),
    () => ({
      toolCalls: [
        {
          name: "fix_instance",
          args: withProject({ assembly_id: "asm", instance_id: "a1" }),
        },
      ],
    }),
    () => ({
      toolCalls: [
        {
          name: "mate_faces",
          args: withProject({
            assembly_id: "asm",
            a_instance: "a1",
            a_face: "top_face",
            b_instance: "b1",
            b_face: "bottom_face",
          }),
        },
      ],
    }),
    () => ({
      toolCalls: [{ name: "inspect_assembly", args: withProject({ assembly_id: "asm" }) }],
    }),
    () => ({
      toolCalls: [{ name: "check_interference", args: withProject({ assembly_id: "asm" }) }],
    }),
    () => ({
      toolCalls: [
        { name: "export_assembly", args: withProject({ assembly_id: "asm", format: "step" }) },
      ],
    }),
    { output: "done", toolCalls: [] },
  ];
}
