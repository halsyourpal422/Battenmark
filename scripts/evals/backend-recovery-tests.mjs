#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentLoop } from "./agent-loop.mjs";
import { createEvaluationFixture, executePublicTool } from "./public-executor.mjs";
import { buildMatrix, createExperimentDefinition, runCheckpointedMatrix } from "./checkpoint.mjs";
import { createMockProvider } from "./providers/mock.mjs";
import { loadScenario, scoreTrace } from "./score.mjs";

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
function requireTraceApi() {
  if (traceImportError)
    throw new Error(
      `trace module unavailable: ${traceImportError.code || traceImportError.message}`,
    );
}
async function inTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "battenmark-backend-recovery-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function backendScript() {
  let projectId;
  return [
    (request) => {
      const content = request.messages.at(-1)?.content || "";
      const payload = JSON.parse(content.slice(content.indexOf("{")));
      projectId = payload.results[0]?.details?.project_id;
      assert(projectId, content);
      return { toolCalls: [{ id: "status", name: "kernel_status", args: {} }] };
    },
    () => ({
      toolCalls: [
        {
          id: "inspect",
          name: "inspect_faces",
          args: { project_id: projectId, body_id: "diagnostic_fixture", selector: "top_face" },
        },
      ],
    }),
    () => ({
      toolCalls: [
        {
          id: "correct",
          name: "query_geometry",
          args: {
            project_id: projectId,
            body_id: "diagnostic_fixture",
            entity: "face",
            selector: "top_face",
          },
        },
      ],
    }),
    () => ({ toolCalls: [{ id: "verify", name: "validate", args: { project_id: projectId } }] }),
    { output: "recovered", toolCalls: [] },
  ];
}

async function tracedRun(dir, scenarioId, condition, script = backendScript()) {
  requireTraceApi();
  const scenario = await loadScenario(scenarioId);
  const relativePath = `experiment/${scenarioId}__${condition}__1.json`;
  const filePath = join(dir, relativePath);
  const row = await runAgentLoop({
    scenarioId,
    condition,
    provider: createMockProvider({ script }),
    config: { provider: "mock", model: "mock-model" },
    runId: 1,
    traceOptions: {
      filePath,
      relativePath,
      experimentId: "experiment",
      battenmarkSha: "sha-a",
      matrixKey: `${scenarioId}|${condition}|1`,
      executionMode: "real-agent",
      evaluationSemantics: traceApi.EVALUATION_SEMANTICS_VERSION,
      traceSchemaVersion: traceApi.TRACE_SCHEMA_VERSION,
      toolCatalogHash: "tools-a",
    },
  });
  return { scenario, row, trace: JSON.parse(await readFile(filePath, "utf8")) };
}

function injectedErrors(trace) {
  return trace.events.filter(
    (event) => event.kind === "tool_result" && event.result?.code === "GEOMETRY_REFERENCE_LOST",
  );
}

await test("B1-B2-promised-error-injected-exactly-once", () =>
  inTemp(async (dir) => {
    const { trace } = await tracedRun(dir, "backend-diagnostics", "no-skill");
    assert(injectedErrors(trace).length === 1, JSON.stringify(injectedErrors(trace)));
    const firstRequest = trace.events.find((event) => event.kind === "model_request");
    assert(
      JSON.stringify(firstRequest.messages).includes("GEOMETRY_REFERENCE_LOST"),
      "model did not receive error",
    );
    assert(
      JSON.stringify(firstRequest.messages).includes("diagnostic-project"),
      "model did not receive the pre-existing public project handle",
    );
  }));

for (const scenario of ["assembly", "enclosure"]) {
  await test(`B3-B4-no-injection-${scenario}`, () =>
    inTemp(async (dir) => {
      const { trace } = await tracedRun(dir, scenario, "no-skill", [{ output: "done" }]);
      assert(injectedErrors(trace).length === 0, JSON.stringify(injectedErrors(trace)));
    }));
}

await test("B5-same-fixture-both-conditions", () =>
  inTemp(async (dir) => {
    const noSkill = await tracedRun(dir, "backend-diagnostics", "no-skill");
    const withSkill = await tracedRun(dir, "backend-diagnostics", "with-skill");
    const pick = (trace) => injectedErrors(trace)[0].result;
    assert(
      JSON.stringify(pick(noSkill.trace)) === JSON.stringify(pick(withSkill.trace)),
      "fixture differs by condition",
    );
  }));

