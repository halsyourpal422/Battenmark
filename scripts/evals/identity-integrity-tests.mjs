#!/usr/bin/env node
import { runAgentLoop } from "./agent-loop.mjs";
import { executePublicTool } from "./public-executor.mjs";
import {
  EVALUATION_SEMANTICS_VERSION,
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

function parseLastToolResults(request) {
  const content = request.messages.at(-1)?.content || "";
  assert(content.startsWith("Tool results:\n"), `missing structured tool results: ${content}`);
  return { content, payload: JSON.parse(content.slice(content.indexOf("{"))) };
}

function resultFor(payload, operation) {
  const result = payload.results.find((entry) => entry.operation === operation);
  assert(result, `missing ${operation} result in ${JSON.stringify(payload)}`);
  return result;
}

async function executeSequence(steps) {
  let state = {};
  const output = [];
  for (const [name, args] of steps) {
    const result = await executePublicTool(name, args, { state });
    state = result.state || state;
    output.push({ name, result });
  }
  return { state, output };
}

await test("I1-create-identities-reach-next-model-turn", async () => {
  let phase = 0;
  let bodyIds = [];
  let assemblyId;
  let componentIds = [];
  let inspectedIdentities = false;
  const provider = {
    id: "mock",
    async run(request) {
      phase += 1;
      if (phase === 1) {
        return {
          toolCalls: [{ name: "project_create", args: { name: "eval-assembly" } }],
        };
      }
      if (phase === 2) {
        return {
          toolCalls: [
            {
              name: "create_box",
              args: { name: "Anchor", length_mm: 60, width_mm: 40, height_mm: 10 },
            },
            {
              name: "create_box",
              args: { name: "Mover", length_mm: 30, width_mm: 30, height_mm: 12 },
            },
          ],
        };
      }
      if (phase === 3) {
        const { content, payload } = parseLastToolResults(request);
        bodyIds = payload.results.map((entry) => entry.data?.body_id);
        assert(bodyIds.length === 2 && bodyIds.every(Boolean), content);
        assert(new Set(bodyIds).size === 2, `body identities were not distinct: ${bodyIds}`);
        assert(
          content.includes('"name": "Anchor"') && content.includes('"name": "Mover"'),
          content,
        );
        assert(!/worker\.py|source_path|private[_-]?key|api[_-]?key/i.test(content), content);
        return { toolCalls: [{ name: "create_assembly", args: { name: "eval-asm" } }] };
      }
      if (phase === 4) {
        const { payload } = parseLastToolResults(request);
        assemblyId = resultFor(payload, "create_assembly").data?.assembly_id;
        assert(assemblyId, JSON.stringify(payload));
        return {
          toolCalls: bodyIds.map((bodyId, index) => ({
            name: "define_component",
            args: {
              assembly_id: assemblyId,
              name: index === 0 ? "AnchorComponent" : "MoverComponent",
              include: { body_ids: [bodyId] },
            },
          })),
        };
      }
      if (phase === 5) {
        const { payload } = parseLastToolResults(request);
        componentIds = payload.results.map((entry) => entry.data?.component_id);
        assert(componentIds.length === 2 && componentIds.every(Boolean), JSON.stringify(payload));
        return {
          toolCalls: componentIds.map((componentId, index) => ({
            name: "create_instance",
            args: {
              assembly_id: assemblyId,
              component_id: componentId,
              instance_id: index ? "b1" : "a1",
            },
          })),
        };
      }
      const { payload } = parseLastToolResults(request);
      const instanceIds = payload.results.map((entry) => entry.data?.instance_id);
      assert(JSON.stringify(instanceIds) === JSON.stringify(["a1", "b1"]), JSON.stringify(payload));
      inspectedIdentities = true;
      return {
        output: "Returned public identities were available and verified.",
        toolCalls: [],
      };
    },
  };

  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(inspectedIdentities, "identity-bearing results were not inspected");
  assert(row.termination === "model_stop", `termination=${row.termination}`);
});

await test("I2-fabricated-references-fail-with-public-errors", async () => {
  const seeded = await executeSequence([
    ["project_create", { name: "references" }],
    ["create_box", { name: "Anchor", length_mm: 1, width_mm: 1, height_mm: 1 }],
    ["create_assembly", { assembly_id: "known-assembly" }],
  ]);
  let state = seeded.state;
  const attempts = [
    [
      "define_component",
      { assembly_id: "known-assembly", include: { body_ids: ["bdy_missing"] } },
      "EMPTY_SKETCH",
      "components_defined",
    ],
    [
      "create_instance",
      { assembly_id: "known-assembly", component_id: "cmp_missing" },
      "COMPONENT_NOT_FOUND",
      "instances_created",
    ],
    [
      "fix_instance",
      { assembly_id: "known-assembly", instance_id: "instance_missing" },
      "INSTANCE_NOT_FOUND",
      "reference_grounded",
    ],
    [
      "mate_faces",
      {
        assembly_id: "known-assembly",
        a_instance: "a_missing",
        a_face: "top_face",
        b_instance: "b_missing",
        b_face: "bottom_face",
      },
      "INSTANCE_NOT_FOUND",
      "constraint_applied",
    ],
    [
      "inspect_assembly",
      { assembly_id: "asm_missing" },
      "ASSEMBLY_NOT_FOUND",
      "inspect_assembly_called",
    ],
    [
      "export_assembly",
      { assembly_id: "asm_missing", format: "step" },
      "ASSEMBLY_NOT_FOUND",
      "artifact_exported",
    ],
  ];
  for (const [name, args, code, forbiddenFlag] of attempts) {
    const result = await executePublicTool(name, args, { state });
    state = result.state || state;
    assert(result.ok === false, `${name} unexpectedly succeeded`);
    assert(result.code === code, `${name} code=${result.code}`);
    assert(result.state?.[forbiddenFlag] !== true, `${name} set ${forbiddenFlag}`);
  }
});

function fullAssemblyProvider({ inspectFallback = false } = {}) {
  let phase = 0;
  let bodyIds = [];
  let assemblyId;
  let componentIds = [];
  let fallbackInspections = 0;
  return {
    id: "mock",
    get fallbackInspections() {
      return fallbackInspections;
    },
    async run(request) {
      phase += 1;
      if (phase === 1)
        return { toolCalls: [{ name: "project_create", args: { name: "eval-assembly" } }] };
      if (phase === 2) {
        return {
          toolCalls: [
            {
              name: "create_box",
              args: { name: "Anchor", length_mm: 60, width_mm: 40, height_mm: 10 },
            },
            {
              name: "create_box",
              args: { name: "Mover", length_mm: 30, width_mm: 30, height_mm: 12 },
            },
          ],
        };
      }
      if (phase === 3) {
        const { payload } = parseLastToolResults(request);
        bodyIds = payload.results.map((entry) => entry.data?.body_id).filter(Boolean);
        if (inspectFallback && bodyIds.length !== 2) {
          fallbackInspections += 1;
          return { toolCalls: [{ name: "inspect_document", args: {} }] };
        }
        assert(bodyIds.length === 2, JSON.stringify(payload));
        return { toolCalls: [{ name: "create_assembly", args: { name: "eval-asm" } }] };
      }
      if (phase === 4) {
        const { payload } = parseLastToolResults(request);
        assemblyId = resultFor(payload, "create_assembly").data?.assembly_id;
        if (inspectFallback && !assemblyId) {
          fallbackInspections += 1;
          return { toolCalls: [{ name: "inspect_document", args: {} }] };
        }
        assert(assemblyId, JSON.stringify(payload));
        return {
          toolCalls: bodyIds.map((bodyId, index) => ({
            name: "define_component",
            args: {
              assembly_id: assemblyId,
              name: index ? "MoverComponent" : "AnchorComponent",
              include: { body_ids: [bodyId] },
            },
          })),
        };
      }
      if (phase === 5) {
        const { payload } = parseLastToolResults(request);
        componentIds = payload.results.map((entry) => entry.data?.component_id).filter(Boolean);
        if (inspectFallback && componentIds.length !== 2) {
          fallbackInspections += 1;
          return { toolCalls: [{ name: "inspect_document", args: {} }] };
        }
        assert(componentIds.length === 2, JSON.stringify(payload));
        return {
          toolCalls: componentIds.map((componentId, index) => ({
            name: "create_instance",
            args: {
              assembly_id: assemblyId,
              component_id: componentId,
              instance_id: index ? "b1" : "a1",
            },
          })),
        };
      }
      if (phase === 6) {
        const { payload } = parseLastToolResults(request);
        assert(
          payload.results.every((entry) => entry.data?.instance_id),
          JSON.stringify(payload),
        );
        return {
          toolCalls: [
            { name: "fix_instance", args: { assembly_id: assemblyId, instance_id: "a1" } },
            {
              name: "mate_faces",
              args: {
                assembly_id: assemblyId,
                a_instance: "a1",
                a_face: "top_face",
                b_instance: "b1",
                b_face: "bottom_face",
              },
            },
          ],
        };
      }
      if (phase === 7) {
        const { payload } = parseLastToolResults(request);
        assert(resultFor(payload, "fix_instance").ok, JSON.stringify(payload));
        assert(resultFor(payload, "mate_faces").data?.constraint_id, JSON.stringify(payload));
        return {
          toolCalls: [
            { name: "inspect_assembly", args: { assembly_id: assemblyId } },
            { name: "check_interference", args: { assembly_id: assemblyId } },
          ],
        };
      }
      if (phase === 8) {
        const { payload } = parseLastToolResults(request);
        const inspection = resultFor(payload, "inspect_assembly");
        assert(inspection.data?.remaining_dof_total === 3, JSON.stringify(payload));
        assert(inspection.state?.remaining_dof === 3, JSON.stringify(payload));
        assert(resultFor(payload, "check_interference").ok, JSON.stringify(payload));
        return {
          toolCalls: [
            { name: "rebuild_assembly", args: { assembly_id: assemblyId } },
            { name: "export_assembly", args: { assembly_id: assemblyId, format: "step" } },
          ],
        };
      }
      if (phase === 9) {
        const { payload } = parseLastToolResults(request);
        assert(resultFor(payload, "rebuild_assembly").ok, JSON.stringify(payload));
        assert(resultFor(payload, "export_assembly").data?.artifact_id, JSON.stringify(payload));
        return {
          output: "Assembly completed using only returned public identities.",
          toolCalls: [],
        };
      }
      throw new Error(`unexpected provider phase ${phase}`);
    },
  };
}

await test("I3-full-assembly-chain-uses-only-returned-identities", async () => {
  const provider = fullAssemblyProvider();
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "model_stop", `termination=${row.termination}`);
  assert(row.remaining_dof === 3, `remaining_dof=${row.remaining_dof}`);
  assert(row.checks.constraint_applied === true, JSON.stringify(row.checks));
  assert(row.checks.artifact_exported === true, JSON.stringify(row.checks));
  assert(row.hard_failures.length === 0, JSON.stringify(row.hard_failures));
});

