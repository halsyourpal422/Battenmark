#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentLoop } from "./agent-loop.mjs";
import { createMockProvider } from "./providers/mock.mjs";
import {
  EVALUATION_SEMANTICS_VERSION,
  TRACE_SCHEMA_VERSION,
  createModelToolResult,
  formatModelToolResults,
} from "./trace.mjs";

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(id, fn) {
  try {
    await fn();
    results.push({ id, passed: true });
    console.log(`PASS ${id}`);
  } catch (error) {
    results.push({ id, passed: false });
    console.log(`FAIL ${id} ${error instanceof Error ? error.message : error}`);
  }
}

function config() {
  return { provider: "mock", model: "mock-model" };
}

function capturingProvider(script, inspectRequest = () => {}) {
  const turns = [...script];
  let calls = 0;
  return {
    id: "mock",
    get calls() {
      return calls;
    },
    async run(request) {
      calls += 1;
      inspectRequest(request, calls);
      const next = turns.shift() || {};
      return {
        output: next.output ?? "",
        toolCalls: next.toolCalls ?? [],
        finishReason: next.finishReason ?? (next.toolCalls?.length ? "tool_calls" : "stop"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  };
}

await test("P1-enclosure-explicit-intention-continues-once", async () => {
  const provider = createMockProvider({
    script: [
      { toolCalls: [{ name: "project_create", args: { name: "eval-enclosure" } }] },
      {
        toolCalls: [
          {
            name: "add_rectangle",
            args: {
              sketch_id: "usb-opening",
              x_mm: 0,
              y_mm: 3,
              width_mm: 12,
              height_mm: 6,
            },
          },
        ],
      },
      {
        output:
          "The rectangle is ready. Next I will pocket it to create the opening. Let's execute this step.",
        finishReason: "stop",
        toolCalls: [],
      },
      {
        toolCalls: [
          { name: "pocket", args: { sketch_id: "usb-opening", depth_mm: 2 } },
          { name: "validate", args: {} },
          { name: "render_preview", args: { view: "isometric" } },
          { name: "export_step", args: {} },
        ],
      },
      { output: "All requested work is complete and the artifact is available.", toolCalls: [] },
    ],
  });
  const row = await runAgentLoop({
    scenarioId: "enclosure",
    condition: "with-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "model_stop", `termination=${row.termination}`);
  assert(row.checks.artifact_exported === true, "export did not execute after continuation");
  assert(row.turns === 5, `turns=${row.turns}`);
});

await test("P2-assembly-public-result-state-reaches-next-turn", async () => {
  let inspected = false;
  const provider = capturingProvider(
    [
      {
        toolCalls: [
          { id: "inspect-1", name: "inspect_assembly", args: { assembly_id: "assembly" } },
          { id: "interference-1", name: "check_interference", args: { assembly_id: "assembly" } },
        ],
      },
      {
        toolCalls: [{ name: "export_assembly", args: { assembly_id: "assembly", format: "step" } }],
      },
      { output: "Assembly inspection and export are complete." },
    ],
    (request, call) => {
      if (call !== 2) return;
      const content = request.messages.at(-1)?.content || "";
      assert(content.includes('"operation": "inspect_assembly"'), content);
      assert(content.includes('"remaining_dof": 3'), content);
      assert(content.includes('"operation": "check_interference"'), content);
      assert(content.includes('"interference_checked": true'), content);
      inspected = true;
    },
  );
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(inspected, "next provider turn was not inspected");
  assert(row.remaining_dof === 3, `dof=${row.remaining_dof}`);
  assert(row.checks.artifact_exported === true, "assembly was not exported");
});

await test("P3-successful-boolean-state-reaches-next-turn", async () => {
  let inspected = false;
  const provider = capturingProvider(
    [
      {
        toolCalls: [
          {
            name: "boolean_cut",
            args: { target_body_id: "outer", tool_body_id: "cavity" },
          },
        ],
      },
      { output: "The requested boolean operation is complete." },
    ],
    (request, call) => {
      if (call !== 2) return;
      const content = request.messages.at(-1)?.content || "";
      assert(content.includes('"operation": "boolean_cut"'), content);
      assert(content.includes('"feature_applied": true'), content);
      inspected = true;
    },
  );
  await runAgentLoop({
    scenarioId: "enclosure",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(inspected, "boolean result was not visible");
});

await test("P4-structured-recovery-error-reaches-model", async () => {
  let inspected = false;
  const provider = capturingProvider([{ output: "No tool action remains." }], (request, call) => {
    if (call !== 1) return;
    const content = request.messages.at(-1)?.content || "";
    assert(content.includes("GEOMETRY_REFERENCE_LOST"), content);
    assert(content.includes("gref_missing"), content);
    inspected = true;
  });
  await runAgentLoop({
    scenarioId: "backend-diagnostics",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(inspected, "fixture error was not visible on the first model turn");
});

await test("P5-repeated-intention-is-strictly-bounded", async () => {
  const provider = capturingProvider([
    { toolCalls: [{ name: "project_create", args: { name: "bounded" } }] },
    { output: "Next I will continue with the remaining operation." },
    { output: "I will now perform the next required operation." },
    { toolCalls: [{ name: "export_step", args: {} }] },
  ]);
  const row = await runAgentLoop({
    scenarioId: "enclosure",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "continuation_exhausted", `termination=${row.termination}`);
  assert(provider.calls === 3, `provider calls=${provider.calls}`);
  assert(row.tool_call_count === 1, `unexpected tool calls=${row.tool_call_count}`);
});

await test("P6-genuine-final-response-still-stops", async () => {
  const provider = capturingProvider([
    { toolCalls: [{ name: "project_create", args: { name: "final" } }] },
    { output: "All requested work is complete." },
  ]);
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "model_stop", `termination=${row.termination}`);
  assert(provider.calls === 2, `provider calls=${provider.calls}`);
});

await test("P7-empty-response-remains-distinct", async () => {
  const provider = capturingProvider([
    { toolCalls: [{ name: "project_create", args: { name: "empty" } }] },
    { output: "", toolCalls: [] },
  ]);
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "with-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "empty_response", `termination=${row.termination}`);
  assert(provider.calls === 2, `provider calls=${provider.calls}`);
});

await test("P8-model-result-envelope-redacts-and-bounds", () => {
  const secret = "sk-phase7c6-secret-value";
  const bearer = "Bearer phase7c6-authorization";
  const result = createModelToolResult({
    operation: "inspect_assembly",
    toolCallId: "secret-test",
    result: {
      ok: true,
      state: { remaining_dof: 3, enormous: "x".repeat(50_000) },
      details: {
        Authorization: bearer,
        api_key: secret,
        access_token: "opaque-access-credential",
        password: "opaque-password",
        nested: { credential: secret, safe: "retained" },
      },
      providerMetadata: { account: "forbidden" },
      observation: `unsafe ${secret} ${bearer}`,
    },
  });
  const message = formatModelToolResults([result]);
  assert(message.length <= 24_020, `message length=${message.length}`);
  assert(!message.includes(secret), "API key leaked");
  assert(!message.includes(bearer), "Authorization leaked");
  assert(
    !/api_key|Authorization|providerMetadata|credential|access_token|password/.test(message),
    message,
  );
  assert(message.includes('"remaining_dof": 3'), message);
  assert(message.includes('"safe": "retained"'), message);
  assert(message.includes("[TRUNCATED]"), "large string was not bounded");
});

await test("P9-continuation-decision-is-forensic-and-schema-compatible", async () => {
  const dir = await mkdtemp(join(tmpdir(), "battenmark-protocol-"));
  const filePath = join(dir, "trace.json");
  try {
    await runAgentLoop({
      scenarioId: "assembly",
      condition: "no-skill",
      provider: capturingProvider([
        { toolCalls: [{ name: "project_create", args: { name: "trace" } }] },
        { output: "I will now perform the next required operation." },
        { output: "All required work is complete." },
      ]),
      config: config(),
      traceOptions: {
        filePath,
        relativePath: "trace.json",
        experimentId: "phase7c6-test",
        battenmarkSha: "test-sha",
        matrixKey: "assembly|no-skill|1",
        executionMode: "mock-agent",
        evaluationSemantics: EVALUATION_SEMANTICS_VERSION,
        traceSchemaVersion: TRACE_SCHEMA_VERSION,
        toolCatalogHash: "tools-test",
      },
    });
    const trace = JSON.parse(await readFile(filePath, "utf8"));
    const decisions = trace.events.filter((event) => event.kind === "continuation_decision");
    assert(trace.schema_version === "battenmark.eval.trace.v1", trace.schema_version);
    assert(
      trace.evaluation_semantics === "battenmark.phase7c.agent-protocol.v3",
      trace.evaluation_semantics,
    );
    assert(
      decisions.some((event) => event.reason === "explicit_pending_action"),
      JSON.stringify(decisions),
    );
    assert(
      decisions.every((event) => !JSON.stringify(event).includes("sk-")),
      "secret in decision",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const failed = results.filter((result) => !result.passed).length;
console.log(`\n${results.length - failed}/${results.length} Phase 7C.6 protocol tests passed`);
if (failed) process.exit(1);
