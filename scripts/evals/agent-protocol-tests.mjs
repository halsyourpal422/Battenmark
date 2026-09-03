#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentLoop } from "./agent-loop.mjs";
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
      const scripted = turns.shift() || {};
      const next = typeof scripted === "function" ? scripted(request, calls) : scripted;
      return {
        output: next.output ?? "",
        toolCalls: next.toolCalls ?? [],
        finishReason: next.finishReason ?? (next.toolCalls?.length ? "tool_calls" : "stop"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  };
}

function returnedProjectId(request) {
  const content = request.messages.at(-1)?.content || "";
  const payload = JSON.parse(content.slice(content.indexOf("{")));
  const projectId = payload.results.find((result) => result.operation === "project_create")?.data
    ?.project_id;
  assert(projectId, content);
  return projectId;
}

await test("P1-enclosure-explicit-intention-continues-once", async () => {
  let projectId;
  const provider = capturingProvider([
    { toolCalls: [{ name: "project_create", args: { name: "eval-enclosure" } }] },
    (request) => {
      projectId = returnedProjectId(request);
      return {
        toolCalls: [
          {
            name: "add_rectangle",
            args: {
              project_id: projectId,
              sketch_id: "usb-opening",
              x_mm: 0,
              y_mm: 3,
              width_mm: 12,
              height_mm: 6,
            },
          },
        ],
      };
    },
    {
      output:
        "The rectangle is ready. Next I will pocket it to create the opening. Let's execute this step.",
      finishReason: "stop",
      toolCalls: [],
    },
    () => ({
      toolCalls: [
        {
          name: "pocket",
          args: { project_id: projectId, sketch_id: "usb-opening", depth_mm: 2 },
        },
        { name: "validate", args: { project_id: projectId } },
        {
          name: "render_preview",
          args: { project_id: projectId, view: "isometric" },
        },
        { name: "export_step", args: { project_id: projectId } },
      ],
    }),
    { output: "All requested work is complete and the artifact is available.", toolCalls: [] },
  ]);
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
  let projectId;
  const provider = capturingProvider(
    [
      { toolCalls: [{ name: "project_create", args: { name: "protocol-assembly" } }] },
      (request) => {
        projectId = returnedProjectId(request);
        return {
          toolCalls: [
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Anchor",
                length_mm: 60,
                width_mm: 40,
                height_mm: 10,
              },
            },
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Mover",
                length_mm: 30,
                width_mm: 30,
                height_mm: 12,
              },
            },
            {
              id: "assembly-1",
              name: "create_assembly",
              args: { project_id: projectId, assembly_id: "assembly" },
            },
            {
              name: "define_component",
              args: {
                project_id: projectId,
                assembly_id: "assembly",
                component_id: "anchor",
              },
            },
            {
              name: "define_component",
              args: {
                project_id: projectId,
                assembly_id: "assembly",
                component_id: "mover",
              },
            },
            {
              name: "create_instance",
              args: {
                project_id: projectId,
                assembly_id: "assembly",
                component_id: "anchor",
                instance_id: "a1",
              },
            },
            {
              name: "create_instance",
              args: {
                project_id: projectId,
                assembly_id: "assembly",
                component_id: "mover",
                instance_id: "b1",
              },
            },
            {
              name: "fix_instance",
              args: { project_id: projectId, assembly_id: "assembly", instance_id: "a1" },
            },
            {
              name: "mate_faces",
              args: {
                project_id: projectId,
                assembly_id: "assembly",
                a_instance: "a1",
                a_face: "top_face",
                b_instance: "b1",
                b_face: "bottom_face",
              },
            },
          ],
        };
      },
      () => ({
        toolCalls: [
          {
            id: "inspect-1",
            name: "inspect_assembly",
            args: { project_id: projectId, assembly_id: "assembly" },
          },
          {
            id: "interference-1",
            name: "check_interference",
            args: { project_id: projectId, assembly_id: "assembly" },
          },
        ],
      }),
      () => ({
        toolCalls: [
          {
            name: "export_assembly",
            args: { project_id: projectId, assembly_id: "assembly", format: "step" },
          },
        ],
      }),
      { output: "Assembly inspection and export are complete." },
    ],
    (request, call) => {
      if (call !== 4) return;
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
  let projectId;
  let bodyIds = [];
  const provider = capturingProvider(
    [
      { toolCalls: [{ name: "project_create", args: { name: "protocol-boolean" } }] },
      (request) => {
        projectId = returnedProjectId(request);
        return {
          toolCalls: [
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Outer",
                length_mm: 10,
                width_mm: 10,
                height_mm: 10,
              },
            },
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Cavity",
                length_mm: 8,
                width_mm: 8,
                height_mm: 8,
              },
            },
          ],
        };
      },
      (request) => {
        const content = request.messages.at(-1)?.content || "";
        const payload = JSON.parse(content.slice(content.indexOf("{")));
        bodyIds = payload.results.map((result) => result.data?.body_id);
        assert(bodyIds.length === 2 && bodyIds.every(Boolean), content);
        return {
          toolCalls: [
            {
              name: "boolean_cut",
              args: {
                project_id: projectId,
                target_body_id: bodyIds[0],
                tool_body_id: bodyIds[1],
              },
            },
          ],
        };
      },
      { output: "The requested boolean operation is complete." },
    ],
    (request, call) => {
      if (call !== 4) return;
      const content = request.messages.at(-1)?.content || "";
      assert(content.includes('"operation": "boolean_cut"'), content);
      assert(content.includes('"feature_applied": true'), content);
      assert(content.includes(`"target_body_id": "${bodyIds[0]}"`), content);
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
      trace.evaluation_semantics === "battenmark.phase7c.identity-integrity.v4",
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