await test("I4-v3-inspection-loop-fallback-is-not-needed-with-v4-results", async () => {
  const provider = fullAssemblyProvider({ inspectFallback: true });
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "with-skill",
    provider,
    config: config(),
  });
  assert(
    provider.fallbackInspections === 0,
    `fallback inspections=${provider.fallbackInspections}`,
  );
  assert(row.termination === "model_stop", `termination=${row.termination}`);
  assert(row.checks.artifact_exported === true, JSON.stringify(row.checks));
});

await test("I5-guessed-assembly-identities-receive-no-success-credit", async () => {
  let phase = 0;
  const provider = {
    id: "mock",
    async run() {
      phase += 1;
      if (phase === 1) {
        return {
          toolCalls: [
            { name: "project_create", args: { name: "guessing" } },
            {
              name: "create_box",
              args: { name: "Anchor", length_mm: 1, width_mm: 1, height_mm: 1 },
            },
            { name: "create_assembly", args: { assembly_id: "known-assembly" } },
          ],
        };
      }
      if (phase === 2) {
        return {
          toolCalls: [
            {
              name: "define_component",
              args: { assembly_id: "known-assembly", include: { body_ids: ["body_1"] } },
            },
            {
              name: "create_instance",
              args: {
                assembly_id: "known-assembly",
                component_id: "component_1",
                instance_id: "a1",
              },
            },
            { name: "fix_instance", args: { assembly_id: "known-assembly", instance_id: "a1" } },
            {
              name: "mate_faces",
              args: {
                assembly_id: "known-assembly",
                a_instance: "a1",
                a_face: "top_face",
                b_instance: "b1",
                b_face: "bottom_face",
              },
            },
            { name: "inspect_assembly", args: { assembly_id: "assembly_1" } },
            { name: "check_interference", args: { assembly_id: "assembly_1" } },
            { name: "export_assembly", args: { assembly_id: "assembly_1", format: "step" } },
          ],
        };
      }
      return { output: "The guessed references should not count as success.", toolCalls: [] };
    },
  };
  const row = await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider,
    config: config(),
  });
  for (const check of [
    "components_defined",
    "instances_created",
    "reference_grounded",
    "constraint_applied",
    "inspect_assembly_called",
    "remaining_dof_3",
    "interference_checked",
    "artifact_exported",
  ]) {
    assert(row.checks[check] === false, `${check}=${row.checks[check]}`);
  }
});