await test("B6-trace-records-safe-injected-error", () =>
  inTemp(async (dir) => {
    const { trace } = await tracedRun(dir, "backend-diagnostics", "with-skill");
    const error = injectedErrors(trace)[0];
    assert(
      error.result.message && error.result.details.reference === "gref_missing",
      JSON.stringify(error),
    );
  }));

await test("B7-fixture-seeds-coherent-public-project-document-body-session", async () => {
  const scenario = await loadScenario("backend-diagnostics");
  const fixture = createEvaluationFixture(scenario);
  const initialized = fixture.initialize({});
  assert(
    initialized.public_context.project_id === "diagnostic-project",
    JSON.stringify(initialized),
  );
  assert(initialized.public_context.body_id === "diagnostic_fixture", JSON.stringify(initialized));
  const inspected = await executePublicTool(
    "inspect_document",
    { project_id: initialized.public_context.project_id },
    { state: initialized.state },
  );
  assert(inspected.ok, JSON.stringify(inspected));
  assert(inspected.data.id === initialized.public_context.document_id, JSON.stringify(inspected));
  assert(inspected.data.bodies[0]?.id === "diagnostic_fixture", JSON.stringify(inspected));
  assert(!JSON.stringify(inspected.data).includes("fixture_geometry"), JSON.stringify(inspected));
});

await test("B8-backend-recovery-executes-inspect-retry-reverify-in-real-session", () =>
  inTemp(async (dir) => {
    const { row, trace } = await tracedRun(dir, "backend-diagnostics", "with-skill");
    const calls = trace.events.filter((event) => event.kind === "tool_call");
    const resultsById = new Map(
      trace.events
        .filter((event) => event.kind === "tool_result")
        .map((event) => [event.tool_call_id, event.result]),
    );
    for (const id of ["inspect", "correct", "verify"])
      assert(resultsById.get(id)?.ok === true, `${id}: ${JSON.stringify(resultsById.get(id))}`);
    const modelCalls = calls.filter((call) => call.source === "model");
    assert(
      modelCalls.find((call) => call.tool_call_id === "inspect")?.args.project_id ===
        "diagnostic-project",
      JSON.stringify(modelCalls),
    );
    assert(
      modelCalls.find((call) => call.tool_call_id === "correct")?.args.body_id ===
        "diagnostic_fixture",
      JSON.stringify(modelCalls),
    );
    assert(
      row.checks.recovery_succeeded === true && row.checks.re_verified === true,
      JSON.stringify(row.checks),
    );
  }));

await test("B9-fabricated-backend-context-never-receives-recovery-success", async () => {
  const scenario = await loadScenario("backend-diagnostics");
  const initialized = createEvaluationFixture(scenario).initialize({});
  const attempts = [
    [
      "query_geometry",
      {
        project_id: "wrong-project",
        body_id: "diagnostic_fixture",
        entity: "face",
        selector: "top_face",
      },
      "PROJECT_NOT_FOUND",
    ],
    [
      "inspect_faces",
      { project_id: "diagnostic-project", body_id: "fabricated-body", selector: "top_face" },
      "UNKNOWN_BODY",
    ],
    [
      "query_geometry",
      {
        project_id: "diagnostic-project",
        body_id: "diagnostic_fixture",
        entity: "face",
        selector: { gref: "gref_missing" },
      },
      "GEOMETRY_REFERENCE_LOST",
    ],
  ];
  for (const [name, args, code] of attempts) {
    const result = await executePublicTool(name, args, { state: initialized.state });
    assert(result.ok === false && result.code === code, `${name}: ${JSON.stringify(result)}`);
    assert(result.state.geometry_inspected !== true, `${name} assigned positive recovery state`);
  }
  const unrelated = await executePublicTool(
    "project_create",
    { name: "unrelated" },
    { state: initialized.state },
  );
  const fabricated = await executePublicTool(
    "query_geometry",
    {
      project_id: unrelated.data.project_id,
      body_id: "diagnostic_fixture",
      entity: "face",
      selector: "top_face",
    },
    { state: unrelated.state },
  );
  assert(fabricated.ok === false && fabricated.code === "UNKNOWN_BODY", JSON.stringify(fabricated));
});

