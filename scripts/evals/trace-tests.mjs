#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentLoop } from "./agent-loop.mjs";
import {
  buildMatrix,
  createExperimentDefinition,
  readCheckpoint,
  runCheckpointedMatrix,
} from "./checkpoint.mjs";
import { createMockProvider } from "./providers/mock.mjs";

let traceApi = {};
let traceImportError;
try {
  traceApi = await import("./trace.mjs");
} catch (error) {
  traceImportError = error;
}

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
function requireTraceApi(...names) {
  if (traceImportError)
    throw new Error(
      `trace module unavailable: ${traceImportError.code || traceImportError.message}`,
    );
  for (const name of names) assert(traceApi[name] !== undefined, `missing trace API ${name}`);
}

async function inTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "battenmark-trace-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function traceOptions(dir, overrides = {}) {
  requireTraceApi("TRACE_SCHEMA_VERSION", "EVALUATION_SEMANTICS_VERSION");
  return {
    filePath: join(dir, "experiment-a", "assembly__no-skill__1.json"),
    relativePath: "experiment-a/assembly__no-skill__1.json",
    experimentId: "experiment-a",
    battenmarkSha: "sha-a",
    matrixKey: "assembly|no-skill|1",
    executionMode: "real-agent",
    evaluationSemantics: traceApi.EVALUATION_SEMANTICS_VERSION,
    traceSchemaVersion: traceApi.TRACE_SCHEMA_VERSION,
    toolCatalogHash: "tools-a",
    ...overrides,
  };
}

function scriptedProvider(script, providerMetadata = {}) {
  const turns = [...script];
  return {
    id: "mock",
    async run() {
      const next = turns.shift();
      if (next?.throw) throw next.throw;
      return {
        output: next?.output ?? "",
        toolCalls: next?.toolCalls ?? [],
        usage: next?.usage ?? { promptTokens: 10, completionTokens: 2 },
        finishReason: next?.finishReason ?? (next?.toolCalls?.length ? "tool_calls" : "stop"),
        providerMetadata,
      };
    },
  };
}

async function tracedAssembly(dir, condition = "no-skill", provider) {
  const options = traceOptions(dir, {
    matrixKey: `assembly|${condition}|1`,
    relativePath: `experiment-a/assembly__${condition}__1.json`,
    filePath: join(dir, "experiment-a", `assembly__${condition}__1.json`),
  });
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition,
    provider,
    config: { provider: "mock", model: "mock-model" },
    runId: 1,
    traceOptions: options,
  });
  return { row, trace: JSON.parse(await readFile(options.filePath, "utf8")), options };
}

await test("T1-exact-ordered-tool-calls", () =>
  inTemp(async (dir) => {
    const provider = scriptedProvider([
      { toolCalls: [{ id: "a", name: "kernel_status", args: {} }] },
      { toolCalls: [{ id: "b", name: "inspect_backend_capabilities", args: {} }] },
      { toolCalls: [{ id: "c", name: "project_create", args: { name: "ordered" } }] },
      { output: "done", toolCalls: [] },
    ]);
    const { trace } = await tracedAssembly(dir, "no-skill", provider);
    const names = trace.events
      .filter((event) => event.kind === "tool_call")
      .map((event) => event.name);
    assert(
      JSON.stringify(names) ===
        JSON.stringify(["kernel_status", "inspect_backend_capabilities", "project_create"]),
      JSON.stringify(names),
    );
  }));

await test("T2-tool-arguments-retained", () =>
  inTemp(async (dir) => {
    const args = { name: "safe-project", slug: "safe-slug" };
    const { trace } = await tracedAssembly(
      dir,
      "no-skill",
      scriptedProvider([
        { toolCalls: [{ id: "arg-1", name: "project_create", args }] },
        { output: "done" },
      ]),
    );
    const call = trace.events.find((event) => event.kind === "tool_call");
    assert(JSON.stringify(call.args) === JSON.stringify(args), JSON.stringify(call));
  }));