await test("I6-inspection-mirrors-public-identity-boundaries", async () => {
  const seeded = await executeSequence([
    ["project_create", { name: "inspection" }],
    ["create_box", { name: "Anchor", length_mm: 1, width_mm: 2, height_mm: 3 }],
  ]);
  const box = seeded.output.at(-1).result.data;
  const inspected = await executePublicTool("inspect_document", {}, { state: seeded.state });
  const projectInspected = await executePublicTool(
    "project_inspect",
    { project_id: "inspection" },
    { state: inspected.state },
  );
  const opened = await executePublicTool(
    "project_open",
    { project_id: "inspection" },
    { state: projectInspected.state },
  );
  assert(inspected.data.bodies[0].id === box.body_id, JSON.stringify(inspected.data));
  assert(
    projectInspected.data.document.bodies[0].features[0].id === box.id,
    JSON.stringify(projectInspected.data),
  );
  assert(!("bodies" in opened.data), "project_open fabricated a body registry");
});

await test("I7-identity-envelope-stays-bounded-and-redacted", () => {
  const secret = "sk-phase7c7-identity-secret";
  const message = formatModelToolResults([
    createModelToolResult({
      operation: "create_box",
      toolCallId: "identity-result",
      result: {
        ok: true,
        data: {
          id: "feat_1",
          body_id: "bdy_1",
          body_name: "Body",
          safe: "visible",
          api_key: secret,
          backend_dump: "x".repeat(50_000),
        },
      },
    }),
  ]);
  assert(message.includes('"body_id": "bdy_1"'), message);
  assert(message.includes('"id": "feat_1"'), message);
  assert(message.includes("[TRUNCATED]"), message);
  assert(!message.includes(secret) && !message.includes("api_key"), message);
  assert(message.length <= 24_020, `message length=${message.length}`);
});