await test("B10-unrelated-project-agent-loop-gets-no-recovery-credit", async () => {
  let phase = 0;
  let unrelatedProject;
  const row = await runAgentLoop({
    scenarioId: "backend-diagnostics",
    condition: "no-skill",
    provider: {
      id: "mock",
      async run(request) {
        phase += 1;
        if (phase === 1)
          return { toolCalls: [{ name: "project_create", args: { name: "unrelated" } }] };
        const content = request.messages.at(-1)?.content || "";
        const payload = JSON.parse(content.slice(content.indexOf("{")));
        if (phase === 2) {
          unrelatedProject = payload.results[0]?.data?.project_id;
          assert(unrelatedProject, content);
          return {
            toolCalls: [
              {
                name: "query_geometry",
                args: {
                  project_id: unrelatedProject,
                  body_id: "diagnostic_fixture",
                  entity: "face",
                  selector: "top_face",
                },
              },
            ],
          };
        }
        assert(payload.results[0]?.code === "UNKNOWN_BODY", content);
        return { output: "The unrelated project cannot recover this fixture.", toolCalls: [] };
      },
    },
    config: { provider: "mock", model: "mock-model" },
  });
  assert(row.checks.recovery_attempted === true, JSON.stringify(row.checks));
  assert(row.checks.recovery_succeeded === false, JSON.stringify(row.checks));
  assert(row.checks.re_verified === false, JSON.stringify(row.checks));
});

function call(name, { ok = true, args = {}, code, order } = {}) {
  return { name, ok, args, code, error: code ? "safe error" : undefined, order };
}
function recoveryTrace(calls) {
  return {
    tool_calls: calls.map((item, index) => ({ ...item, order: item.order ?? index + 1 })),
    errors: calls
      .filter((item) => item.ok === false)
      .map((item) => ({ code: item.code, message: item.error })),
    notes: [],
    artifact_ids: [],
    final_state: {},
    completion_status: "complete",
  };
}

const backendScenario = await loadScenario("backend-diagnostics");
const injected = call("query_geometry", {
  ok: false,
  code: "GEOMETRY_REFERENCE_LOST",
  args: { body_id: "diagnostic_fixture", entity: "face", selector: { gref: "gref_missing" } },
});
const corrected = call("query_geometry", {
  args: { body_id: "diagnostic_fixture", entity: "face", selector: "top_face" },
});
const verification = call("validate");

await test("R1-pre-error-success-does-not-count", () => {
  const scored = scoreTrace(backendScenario, recoveryTrace([call("kernel_status"), injected]));
  assert(scored.checks.recovery_attempted === false, JSON.stringify(scored.checks));
});

await test("R2-unrelated-post-error-success-does-not-count", () => {
  const scored = scoreTrace(backendScenario, recoveryTrace([injected, call("kernel_status")]));
  assert(scored.checks.recovery_attempted === false, JSON.stringify(scored.checks));
});

await test("R3-relevant-correction-counts-attempt", () => {
  const scored = scoreTrace(backendScenario, recoveryTrace([injected, corrected]));
  assert(scored.checks.error_observed === true, JSON.stringify(scored.checks));
  assert(scored.checks.recovery_attempted === true, JSON.stringify(scored.checks));
});

await test("R4-failed-correction-is-not-success", () => {
  const failedCorrection = {
    ...corrected,
    ok: false,
    code: "GEOMETRY_REFERENCE_AMBIGUOUS",
    error: "still ambiguous",
  };
  const scored = scoreTrace(backendScenario, recoveryTrace([injected, failedCorrection]));
  assert(scored.checks.recovery_attempted === true, JSON.stringify(scored.checks));
  assert(scored.checks.recovery_succeeded === false, JSON.stringify(scored.checks));
});

await test("R5-corrected-call-succeeds", () => {
  const scored = scoreTrace(backendScenario, recoveryTrace([injected, corrected]));
  assert(scored.checks.recovery_succeeded === true, JSON.stringify(scored.checks));
});

