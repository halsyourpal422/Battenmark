#!/usr/bin/env node
import { readFile } from "node:fs/promises";
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
const checkpointPath = join(root, "scripts/evals/results/agent-checkpoint.json");
const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));

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

const historicalEnclosure = checkpoint.experiment.scenarios.find(
  (scenario) => scenario.key === "enclosure",
);
const currentSkillHash = sha256Text(enclosure);
const changedExperiment = createExperimentDefinition({
  ...checkpoint.experiment,
  scenarios: checkpoint.experiment.scenarios.map((scenario) =>
    scenario.key === "enclosure" ? { ...scenario, skill_hash: currentSkillHash } : scenario,
  ),
});
check(
  "enclosure skill content hash changed from the preserved experiment",
  historicalEnclosure?.skill_hash ===
    "22a5801c5ea5298b8ac622ca8e82a80c5509ce8679d5d92c5565d35677308f79" &&
    currentSkillHash !== historicalEnclosure.skill_hash,
);
check(
  "changed skill hash changes canonical experiment identity",
  changedExperiment.experiment_id !== checkpoint.experiment_id,
);

let resumeError;
try {
  await runCheckpointedMatrix({
    experiment: changedExperiment,
    matrix: buildMatrix(changedExperiment),
    checkpointPath,
    tracesDir: join(root, "scripts/evals/results/traces"),
    resume: true,
    executeRow: async () => {
      throw new Error("resume mismatch should be rejected before row execution");
    },
  });
} catch (error) {
  resumeError = error;
}
check(
  "preserved checkpoint fails closed under changed skill content",
  resumeError?.code === "CHECKPOINT_EXPERIMENT_MISMATCH",
);

if (failures) {
  console.error(`\n${failures}/${checks} enclosure skill contract checks failed`);
  process.exit(1);
}

console.log(`\n${checks}/${checks} enclosure skill contract checks passed`);
