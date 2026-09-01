#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let checkpointApi = {};
let importError;
try {
  checkpointApi = await import("./checkpoint.mjs");
} catch (err) {
  importError = err;
}

const out = [];
function assert(cond, message) {
  if (!cond) throw new Error(message);
}
async function test(id, fn) {
  try {
    await fn();
    out.push({ id, passed: true });
    console.log(`PASS ${id}`);
  } catch (err) {
    out.push({ id, passed: false });
    console.log(`FAIL ${id} ${err instanceof Error ? err.message : err}`);
  }
}
function requireApi(...names) {
  if (importError)
    throw new Error(`checkpoint module unavailable: ${importError.code || importError.message}`);
  for (const name of names)
    assert(typeof checkpointApi[name] === "function", `missing checkpoint API ${name}`);
}
function experiment(overrides = {}) {
  requireApi("createExperimentDefinition");
  return checkpointApi.createExperimentDefinition({
    battenmark_sha: "sha-a",
    provider: "openai-compatible",
    model: "gpt-4o",
    temperature: 0,
    max_output_tokens: 4096,
    conditions: ["no-skill", "with-skill"],
    repetitions: 3,
    agent_turn_budget: 12,
    tool_catalog_hash: "tools-a",
    scenarios: [
      {
        key: "assembly",
        id: "assembly-planar-001",
        scenario_hash: "scenario-a",
        skill: "assembly",
        skill_hash: "skill-a",
      },
      {
        key: "enclosure",
        id: "enclosure-001",
        scenario_hash: "scenario-e",
        skill: "enclosure",
        skill_hash: "skill-e",
      },
      {
        key: "backend-diagnostics",
        id: "backend-diagnostics-001",
        scenario_hash: "scenario-b",
        skill: "backend-diagnostics",
        skill_hash: "skill-b",
      },
    ],
    ...overrides,
  });
}
function row(entry, extra = {}) {
  return {
    schema: "battenmark.eval.agent.v1",
    matrix_key: entry.matrix_key,
    scenario_id: entry.scenario_id,
    skill: entry.skill,
    condition: entry.condition,
    provider: "openai-compatible",
    model: "gpt-4o",
    temperature: 0,
    run: entry.run,
    score: 80,
    verdict: "PASS",
    execution_mode: "real-agent",
    evaluation_semantics: "battenmark.phase7c.backend-recovery.v1",
    termination: "model_stop",
    ...extra,
  };
}
async function tempCheckpoint(fn) {
  const dir = await mkdtemp(join(tmpdir(), "battenmark-checkpoint-"));
  try {
    return await fn({
      dir,
      path: join(dir, "agent-checkpoint.json"),
      summaryPath: join(dir, "agent-summary.json"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function seedThreeThenFail({ path, exp = experiment() }) {
  requireApi("buildMatrix", "runCheckpointedMatrix");
  const matrix = checkpointApi.buildMatrix(exp);
  let calls = 0;
  try {
    await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: false,
      executeRow: async (entry) => {
        calls++;
        if (calls === 4) throw new Error("provider failed");
        return row(entry);
      },
    });
    throw new Error("expected fourth-row failure");
  } catch (err) {
    if (err.message !== "provider failed") throw err;
  }
  return { exp, matrix };
}

await test("checkpoint-row-persists-immediately", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("buildMatrix", "runCheckpointedMatrix", "readCheckpoint");
    const exp = experiment({
      conditions: ["no-skill"],
      repetitions: 1,
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
    const matrix = checkpointApi.buildMatrix(exp);
    await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: false,
      executeRow: async (entry) => row(entry),
    });
    const saved = await checkpointApi.readCheckpoint(path);
    assert(saved.completed_rows.length === 1, JSON.stringify(saved));
  }));

await test("checkpoint-three-rows-survive-fourth-failure", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("readCheckpoint");
    await seedThreeThenFail({ path });
    const saved = await checkpointApi.readCheckpoint(path);
    assert(saved.completed_rows.length === 3, `saved ${saved.completed_rows.length}`);
  }));

await test("checkpoint-resume-skips-completed", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("runCheckpointedMatrix");
    const { exp, matrix } = await seedThreeThenFail({ path });
    const called = [];
    const result = await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: true,
      executeRow: async (entry) => {
        called.push(entry.matrix_key);
        return row(entry);
      },
    });
    assert(called.length === 15, `executed ${called.length}`);
    assert(
      !called.includes(matrix[0].matrix_key) && !called.includes(matrix[2].matrix_key),
      "completed row reran",
    );
    assert(result.rows.length === 18, `returned ${result.rows.length}`);
  }));

