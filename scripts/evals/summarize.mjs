#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { interpretDelta } from "./score.mjs";

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function isLayerBEvidence(row, payloadMeta = {}) {
  const provider = row?.provider ?? payloadMeta.provider;
  const mode = row?.execution_mode ?? payloadMeta.execution_mode ?? payloadMeta.kind;
  return mode === "real-agent" && typeof provider === "string" && provider !== "mock";
}

export function summarizeRuns(runs) {
  const byScenario = {};
  for (const r of runs) {
    byScenario[r.scenario_id] ??= { "no-skill": [], "with-skill": [] };
    byScenario[r.scenario_id][r.condition]?.push(r);
  }
  const rows = [];
  for (const [scenario, groups] of Object.entries(byScenario)) {
    const base = mean(groups["no-skill"].map((r) => r.score));
    const skill = mean(groups["with-skill"].map((r) => r.score));
    const delta = skill - base;
    rows.push({
      scenario,
      baseline_mean: Number(base.toFixed(2)),
      skill_mean: Number(skill.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      classification: interpretDelta(delta),
      baseline_n: groups["no-skill"].length,
      skill_n: groups["with-skill"].length,
    });
  }
  return rows;
}

export function summarizeLayerB(runs, payloadMeta = {}) {
  return summarizeRuns(runs.filter((r) => isLayerBEvidence(r, payloadMeta)));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("usage: node scripts/evals/summarize.mjs <agent-results.json>");
    process.exit(2);
  }
  const payload = JSON.parse(await readFile(file, "utf8"));
  const runs = payload.results || payload;
  const layerB = summarizeLayerB(Array.isArray(runs) ? runs : [], payload);
  console.log(JSON.stringify({
    execution_mode: payload.execution_mode || payload.kind,
    provider: payload.provider,
    layer_b_rows: (Array.isArray(runs) ? runs : []).filter((r) => isLayerBEvidence(r, payload)).length,
    summary: layerB,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
