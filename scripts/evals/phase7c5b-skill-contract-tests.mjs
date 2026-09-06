#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_NAMES } from "../../src/cad/schema.ts";
import {
  buildMatrix,
  createExperimentDefinition,
  runCheckpointedMatrix,
  sha256Text,
} from "./checkpoint.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const enclosurePath = join(root, "skills/enclosure/SKILL.md");
const enclosure = await readFile(enclosurePath, "utf8");
const toolNames = new Set(TOOL_NAMES);
const historicalSkillHash = "22a5801c5ea5298b8ac622ca8e82a80c5509ce8679d5d92c5565d35677308f79";
const historicalExperiment = createExperimentDefinition({
  battenmark_sha: "0f3aa05307e5130af36078d2b151fe93539438c9",
  provider: "openai-compatible",
  model: "gpt-4o",
  temperature: 0,
  max_output_tokens: 4096,
  conditions: ["no-skill", "with-skill"],
  repetitions: 3,
  agent_turn_budget: 12,
  tool_catalog_hash: "phase7c5b-contract-fixture",
  evaluation_semantics: "battenmark.phase7c.backend-recovery.v2",
  trace_schema_version: "none",
  enclosure_scorer_semantics: "battenmark.phase7c.enclosure-scorer.v2",
  scenarios: [
    {
      key: "enclosure",
      id: "enclosure-001",
      scenario_hash: "phase7c5b-enclosure-scenario",
      skill: "enclosure",
      skill_hash: historicalSkillHash,
    },
  ],
});

let failures = 0;
let checks = 0;

function check(label, predicate) {
  checks += 1;
  if (predicate) {
    console.log(`PASS: ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${label}`);
  }
}

check(
  "main cavity is explicitly independent from connector openings",
  /main internal cavity[^\n]*(?:independent|separate)[^\n]*connector opening/i.test(enclosure),
);
check(
  "cavity uses a distinct create_box tool and subtract boolean",
  /distinct cavity tool[^\n]*`create_box`[\s\S]*?`boolean`[^\n]*`subtract`/i.test(enclosure),
);
check(
  "cavity dimensions derive from clearance and preserve walls and floor",
  /derive[^\n]*cavity[^\n]*clearance/i.test(enclosure) &&
    /cavity depth[^\n]*floor/i.test(enclosure) &&
    /wall[^\n]*floor thickness/i.test(enclosure),
);

const cavityStep = enclosure.indexOf("Create and verify the main internal cavity");
const connectorStep = enclosure.indexOf(
  "Create connector openings as separate downstream features",
);
check("cavity creation precedes connector openings", cavityStep >= 0 && connectorStep > cavityStep);
check(
  "completion gate requires both subtractive feature classes",
  /Before final validation and export[^\n]*confirm/i.test(enclosure) &&
    /outer body exists[\s\S]*main internal cavity exists[\s\S]*connector openings exist independently/i.test(
      enclosure,
    ),
);
check(
  "required enclosure workflow operations are live public tools",
  [
    "project_create",
    "project_open",
    "create_box",
    "boolean",
    "create_sketch",
    "add_rectangle",
    "pocket",
    "validate",
    "render_preview",
    "rebuild",
    "export_step",
    "export_fcstd",
  ].every((name) => toolNames.has(name)),
);
check(
  "validation, preview, rebuild, and export guidance remains required",
  /\*\*REQUIRED\*\*[^\n]*`validate`[^\n]*`render_preview`[^\n]*`rebuild`[^\n]*export/i.test(
    enclosure,
  ),
);

const historicalEnclosure = historicalExperiment.scenarios.find(
  (scenario) => scenario.key === "enclosure",
);
const currentSkillHash = sha256Text(enclosure);
const changedExperiment = createExperimentDefinition({
  ...historicalExperiment,
  scenarios: historicalExperiment.scenarios.map((scenario) =>
    scenario.key === "enclosure" ? { ...scenario, skill_hash: currentSkillHash } : scenario,
  ),
});
check(
  "enclosure skill content hash changed from the preserved experiment",
  historicalEnclosure?.skill_hash === historicalSkillHash &&
    currentSkillHash !== historicalEnclosure.skill_hash,
);
check(
  "changed skill hash changes canonical experiment identity",
  changedExperiment.experiment_id !== historicalExperiment.experiment_id,
);

let resumeError;
const tempDirectory = await mkdtemp(join(tmpdir(), "battenmark-phase7c5b-contract-"));
const checkpointPath = join(tempDirectory, "agent-checkpoint.json");
try {
  let rows = 0;
  try {
    await runCheckpointedMatrix({
      experiment: historicalExperiment,
      matrix: buildMatrix(historicalExperiment),
      checkpointPath,
      resume: false,
      executeRow: async (entry) => {
        rows += 1;
        if (rows > 1) throw new Error("fixture seeded");
        return {
          schema: "battenmark.eval.agent.v1",
          matrix_key: entry.matrix_key,
          scenario_id: entry.scenario_id,
          skill: entry.skill,
          condition: entry.condition,
          provider: historicalExperiment.provider,
          model: historicalExperiment.model,
          temperature: historicalExperiment.temperature,
          run: entry.run,
          score: 92,
          verdict: "PASS",
          termination: "model_stop",
          execution_mode: "real-agent",
          evaluation_semantics: historicalExperiment.evaluation_semantics,
        };
      },
    });
  } catch (error) {
    if (error.message !== "fixture seeded") throw error;
  }
  await runCheckpointedMatrix({
    experiment: changedExperiment,
    matrix: buildMatrix(changedExperiment),
    checkpointPath,
    resume: true,
    executeRow: async () => {
      throw new Error("resume mismatch should be rejected before row execution");
    },
  });
} catch (error) {
  resumeError = error;
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
check(
  "historical checkpoint fixture fails closed under changed skill content",
  resumeError?.code === "CHECKPOINT_EXPERIMENT_MISMATCH",
);

if (failures) {
  console.error(`\n${failures}/${checks} enclosure skill contract checks failed`);
  process.exit(1);
}

console.log(`\n${checks}/${checks} enclosure skill contract checks passed`);