await test("T3-tool-results-retained", () =>
  inTemp(async (dir) => {
    const { trace } = await tracedAssembly(
      dir,
      "no-skill",
      scriptedProvider([
        { toolCalls: [{ id: "result-1", name: "project_create", args: { name: "result" } }] },
        { output: "done" },
      ]),
    );
    const result = trace.events.find((event) => event.kind === "tool_result");
    assert(
      result?.result?.ok === true && result.result.state.project_id === "result",
      JSON.stringify(result),
    );
  }));

await test("T4-structured-errors-retained", () =>
  inTemp(async (dir) => {
    const executor = async () => ({
      ok: false,
      code: "GEOMETRY_REFERENCE_LOST",
      error: "Reference was lost",
      details: { reference: "gref_missing", suggestion: "Use top_face" },
      observation: "safe failure",
    });
    const options = traceOptions(dir);
    await runAgentLoop({
      scenarioId: "assembly",
      condition: "no-skill",
      provider: scriptedProvider([
        {
          toolCalls: [
            { id: "err-1", name: "query_geometry", args: { selector: { gref: "gref_missing" } } },
          ],
        },
        { output: "stop" },
      ]),
      config: { provider: "mock", model: "mock-model" },
      executor,
      traceOptions: options,
    });
    const trace = JSON.parse(await readFile(options.filePath, "utf8"));
    const result = trace.events.find((event) => event.kind === "tool_result");
    assert(result.result.code === "GEOMETRY_REFERENCE_LOST", JSON.stringify(result));
    assert(result.result.message === "Reference was lost", JSON.stringify(result));
    assert(result.result.details.reference === "gref_missing", JSON.stringify(result));
  }));

await test("T5-model-messages-retained", () =>
  inTemp(async (dir) => {
    const noSkill = await tracedAssembly(dir, "no-skill", createMockProvider());
    const withSkill = await tracedAssembly(dir, "with-skill", createMockProvider());
    const noMessages = noSkill.trace.events.find(
      (event) => event.kind === "model_request",
    ).messages;
    const yesMessages = withSkill.trace.events.find(
      (event) => event.kind === "model_request",
    ).messages;
    assert(
      !JSON.stringify(noMessages).includes("Battenmark skill (assembly)"),
      "skill leaked into control",
    );
    assert(
      JSON.stringify(yesMessages).includes("Battenmark skill (assembly)"),
      "skill injection missing",
    );
  }));

await test("T6-assistant-output-retained", () =>
  inTemp(async (dir) => {
    const { trace } = await tracedAssembly(
      dir,
      "no-skill",
      scriptedProvider([{ output: "inspectable assistant output" }]),
    );
    assert(
      trace.events.some(
        (event) =>
          event.kind === "assistant_response" && event.output === "inspectable assistant output",
      ),
      "output missing",
    );
  }));

await test("T7-termination-retained", () =>
  inTemp(async (dir) => {
    const stop = await tracedAssembly(dir, "no-skill", scriptedProvider([{ output: "done" }]));
    assert(stop.trace.termination === "model_stop", stop.trace.termination);
    const empty = await tracedAssembly(dir, "with-skill", scriptedProvider([{ output: "" }]));
    assert(empty.trace.termination === "empty_response", empty.trace.termination);
    const budgetOptions = traceOptions(dir, {
      matrixKey: "assembly|no-skill|2",
      relativePath: "experiment-a/assembly__no-skill__2.json",
      filePath: join(dir, "experiment-a", "assembly__no-skill__2.json"),
    });
    await runAgentLoop({
      scenarioId: "assembly",
      condition: "no-skill",
      provider: scriptedProvider([{ toolCalls: [{ name: "kernel_status", args: {} }] }]),
      config: { provider: "mock", model: "mock-model" },
      turnBudget: 1,
      traceOptions: budgetOptions,
    });
    const budget = JSON.parse(await readFile(budgetOptions.filePath, "utf8"));
    assert(budget.termination === "budget_exhausted", budget.termination);
  }));