await test("R6-reverification-must-follow-recovery", () => {
  const before = scoreTrace(backendScenario, recoveryTrace([verification, injected, corrected]));
  const after = scoreTrace(backendScenario, recoveryTrace([injected, corrected, verification]));
  assert(before.checks.re_verified === false, JSON.stringify(before.checks));
  assert(after.checks.re_verified === true, JSON.stringify(after.checks));
});

await test("R7-no-error-no-recovery-credit", () => {
  const scored = scoreTrace(backendScenario, recoveryTrace([corrected, verification]));
  assert(scored.checks.recovery_attempted === false, JSON.stringify(scored.checks));
  assert(scored.checks.recovery_succeeded === false, JSON.stringify(scored.checks));
});

await test("R8-deterministic-explainable-score", () => {
  const trace = recoveryTrace([injected, call("kernel_status"), corrected, verification]);
  const a = scoreTrace(backendScenario, trace);
  const b = scoreTrace(backendScenario, trace);
  assert(
    a.score === b.score && JSON.stringify(a.checks) === JSON.stringify(b.checks),
    `${a.score}/${b.score}`,
  );
  assert(
    Object.values(a.checks).every((value) => typeof value === "boolean"),
    JSON.stringify(a.checks),
  );
});

function experiment(overrides = {}) {
  requireTraceApi();
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
        key: "backend-diagnostics",
        id: "backend-diagnostics-001",
        scenario_hash: "scenario-v2",
        skill: "backend-diagnostics",
        skill_hash: "skill-a",
      },
    ],
    ...overrides,
  });
}

await test("E1-E2-semantics-and-trace-version-change-identity", () => {
  const current = experiment();
  const old = experiment({ evaluation_semantics: "battenmark.phase7c.backend-recovery.v1" });
  const otherTrace = experiment({ trace_schema_version: "battenmark.eval.trace.v0" });
  assert(current.experiment_id !== old.experiment_id, "semantics absent from identity");
  assert(current.experiment_id !== otherTrace.experiment_id, "trace schema absent from identity");
});

await test("E3-backend-scenario-hash-change-recognized", () => {
  assert(
    experiment().experiment_id !==
      experiment({
        scenarios: [
          {
            key: "backend-diagnostics",
            id: "backend-diagnostics-001",
            scenario_hash: "old-scenario",
            skill: "backend-diagnostics",
            skill_hash: "skill-a",
          },
        ],
      }).experiment_id,
    "scenario hash absent",
  );
});

await test("E4-identical-corrected-config-stable", () => {
  assert(experiment().experiment_id === experiment().experiment_id, "identity unstable");
});

await test("E1-resume-old-semantics-fails-before-provider", () =>
  inTemp(async (dir) => {
    const old = experiment({
      evaluation_semantics: "battenmark.phase7c.backend-recovery.v1",
      trace_schema_version: "none",
    });
    const matrix = buildMatrix(old);
    const checkpointPath = join(dir, "checkpoint.json");
    await runCheckpointedMatrix({
      experiment: old,
      matrix,
      checkpointPath,
      resume: false,
      executeRow: async (entry) => ({
        schema: "battenmark.eval.agent.v1",
        matrix_key: entry.matrix_key,
        scenario_id: entry.scenario_id,
        skill: entry.skill,
        condition: entry.condition,
        provider: old.provider,
        model: old.model,
        temperature: old.temperature,
        run: entry.run,
        score: 1,
        verdict: "FAIL",
        termination: "model_stop",
        execution_mode: "real-agent",
        evaluation_semantics: old.evaluation_semantics,
      }),
    });
    const current = experiment();
    let calls = 0;
    try {
      await runCheckpointedMatrix({
        experiment: current,
        matrix: buildMatrix(current),
        checkpointPath,
        tracesDir: join(dir, "traces"),
        resume: true,
        executeRow: async () => {
          calls += 1;
        },
      });
      throw new Error("expected experiment mismatch");
    } catch (error) {
      assert(error.code === "CHECKPOINT_EXPERIMENT_MISMATCH", `${error.code} ${error.message}`);
      assert(calls === 0, `provider called ${calls}`);
    }
  }));

const failed = results.filter((result) => !result.passed).length;
console.log(
  `\n${results.length - failed}/${results.length} backend recovery integrity tests passed`,
);
if (failed) process.exit(1);