await test("checkpoint-final-has-18-unique-rows", () =>
  tempCheckpoint(async ({ path }) => {
    const { exp, matrix } = await seedThreeThenFail({ path });
    const result = await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: true,
      executeRow: async (entry) => row(entry),
    });
    assert(result.rows.length === 18, `rows=${result.rows.length}`);
    assert(
      new Set(result.rows.map((item) => item.matrix_key)).size === 18,
      "duplicate/missing matrix keys",
    );
  }));

for (const [id, mutate] of [
  [
    "checkpoint-commit-mismatch-fails-closed",
    (base) => experiment({ ...base, battenmark_sha: "sha-b" }),
  ],
  [
    "checkpoint-model-mismatch-fails-closed",
    (base) => experiment({ ...base, model: "different-model" }),
  ],
  [
    "checkpoint-skill-hash-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        scenarios: base.scenarios.map((s, i) => (i ? s : { ...s, skill_hash: "changed" })),
      }),
  ],
  [
    "checkpoint-scenario-hash-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        scenarios: base.scenarios.map((s, i) => (i ? s : { ...s, scenario_hash: "changed" })),
      }),
  ],
  [
    "checkpoint-backend-scenario-hash-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        scenarios: base.scenarios.map((scenario) =>
          scenario.key === "backend-diagnostics"
            ? { ...scenario, scenario_hash: "changed-backend" }
            : scenario,
        ),
      }),
  ],
  [
    "checkpoint-evaluation-semantics-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        evaluation_semantics: "battenmark.phase7c.backend-recovery.v2",
      }),
  ],
  [
    "checkpoint-enclosure-scorer-semantics-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        enclosure_scorer_semantics: "battenmark.phase7c.enclosure-scorer.v2",
      }),
  ],
  [
    "checkpoint-trace-schema-mismatch-fails-closed",
    (base) =>
      experiment({
        ...base,
        trace_schema_version: "battenmark.eval.trace.v0",
      }),
  ],
]) {
  await test(id, () =>
    tempCheckpoint(async ({ path }) => {
      const { exp, matrix } = await seedThreeThenFail({ path });
      let calls = 0;
      const changed = mutate(exp);
      try {
        await checkpointApi.runCheckpointedMatrix({
          experiment: changed,
          matrix: checkpointApi.buildMatrix(changed),
          checkpointPath: path,
          resume: true,
          executeRow: async (entry) => {
            calls++;
            return row(entry);
          },
        });
        throw new Error("expected mismatch");
      } catch (err) {
        assert(err.code === "CHECKPOINT_EXPERIMENT_MISMATCH", `code=${err.code} ${err.message}`);
        assert(calls === 0, `provider called ${calls} times`);
        assert(matrix.length === 18, "seed matrix changed");
      }
    }),
  );
}

await test("checkpoint-frozen-config-mismatch-fails-closed", () =>
  tempCheckpoint(async ({ path }) => {
    const { exp } = await seedThreeThenFail({ path });
    for (const changed of [
      experiment({ ...exp, temperature: 0.2 }),
      experiment({ ...exp, max_output_tokens: 2048 }),
      experiment({ ...exp, repetitions: 2 }),
    ]) {
      let calls = 0;
      try {
        await checkpointApi.runCheckpointedMatrix({
          experiment: changed,
          matrix: checkpointApi.buildMatrix(changed),
          checkpointPath: path,
          resume: true,
          executeRow: async () => {
            calls++;
          },
        });
        throw new Error("expected frozen config mismatch");
      } catch (err) {
        assert(err.code === "CHECKPOINT_EXPERIMENT_MISMATCH", `code=${err.code}`);
        assert(calls === 0, `provider called ${calls} times`);
      }
    }
  }));

await test("checkpoint-corrupt-file-fails-closed", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("runCheckpointedMatrix", "buildMatrix");
    await writeFile(path, "{not-json", "utf8");
    const exp = experiment();
    let calls = 0;
    try {
      await checkpointApi.runCheckpointedMatrix({
        experiment: exp,
        matrix: checkpointApi.buildMatrix(exp),
        checkpointPath: path,
        resume: true,
        executeRow: async () => {
          calls++;
        },
      });
      throw new Error("expected corrupt checkpoint failure");
    } catch (err) {
      assert(err.code === "CHECKPOINT_CORRUPT", `code=${err.code}`);
      assert(calls === 0, `provider called ${calls} times`);
    }
  }));

