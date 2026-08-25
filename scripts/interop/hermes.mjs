#!/usr/bin/env node
// Phase 7A — Hermes interoperability verification wrapper (manual mode).
// Requires an external pinned Hermes checkout + venv; see scripts/interop/README.md.
// Skips cleanly when HERMES_REPO is not configured.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const hermesRepo = process.env.HERMES_REPO;
if (!hermesRepo || !fs.existsSync(hermesRepo)) {
  console.log("SKIP: HERMES_REPO not set — pinned Hermes checkout required (see scripts/interop/donors.json + README.md)");
  process.exit(0);
}
const venvPython = path.join(hermesRepo, ".venv", "bin", "python");
if (!fs.existsSync(venvPython)) {
  console.log(`SKIP: no .venv in HERMES_REPO (${hermesRepo}). Run 'uv sync --extra mcp' there first.`);
  process.exit(0);
}
const driver = path.join(path.dirname(new URL(import.meta.url).pathname), "hermes-direct-driver.py");
const res = spawnSync(venvPython, [driver], { stdio: "inherit", env: process.env });
process.exit(res.status ?? 1);