await test("T8-usage-retained", () =>
  inTemp(async (dir) => {
    const { trace } = await tracedAssembly(
      dir,
      "no-skill",
      scriptedProvider([{ output: "done", usage: { promptTokens: 123, completionTokens: 45 } }]),
    );
    const response = trace.events.find((event) => event.kind === "assistant_response");
    assert(
      response.usage.promptTokens === 123 && response.usage.completionTokens === 45,
      JSON.stringify(response),
    );
  }));

await test("T9-scorer-evidence-retained", () =>
  inTemp(async (dir) => {
    const { row, trace } = await tracedAssembly(dir, "no-skill", createMockProvider());
    assert(trace.final.score === row.score, JSON.stringify(trace.final));
    assert(
      JSON.stringify(trace.final.checks) === JSON.stringify(row.checks),
      "checks disconnected",
    );
  }));

await test("T10-T11-secret-and-authorization-excluded", () =>
  inTemp(async (dir) => {
    const secret = "sk-trace-secret-must-not-leak";
    const bearer = "Bearer trace-authorization-must-not-leak";
    const provider = scriptedProvider(
      [
        { toolCalls: [{ name: "project_create", args: { name: "safe", Authorization: bearer } }] },
        { output: "done" },
      ],
      { apiKey: secret, headers: { Authorization: bearer } },
    );
    const { trace, options } = await tracedAssembly(dir, "no-skill", provider);
    const serialized = await readFile(options.filePath, "utf8");
    assert(!serialized.includes(secret), "provider secret persisted");
    assert(!serialized.includes(bearer), "Authorization persisted");
    assert(!serialized.includes("Authorization"), "Authorization key persisted");
    assert(trace.status === "complete", trace.status);
  }));

await test("T12-partial-trace-not-evidence", () =>
  inTemp(async (dir) => {
    const experiment = tracedExperiment();
    const matrix = buildMatrix(experiment);
    const tracesDir = join(dir, "traces");
    const checkpointPath = join(dir, "checkpoint.json");
    const options = traceOptions(tracesDir, {
      experimentId: experiment.experiment_id,
      relativePath: `${experiment.experiment_id}/assembly__no-skill__1.json`,
      filePath: join(tracesDir, experiment.experiment_id, "assembly__no-skill__1.json"),
      evaluationSemantics: experiment.evaluation_semantics,
      traceSchemaVersion: experiment.trace_schema_version,
    });
    try {
      await runCheckpointedMatrix({
        experiment,
        matrix,
        checkpointPath,
        tracesDir,
        resume: false,
        executeRow: async () =>
          runAgentLoop({
            scenarioId: "assembly",
            condition: "no-skill",
            provider: {
              ...scriptedProvider([{ throw: new Error("provider interrupted") }]),
              id: "openai-compatible",
            },
            config: { provider: "mock", model: "gpt-4o" },
            traceOptions: options,
          }),
      });
      throw new Error("expected interruption");
    } catch (error) {
      if (error.message !== "provider interrupted") throw error;
    }
    const trace = JSON.parse(await readFile(options.filePath, "utf8"));
    assert(trace.status === "partial", trace.status);
    assert(
      (await readCheckpoint(checkpointPath)).completed_rows.length === 0,
      "partial row entered checkpoint",
    );
  }));

function tracedExperiment() {
  requireTraceApi("TRACE_SCHEMA_VERSION", "EVALUATION_SEMANTICS_VERSION");
  return createExperimentDefinition({
    battenmark_sha: "sha-a",
    provider: "openai-compatible",
    model: "gpt-4o",
    temperature: 0,
    max_output_tokens: 4096,
    conditions: ["no-skill"],
    repetitions: 1,
    agent_turn_budget: 12,
    tool_catalog_hash: "tools-a",
    evaluation_semantics: traceApi.EVALUATION_SEMANTICS_VERSION,
    trace_schema_version: traceApi.TRACE_SCHEMA_VERSION,
    scenarios: [
      {
        key: "assembly",
        id: "assembly-planar-001",
        scenario_hash: "scenario-a",
        skill: "assembly",
        skill_hash: "skill-a",
      },
    ],
  });
}