await test("I8-evaluation-semantics-advanced-to-v4", () => {
  assert(
    EVALUATION_SEMANTICS_VERSION === "battenmark.phase7c.identity-integrity.v4",
    EVALUATION_SEMANTICS_VERSION,
  );
});

await test("I9-imported-components-remain-instantiable-but-not-parametric", async () => {
  const seeded = await executeSequence([
    ["project_create", { name: "imported-component" }],
    ["create_assembly", { assembly_id: "imported-assembly" }],
    [
      "define_component",
      {
        assembly_id: "imported-assembly",
        component_id: "imported-definition",
        source_format: "step",
        source_path: "/workspace/private/source.step",
      },
    ],
  ]);
  const instance = await executePublicTool(
    "create_instance",
    {
      assembly_id: "imported-assembly",
      component_id: "imported-definition",
      instance_id: "imported-instance",
    },
    { state: seeded.state },
  );
  assert(instance.ok === true, JSON.stringify(instance));
  assert(instance.data?.instance_id === "imported-instance", JSON.stringify(instance));
  const parameter = await executePublicTool(
    "set_definition_parameter",
    {
      assembly_id: "imported-assembly",
      component_id: "imported-definition",
      name: "length",
      value: 10,
    },
    { state: instance.state },
  );
  assert(parameter.ok === false, JSON.stringify(parameter));
  assert(parameter.code === "UNKNOWN_PARAMETER", JSON.stringify(parameter));
  assert(!JSON.stringify(instance).includes("source.step"), JSON.stringify(instance));
});

const failed = results.filter((result) => !result.passed).length;
console.log(
  `\n${results.length - failed}/${results.length} Phase 7C.7 identity-integrity tests passed`,
);
if (failed) process.exit(1);
