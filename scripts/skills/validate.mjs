#!/usr/bin/env node
import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "../..");
const SKILLS_DIR = join(ROOT, "skills");

const REQUIRED_MD_HEADINGS = [
  "## Purpose", "## Use when", "## Do not use when", "## Preconditions",
  "## Planning rules", "## Recommended operation sequence",
  "## Geometry / mechanical rules", "## Verification gates",
  "## Failure recovery", "## Outputs", "## Platform notes", "## Examples",
];
const REQUIRED_JSON_FIELDS = [
  "id", "name", "version", "description", "category", "risk_level",
  "recommended_operations", "last_verified_against", "maintainer", "source",
];
const VALID_RISK = new Set(["low", "medium", "high"]);
const VALID_SOURCE = new Set(["built-in", "local", "third-party"]);
const ABSOLUTE_PATH_RE = /(?:^|[\s"'`])(\/(?:Users|home|tmp|var|opt|etc)\/[^\s"'`]+|[A-Za-z]:\\[^\s"'`]+)/;
const SECRET_RE = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]/i;

async function loadToolNames() {
  const schemaUrl = pathToFileURL(join(ROOT, "src/cad/schema.ts")).href;
  const mod = await import(schemaUrl);
  const names = mod.TOOL_NAMES;
  if (!Array.isArray(names) || names.length < 10) throw new Error(`TOOL_NAMES missing (${names?.length})`);
  return new Set(names);
}
async function exists(p) { try { await access(p); return true; } catch { return false; } }
function fail(msg, errors) { errors.push(msg); }

async function validateSkill(dirName, toolNames, errors) {
  if (dirName.startsWith("_")) return;
  const dir = join(SKILLS_DIR, dirName);
  const mdPath = join(dir, "SKILL.md");
  const jsonPath = join(dir, "skill.json");
  if (!(await exists(mdPath))) fail(`[${dirName}] missing SKILL.md`, errors);
  if (!(await exists(jsonPath))) fail(`[${dirName}] missing skill.json`, errors);
  if (!(await exists(mdPath)) || !(await exists(jsonPath))) return;
  let meta;
  try { meta = JSON.parse(await readFile(jsonPath, "utf8")); }
  catch (e) { fail(`[${dirName}] skill.json parse error: ${e.message}`, errors); return; }
  for (const f of REQUIRED_JSON_FIELDS) {
    if (meta[f] === undefined || meta[f] === null || meta[f] === "")
      fail(`[${dirName}] skill.json missing required field: ${f}`, errors);
  }
  if (meta.id !== dirName) fail(`[${dirName}] skill.json id "${meta.id}" does not match directory name`, errors);
  if (meta.risk_level && !VALID_RISK.has(meta.risk_level)) fail(`[${dirName}] invalid risk_level: ${meta.risk_level}`, errors);
  if (meta.source && !VALID_SOURCE.has(meta.source)) fail(`[${dirName}] invalid source: ${meta.source}`, errors);
  const checkOps = (list, label) => {
    if (!Array.isArray(list)) { fail(`[${dirName}] ${label} must be an array`, errors); return; }
    for (const op of list) {
      if (typeof op !== "string" || !toolNames.has(op))
        fail(`[${dirName}] unknown or invalid operation in ${label}: "${op}"`, errors);
    }
  };
  checkOps(meta.recommended_operations, "recommended_operations");
  if (meta.optional_operations) checkOps(meta.optional_operations, "optional_operations");
  const md = await readFile(mdPath, "utf8");
  for (const h of REQUIRED_MD_HEADINGS) {
    if (!md.includes(h)) fail(`[${dirName}] SKILL.md missing required heading: ${h}`, errors);
  }
  if (ABSOLUTE_PATH_RE.test(md) || ABSOLUTE_PATH_RE.test(JSON.stringify(meta)))
    fail(`[${dirName}] possible absolute local path detected`, errors);
  if (SECRET_RE.test(md) || SECRET_RE.test(JSON.stringify(meta)))
    fail(`[${dirName}] possible secret pattern detected`, errors);
}

async function main() {
  const toolNames = await loadToolNames();
  console.log(`Loaded ${toolNames.size} public tool names from schema`);
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const errors = [];
  const ids = new Set();
  for (const name of skillDirs) {
    if (name.startsWith("_")) continue;
    await validateSkill(name, toolNames, errors);
    ids.add(name);
  }
  if (errors.length) {
    console.error("\nSkill validation FAILED:\n");
    for (const e of errors) console.error("  •", e);
    console.error(`\n${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`OK — ${ids.size} skill(s) validated: ${[...ids].sort().join(", ")}`);
}
main().catch((err) => { console.error(err); process.exit(2); });