async function oneCheckpointedRow(dir) {
  const experiment = tracedExperiment();
  const matrix = buildMatrix(experiment);
  const tracesDir = join(dir, "traces");
  const checkpointPath = join(dir, "checkpoint.json");
  const result = await runCheckpointedMatrix({
    experiment,
    matrix,
    checkpointPath,
    tracesDir,
    resume: false,
    executeRow: async (entry) => {
      const options = traceOptions(tracesDir, {
        experimentId: experiment.experiment_id,
        matrixKey: entry.matrix_key,
        relativePath: `${experiment.experiment_id}/assembly__no-skill__1.json`,
        filePath: join(tracesDir, experiment.experiment_id, "assembly__no-skill__1.json"),
        evaluationSemantics: experiment.evaluation_semantics,
        traceSchemaVersion: experiment.trace_schema_version,
      });
      const row = await runAgentLoop({
        scenarioId: "assembly",
        condition: "no-skill",
        provider: { ...createMockProvider(), id: "openai-compatible" },
        config: { provider: "mock", model: "gpt-4o" },
        runId: 1,
        traceOptions: options,
      });
      return {
        ...row,
        matrix_key: entry.matrix_key,
        execution_mode: "real-agent",
        provider: "openai-compatible",
        model: "gpt-4o",
      };
    },
  });
  return { experiment, matrix, tracesDir, checkpointPath, result };
}

await test("T13-complete-trace-checkpoint-reference", () =>
  inTemp(async (dir) => {
    const { result } = await oneCheckpointedRow(dir);
    const row = result.rows[0];
    assert(row.trace_status === "complete", JSON.stringify(row));
    assert(row.trace_schema_version === traceApi.TRACE_SCHEMA_VERSION, JSON.stringify(row));
    assert(/^[a-f0-9]{64}$/.test(row.trace_sha256), row.trace_sha256);
  }));

await test("T14-trace-tamper-detected", () =>
  inTemp(async (dir) => {
    const state = await oneCheckpointedRow(dir);
    const row = state.result.rows[0];
    const path = join(state.tracesDir, row.trace_path);
    const trace = JSON.parse(await readFile(path, "utf8"));
    trace.termination = "tampered";
    await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    let calls = 0;
    try {
      await runCheckpointedMatrix({
        experiment: state.experiment,
        matrix: state.matrix,
        checkpointPath: state.checkpointPath,
        tracesDir: state.tracesDir,
        resume: true,
        executeRow: async () => {
          calls += 1;
        },
      });
      throw new Error("expected trace hash rejection");
    } catch (error) {
      assert(error.code === "CHECKPOINT_TRACE_INVALID", `${error.code} ${error.message}`);
      assert(calls === 0, `provider called ${calls}`);
    }
  }));

await test("T15-resume-requires-valid-complete-trace", () =>
  inTemp(async (dir) => {
    const state = await oneCheckpointedRow(dir);
    const row = state.result.rows[0];
    await rm(join(state.tracesDir, row.trace_path));
    let calls = 0;
    try {
      await runCheckpointedMatrix({
        experiment: state.experiment,
        matrix: state.matrix,
        checkpointPath: state.checkpointPath,
        tracesDir: state.tracesDir,
        resume: true,
        executeRow: async () => {
          calls += 1;
        },
      });
      throw new Error("expected missing trace rejection");
    } catch (error) {
      assert(error.code === "CHECKPOINT_TRACE_INVALID", `${error.code} ${error.message}`);
      assert(calls === 0, `provider called ${calls}`);
    }
  }));

const failed = results.filter((result) => !result.passed).length;
console.log(`\n${results.length - failed}/${results.length} trace integrity tests passed`);
if (failed) process.exit(1);
