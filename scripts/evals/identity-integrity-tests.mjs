#!/usr/bin/env node
import { runAgentLoop } from "./agent-loop.mjs";
import { executePublicTool, loadPublicCatalog } from "./public-executor.mjs";
import {
  EVALUATION_SEMANTICS_VERSION,
  createModelToolResult,
  formatModelToolResults,
} from "./trace.mjs";

const results = [];
const POSITIVE_STATE_KEYS = [
  "box_created",
  "outer_shell_created",
  "components_defined",
  "instances_created",
  "reference_grounded",
  "constraint_applied",
  "inspect_assembly_called",
  "interference_checked",
  "artifact_exported",
  "feature_applied",
  "validated",
  "preview_rendered",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveState(state) {
  return Object.fromEntries(POSITIVE_STATE_KEYS.map((key) => [key, Boolean(state?.[key])]));
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

async function executeProjectSequence(projectName, steps) {
  const created = await executePublicTool("project_create", { name: projectName }, { state: {} });
  assert(created.ok && created.data?.project_id, JSON.stringify(created));
  const projectId = created.data.project_id;
  let state = created.state;
  const output = [{ name: "project_create", result: created }];
  for (const [name, args] of steps) {
    const result = await executePublicTool(name, { project_id: projectId, ...args }, { state });
    state = result.state || state;
    output.push({ name, result });
  }
  return { projectId, state, output };
}

await test("I1-create-identities-reach-next-model-turn", async () => {
  let phase = 0;
  let projectId;
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
        const { payload } = parseLastToolResults(request);
        projectId = resultFor(payload, "project_create").data?.project_id;
        assert(projectId, JSON.stringify(payload));
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
        return {
          toolCalls: [
            { name: "create_assembly", args: { project_id: projectId, name: "eval-asm" } },
          ],
        };
      }
      if (phase === 4) {
        const { payload } = parseLastToolResults(request);
        assemblyId = resultFor(payload, "create_assembly").data?.assembly_id;
        assert(assemblyId, JSON.stringify(payload));
        return {
          toolCalls: bodyIds.map((bodyId, index) => ({
            name: "define_component",
            args: {
              project_id: projectId,
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
              project_id: projectId,
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
  const seeded = await executeProjectSequence("references", [
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
    const result = await executePublicTool(
      name,
      { project_id: seeded.projectId, ...args },
      { state },
    );
    state = result.state || state;
    assert(result.ok === false, `${name} unexpectedly succeeded`);
    assert(result.code === code, `${name} code=${result.code}`);
    assert(result.state?.[forbiddenFlag] !== true, `${name} set ${forbiddenFlag}`);
  }
});

function fullAssemblyProvider({ inspectFallback = false } = {}) {
  let phase = 0;
  let projectId;
  let bodyIds = [];
  let assemblyId;
  let componentIds = [];
  let fallbackInspections = 0;
  return {
    id: "mock",
    get fallbackInspections() {
      return fallbackInspections;
    },
    get projectId() {
      return projectId;
    },
    async run(request) {
      phase += 1;
      if (phase === 1)
        return { toolCalls: [{ name: "project_create", args: { name: "eval-assembly" } }] };
      if (phase === 2) {
        const { payload } = parseLastToolResults(request);
        projectId = resultFor(payload, "project_create").data?.project_id;
        assert(projectId, JSON.stringify(payload));
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
          ],
        };
      }
      if (phase === 3) {
        const { payload } = parseLastToolResults(request);
        bodyIds = payload.results.map((entry) => entry.data?.body_id).filter(Boolean);
        if (inspectFallback && bodyIds.length !== 2) {
          fallbackInspections += 1;
          return {
            toolCalls: [{ name: "inspect_document", args: { project_id: projectId } }],
          };
        }
        assert(bodyIds.length === 2, JSON.stringify(payload));
        return {
          toolCalls: [
            { name: "create_assembly", args: { project_id: projectId, name: "eval-asm" } },
          ],
        };
      }
      if (phase === 4) {
        const { payload } = parseLastToolResults(request);
        assemblyId = resultFor(payload, "create_assembly").data?.assembly_id;
        if (inspectFallback && !assemblyId) {
          fallbackInspections += 1;
          return {
            toolCalls: [{ name: "inspect_document", args: { project_id: projectId } }],
          };
        }
        assert(assemblyId, JSON.stringify(payload));
        return {
          toolCalls: bodyIds.map((bodyId, index) => ({
            name: "define_component",
            args: {
              project_id: projectId,
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
          return {
            toolCalls: [{ name: "inspect_document", args: { project_id: projectId } }],
          };
        }
        assert(componentIds.length === 2, JSON.stringify(payload));
        return {
          toolCalls: componentIds.map((componentId, index) => ({
            name: "create_instance",
            args: {
              project_id: projectId,
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
            {
              name: "fix_instance",
              args: { project_id: projectId, assembly_id: assemblyId, instance_id: "a1" },
            },
            {
              name: "mate_faces",
              args: {
                project_id: projectId,
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
            {
              name: "inspect_assembly",
              args: { project_id: projectId, assembly_id: assemblyId },
            },
            {
              name: "check_interference",
              args: { project_id: projectId, assembly_id: assemblyId },
            },
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
            {
              name: "rebuild_assembly",
              args: { project_id: projectId, assembly_id: assemblyId },
            },
            {
              name: "export_assembly",
              args: { project_id: projectId, assembly_id: assemblyId, format: "step" },
            },
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
  assert(provider.projectId, "full chain did not capture returned project identity");
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
  let projectId;
  const provider = {
    id: "mock",
    async run(request) {
      phase += 1;
      if (phase === 1) {
        return {
          toolCalls: [{ name: "project_create", args: { name: "guessing" } }],
        };
      }
      if (phase === 2) {
        const { payload } = parseLastToolResults(request);
        projectId = resultFor(payload, "project_create").data?.project_id;
        assert(projectId, JSON.stringify(payload));
        return {
          toolCalls: [
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Anchor",
                length_mm: 1,
                width_mm: 1,
                height_mm: 1,
              },
            },
            {
              name: "create_assembly",
              args: { project_id: projectId, assembly_id: "known-assembly" },
            },
          ],
        };
      }
      if (phase === 3) {
        return {
          toolCalls: [
            {
              name: "define_component",
              args: {
                project_id: projectId,
                assembly_id: "known-assembly",
                include: { body_ids: ["body_1"] },
              },
            },
            {
              name: "create_instance",
              args: {
                project_id: projectId,
                assembly_id: "known-assembly",
                component_id: "component_1",
                instance_id: "a1",
              },
            },
            {
              name: "fix_instance",
              args: {
                project_id: projectId,
                assembly_id: "known-assembly",
                instance_id: "a1",
              },
            },
            {
              name: "mate_faces",
              args: {
                project_id: projectId,
                assembly_id: "known-assembly",
                a_instance: "a1",
                a_face: "top_face",
                b_instance: "b1",
                b_face: "bottom_face",
              },
            },
            {
              name: "inspect_assembly",
              args: { project_id: projectId, assembly_id: "assembly_1" },
            },
            {
              name: "check_interference",
              args: { project_id: projectId, assembly_id: "assembly_1" },
            },
            {
              name: "export_assembly",
              args: { project_id: projectId, assembly_id: "assembly_1", format: "step" },
            },
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
  const seeded = await executeProjectSequence("inspection", [
    ["create_box", { name: "Anchor", length_mm: 1, width_mm: 2, height_mm: 3 }],
  ]);
  const box = seeded.output.at(-1).result.data;
  const inspected = await executePublicTool(
    "inspect_document",
    { project_id: seeded.projectId },
    { state: seeded.state },
  );
  const projectInspected = await executePublicTool(
    "project_inspect",
    { project_id: seeded.projectId },
    { state: inspected.state },
  );
  const opened = await executePublicTool(
    "project_open",
    { project_id: seeded.projectId },
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
  const seeded = await executeProjectSequence("imported-component", [
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
      project_id: seeded.projectId,
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
      project_id: seeded.projectId,
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

await test("I10-external-catalog-requires-project-for-every-scoped-tool", async () => {
  const catalog = await loadPublicCatalog();
  let suppliedTools;
  await runAgentLoop({
    scenarioId: "assembly",
    condition: "no-skill",
    provider: {
      id: "mock",
      async run(request) {
        suppliedTools = request.tools;
        return { output: "Catalog inspected; no operation executed.", toolCalls: [] };
      },
    },
    config: config(),
  });
  const violations = suppliedTools
    .filter((tool) => catalog.getCatalogEntry(tool.name)?.needsProject)
    .filter((tool) => !tool.parameters?.required?.includes("project_id"))
    .map((tool) => tool.name);
  assert(violations.length === 0, `missing external project requirement: ${violations.join(",")}`);
  assert(suppliedTools.length === catalog.entries.length, `provider tools=${suppliedTools.length}`);
  const createBox = suppliedTools.find((tool) => tool.name === "create_box");
  assert(createBox.parameters.required[0] === "project_id", JSON.stringify(createBox));
  const projectCreate = suppliedTools.find((tool) => tool.name === "project_create");
  assert(!projectCreate.parameters.required.includes("project_id"), JSON.stringify(projectCreate));
});

await test("I11-missing-and-wrong-projects-fail-before-positive-state", async () => {
  const missing = await executePublicTool(
    "create_box",
    { name: "Missing", length_mm: 1, width_mm: 1, height_mm: 1 },
    { state: {} },
  );
  assert(missing.ok === false && missing.code === "MALFORMED_REQUEST", JSON.stringify(missing));
  assert(
    Object.values(positiveState(missing.state)).every((value) => value === false),
    JSON.stringify(missing),
  );

  const projectOnly = await executePublicTool(
    "project_create",
    { name: "project-only" },
    { state: {} },
  );
  const wrongBox = await executePublicTool(
    "create_box",
    {
      project_id: "fabricated-project",
      name: "Wrong",
      length_mm: 1,
      width_mm: 1,
      height_mm: 1,
    },
    { state: projectOnly.state },
  );
  assert(wrongBox.ok === false && wrongBox.code === "PROJECT_NOT_FOUND", JSON.stringify(wrongBox));
  assert(
    JSON.stringify(positiveState(wrongBox.state)) ===
      JSON.stringify(positiveState(projectOnly.state)),
    JSON.stringify(wrongBox),
  );
  const wrongAssembly = await executePublicTool(
    "create_assembly",
    { project_id: "fabricated-project" },
    { state: projectOnly.state },
  );
  assert(
    wrongAssembly.ok === false && wrongAssembly.code === "PROJECT_NOT_FOUND",
    JSON.stringify(wrongAssembly),
  );
  assert(
    wrongAssembly.state[Symbol.for("battenmark.eval.object-registry")].assemblies.length === 0,
  );

  const seeded = await executeProjectSequence("project-guard", [
    ["create_box", { name: "Real", length_mm: 1, width_mm: 1, height_mm: 1 }],
    ["create_assembly", { assembly_id: "real-assembly" }],
  ]);
  const attempts = [
    [
      "define_component",
      { assembly_id: "real-assembly", include: { body_ids: ["bdy_1"] } },
      "components_defined",
    ],
    ["inspect_document", {}, "inspect_assembly_called"],
    ["inspect_assembly", { assembly_id: "real-assembly" }, "inspect_assembly_called"],
    ["export_assembly", { assembly_id: "real-assembly", format: "step" }, "artifact_exported"],
  ];
  for (const [name, args, forbiddenFlag] of attempts) {
    const before = positiveState(seeded.state);
    const result = await executePublicTool(
      name,
      { project_id: "fabricated-project", ...args },
      { state: seeded.state },
    );
    assert(result.ok === false && result.code === "PROJECT_NOT_FOUND", JSON.stringify(result));
    assert(
      JSON.stringify(positiveState(result.state)) === JSON.stringify(before),
      `${name} changed positive state including ${forbiddenFlag}`,
    );
  }
});

await test("I12-set-instance-transform-mutates-and-inspection-observes-it", async () => {
  const seeded = await executeProjectSequence("transform", [
    ["create_box", { name: "Part", length_mm: 1, width_mm: 1, height_mm: 1 }],
    ["create_assembly", { assembly_id: "transform-assembly" }],
    [
      "define_component",
      {
        assembly_id: "transform-assembly",
        component_id: "transform-component",
        include: { body_ids: ["bdy_1"] },
      },
    ],
    [
      "create_instance",
      {
        assembly_id: "transform-assembly",
        component_id: "transform-component",
        instance_id: "moving",
        position: { x: 1, y: 2, z: 3 },
      },
    ],
  ]);
  const updated = await executePublicTool(
    "set_instance_transform",
    {
      project_id: seeded.projectId,
      assembly_id: "transform-assembly",
      instance_id: "moving",
      position: { x: 10, z: 30 },
      rotation_euler_xyz_deg: { x: 0, y: 0, z: 90 },
    },
    { state: seeded.state },
  );
  assert(updated.ok, JSON.stringify(updated));
  assert(
    JSON.stringify(updated.data.transform.translation) === JSON.stringify({ x: 10, y: 2, z: 30 }),
    JSON.stringify(updated),
  );
  const expectedHalf = Math.SQRT1_2;
  assert(
    Math.abs(updated.data.transform.rotation.z - expectedHalf) < 1e-12,
    JSON.stringify(updated),
  );
  assert(
    Math.abs(updated.data.transform.rotation.w - expectedHalf) < 1e-12,
    JSON.stringify(updated),
  );

  const inspected = await executePublicTool(
    "inspect_assembly",
    { project_id: seeded.projectId, assembly_id: "transform-assembly" },
    { state: updated.state },
  );
  const observed = inspected.data.instances.find((instance) => instance.id === "moving").transform;
  assert(
    JSON.stringify(observed) === JSON.stringify(updated.data.transform),
    JSON.stringify(inspected),
  );

  const unknown = await executePublicTool(
    "set_instance_transform",
    {
      project_id: seeded.projectId,
      assembly_id: "transform-assembly",
      instance_id: "missing",
      position: { x: 999 },
    },
    { state: inspected.state },
  );
  assert(unknown.ok === false && unknown.code === "INSTANCE_NOT_FOUND", JSON.stringify(unknown));
  const reinspected = await executePublicTool(
    "inspect_assembly",
    { project_id: seeded.projectId, assembly_id: "transform-assembly" },
    { state: unknown.state },
  );
  const afterFailure = reinspected.data.instances.find(
    (instance) => instance.id === "moving",
  ).transform;
  assert(JSON.stringify(afterFailure) === JSON.stringify(observed), JSON.stringify(reinspected));
});

await test("I13-native-definition-parameters-validate-and-retain-identity", async () => {
  const seeded = await executeProjectSequence("parameters", [
    ["define_parameter", { name: "length", value: 60 }],
    ["create_box", { name: "Part", length_mm: "length", width_mm: 1, height_mm: 1 }],
    ["create_assembly", { assembly_id: "parameter-assembly" }],
    [
      "define_component",
      {
        assembly_id: "parameter-assembly",
        component_id: "stable-component",
        include: { body_ids: ["bdy_1"] },
      },
    ],
  ]);
  const changed = await executePublicTool(
    "set_definition_parameter",
    {
      project_id: seeded.projectId,
      assembly_id: "parameter-assembly",
      component_id: "stable-component",
      name: "length",
      value: 80,
    },
    { state: seeded.state },
  );
  assert(changed.ok && changed.data?.value === 80, JSON.stringify(changed));
  assert(changed.data?.component_id === "stable-component", JSON.stringify(changed));
  const registry = changed.state[Symbol.for("battenmark.eval.object-registry")];
  const component = registry.assemblies[0].components[0];
  assert(component.component_id === "stable-component", JSON.stringify(component));
  assert(component.parameters.find((parameter) => parameter.name === "length")?.value === 80);

  const unknown = await executePublicTool(
    "set_definition_parameter",
    {
      project_id: seeded.projectId,
      assembly_id: "parameter-assembly",
      component_id: "stable-component",
      name: "does_not_exist",
      value: 80,
    },
    { state: changed.state },
  );
  assert(unknown.ok === false && unknown.code === "UNKNOWN_PARAMETER", JSON.stringify(unknown));
  assert(
    unknown.state[Symbol.for("battenmark.eval.object-registry")].assemblies[0].components[0]
      .component_id === "stable-component",
  );
});

await test("I14-feature-and-boolean-references-fail-before-state-mutation", async () => {
  const seeded = await executeProjectSequence("feature-references", [
    ["create_box", { name: "Outer", length_mm: 77, width_mm: 57, height_mm: 15.5 }],
    ["create_box", { name: "Cavity", length_mm: 73, width_mm: 53, height_mm: 13.5 }],
  ]);
  const [outer, cavity] = seeded.output.slice(1).map((entry) => entry.result.data);
  const sketch = await executePublicTool(
    "create_sketch",
    { project_id: seeded.projectId, body_id: outer.body_id, name: "USB Opening", plane: "YZ" },
    { state: seeded.state },
  );
  assert(sketch.ok && sketch.data?.id, JSON.stringify(sketch));
  const beforeRegistry = sketch.state[Symbol.for("battenmark.eval.object-registry")];
  const beforeFeatures = beforeRegistry.features.length;
  const attempts = [
    ["create_sketch", { body_id: "missing-body" }, "UNKNOWN_BODY"],
    [
      "add_rectangle",
      { sketch_id: "missing-sketch", x_mm: 0, y_mm: 0, width_mm: 12, height_mm: 6 },
      "UNKNOWN_FEATURE",
    ],
    [
      "add_rectangle",
      { sketch_id: outer.id, x_mm: 0, y_mm: 0, width_mm: 12, height_mm: 6 },
      "INVALID_REFERENCE",
    ],
    ["pocket", { sketch_id: "sketch_1", depth_mm: 2 }, "UNKNOWN_FEATURE"],
    ["pocket", { sketch_id: sketch.data.id, depth_mm: 2 }, "EMPTY_SKETCH"],
    [
      "boolean_cut",
      { target_body_id: "missing-target", tool_body_id: cavity.body_id },
      "UNKNOWN_BODY",
    ],
    [
      "boolean_cut",
      { target_body_id: outer.body_id, tool_body_id: "missing-tool" },
      "UNKNOWN_BODY",
    ],
    [
      "boolean",
      { target_body_id: outer.body_id, tool_body_id: outer.body_id, operation: "subtract" },
      "INVALID_REFERENCE",
    ],
  ];
  for (const [name, args, code] of attempts) {
    const result = await executePublicTool(
      name,
      { project_id: seeded.projectId, ...args },
      { state: sketch.state },
    );
    assert(result.ok === false && result.code === code, `${name}: ${JSON.stringify(result)}`);
    const registry = result.state[Symbol.for("battenmark.eval.object-registry")];
    assert(registry.features.length === beforeFeatures, `${name} mutated feature state`);
    assert(result.state.feature_applied !== true, `${name} set feature_applied`);
    assert(result.state.artifact_exported !== true, `${name} set artifact_exported`);
  }
});

await test("I15-full-enclosure-chain-uses-only-returned-identities", async () => {
  let phase = 0;
  let projectId;
  let outerBodyId;
  let cavityBodyId;
  let sketchId;
  const provider = {
    id: "mock",
    async run(request) {
      phase += 1;
      if (phase === 1)
        return { toolCalls: [{ name: "project_create", args: { name: "eval-enclosure" } }] };
      const { payload } = parseLastToolResults(request);
      if (phase === 2) {
        projectId = resultFor(payload, "project_create").data?.project_id;
        assert(projectId, JSON.stringify(payload));
        return {
          toolCalls: [
            ["pcb_length", 70],
            ["pcb_width", 50],
            ["pcb_height", 12],
            ["clearance", 1.5],
            ["wall", 2],
          ].map(([name, value]) => ({
            name: "define_parameter",
            args: { project_id: projectId, name, value },
          })),
        };
      }
      if (phase === 3) {
        assert(
          payload.results.every((result) => result.ok),
          JSON.stringify(payload),
        );
        return {
          toolCalls: [
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Outer Shell",
                length_mm: 77,
                width_mm: 57,
                height_mm: 15.5,
              },
            },
            {
              name: "create_box",
              args: {
                project_id: projectId,
                name: "Main Cavity",
                length_mm: 73,
                width_mm: 53,
                height_mm: 13.5,
                origin: { x: 2, y: 2, z: 2 },
              },
            },
          ],
        };
      }
      if (phase === 4) {
        [outerBodyId, cavityBodyId] = payload.results.map((result) => result.data?.body_id);
        assert(
          outerBodyId && cavityBodyId && outerBodyId !== cavityBodyId,
          JSON.stringify(payload),
        );
        return {
          toolCalls: [
            {
              name: "boolean_cut",
              args: {
                project_id: projectId,
                target_body_id: outerBodyId,
                tool_body_id: cavityBodyId,
                name: "Main Cavity Cut",
              },
            },
          ],
        };
      }
      if (phase === 5) {
        const cut = resultFor(payload, "boolean_cut");
        assert(
          cut.data?.target_body_id === outerBodyId && cut.data?.tool_body_id === cavityBodyId,
          JSON.stringify(cut),
        );
        return {
          toolCalls: [
            {
              name: "create_sketch",
              args: {
                project_id: projectId,
                body_id: outerBodyId,
                name: "USB Opening",
                plane: "YZ",
              },
            },
          ],
        };
      }
      if (phase === 6) {
        sketchId = resultFor(payload, "create_sketch").data?.id;
        assert(sketchId, JSON.stringify(payload));
        return {
          toolCalls: [
            {
              name: "add_rectangle",
              args: {
                project_id: projectId,
                sketch_id: sketchId,
                x_mm: 0,
                y_mm: 3,
                width_mm: 12,
                height_mm: 6,
              },
            },
          ],
        };
      }
      if (phase === 7) {
        const rectangle = resultFor(payload, "add_rectangle");
        assert(
          rectangle.data?.sketch_id === sketchId && rectangle.data?.profile_count === 1,
          JSON.stringify(rectangle),
        );
        return {
          toolCalls: [
            {
              name: "pocket",
              args: {
                project_id: projectId,
                sketch_id: sketchId,
                depth_mm: 2,
                name: "USB Opening Pocket",
              },
            },
          ],
        };
      }
      if (phase === 8) {
        const pocket = resultFor(payload, "pocket");
        assert(
          pocket.data?.sketch_id === sketchId && pocket.data?.body_id === outerBodyId,
          JSON.stringify(pocket),
        );
        return {
          toolCalls: [
            { name: "validate", args: { project_id: projectId } },
            { name: "render_preview", args: { project_id: projectId } },
            { name: "export_step", args: { project_id: projectId, body_id: outerBodyId } },
          ],
        };
      }
      if (phase === 9) {
        assert(
          payload.results.every((result) => result.ok),
          JSON.stringify(payload),
        );
        return { output: "Enclosure completed using returned public identities.", toolCalls: [] };
      }
      throw new Error(`unexpected enclosure phase ${phase}`);
    },
  };
  const row = await runAgentLoop({
    scenarioId: "enclosure",
    condition: "with-skill",
    provider,
    config: config(),
  });
  assert(row.termination === "model_stop", `termination=${row.termination}`);
  for (const check of [
    "project_created",
    "measurements_as_parameters",
    "outer_shell_created",
    "cavity_present",
    "opening_present",
    "validated",
    "preview_rendered",
    "artifact_exported",
    "public_ops_only",
  ])
    assert(row.checks[check] === true, `${check}=${row.checks[check]}`);
  assert(row.hard_failures.length === 0, JSON.stringify(row.hard_failures));
});

const failed = results.filter((result) => !result.passed).length;
console.log(
  `\n${results.length - failed}/${results.length} Phase 7C.7 identity-integrity tests passed`,
);
if (failed) process.exit(1);