await test("checkpoint-duplicate-key-rejected", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("readCheckpoint", "atomicWriteCheckpoint", "runCheckpointedMatrix");
    const { exp, matrix } = await seedThreeThenFail({ path });
    const saved = await checkpointApi.readCheckpoint(path);
    saved.completed_rows.push({ ...saved.completed_rows[0] });
    await checkpointApi.atomicWriteCheckpoint(path, saved);
    let calls = 0;
    try {
      await checkpointApi.runCheckpointedMatrix({
        experiment: exp,
        matrix,
        checkpointPath: path,
        resume: true,
        executeRow: async () => {
          calls++;
        },
      });
      throw new Error("expected duplicate failure");
    } catch (err) {
      assert(err.code === "CHECKPOINT_DUPLICATE_MATRIX_KEY", `code=${err.code}`);
      assert(calls === 0, `provider called ${calls} times`);
    }
  }));

await test("checkpoint-excludes-environment-secret", () =>
  tempCheckpoint(async ({ path }) => {
    const secret = "sk-checkpoint-secret-must-not-leak";
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = secret;
    try {
      const exp = experiment({
        conditions: ["no-skill"],
        repetitions: 1,
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
      await checkpointApi.runCheckpointedMatrix({
        experiment: exp,
        matrix: checkpointApi.buildMatrix(exp),
        checkpointPath: path,
        resume: false,
        executeRow: async (entry) => row(entry, { api_key: secret }),
      });
      assert(!(await readFile(path, "utf8")).includes(secret), "secret persisted in checkpoint");
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  }));

await test("checkpoint-final-summary-requires-complete-matrix", () =>
  tempCheckpoint(async ({ path }) => {
    requireApi("finalizeCheckpoint", "readCheckpoint");
    const exp = experiment();
    const matrix = checkpointApi.buildMatrix(exp);
    let calls = 0;
    try {
      await checkpointApi.runCheckpointedMatrix({
        experiment: exp,
        matrix,
        checkpointPath: path,
        resume: false,
        executeRow: async (entry) => {
          calls++;
          if (calls === 18) throw new Error("stop at 17");
          return row(entry);
        },
      });
    } catch (err) {
      if (err.message !== "stop at 17") throw err;
    }
    let summaries = 0;
    const partial = await checkpointApi.readCheckpoint(path);
    try {
      await checkpointApi.finalizeCheckpoint({
        checkpointPath: path,
        checkpoint: partial,
        matrix,
        writeSummary: async () => {
          summaries++;
        },
      });
      throw new Error("expected incomplete checkpoint failure");
    } catch (err) {
      assert(err.code === "CHECKPOINT_INCOMPLETE", `code=${err.code}`);
      assert(summaries === 0, "partial summary written");
    }
    const complete = await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: true,
      executeRow: async (entry) => row(entry),
    });
    await checkpointApi.finalizeCheckpoint({
      checkpointPath: path,
      checkpoint: complete.checkpoint,
      matrix,
      writeSummary: async (rows) => {
        summaries++;
        assert(rows.length === 18, `summary rows=${rows.length}`);
      },
    });
    assert(summaries === 1, `summaries=${summaries}`);
    assert(
      (await checkpointApi.readCheckpoint(path)).status === "complete",
      "checkpoint not marked complete",
    );
  }));

await test("checkpoint-fresh-run-replaces-stale-rows", () =>
  tempCheckpoint(async ({ path }) => {
    const { exp, matrix } = await seedThreeThenFail({ path });
    let calls = 0;
    const result = await checkpointApi.runCheckpointedMatrix({
      experiment: exp,
      matrix,
      checkpointPath: path,
      resume: false,
      executeRow: async (entry) => {
        calls++;
        return row(entry, { score: 81 });
      },
    });
    assert(calls === 18, `fresh run skipped ${18 - calls} rows`);
    assert(
      result.rows.every((item) => item.score === 81),
      "stale row contaminated fresh run",
    );
  }));

const failed = out.filter((item) => !item.passed).length;
console.log(`\n${out.length - failed}/${out.length} checkpoint/resume tests passed`);
if (failed) process.exit(1);
