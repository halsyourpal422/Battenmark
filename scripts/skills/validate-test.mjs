#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "../..");
const SKILLS = join(ROOT, "skills");

function runValidate() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "scripts/skills/validate.mjs"], {
      cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function main() {
  const target = join(SKILLS, "basic-part", "skill.json");
  const original = await readFile(target, "utf8");
  let failures = 0;

  {
    const j = JSON.parse(original);
    j.recommended_operations = [...j.recommended_operations, "create_magic_widget"];
    await writeFile(target, JSON.stringify(j, null, 2));
    const { code, out } = await runValidate();
    if (code === 0 || !out.includes("create_magic_widget")) {
      console.error("FAIL: expected rejection of unknown operation"); failures++;
    } else console.log("PASS: unknown operation rejected");
    await writeFile(target, original);
  }
  {
    const mdPath = join(SKILLS, "basic-part", "SKILL.md");
    const mdOrig = await readFile(mdPath, "utf8");
    await writeFile(mdPath, mdOrig.replace("## Verification gates\n", "## Verification (intentionally broken)\n"));
    const { code, out } = await runValidate();
    if (code === 0 || !/Verification gates/.test(out)) {
      console.error("FAIL: expected rejection of missing heading"); failures++;
    } else console.log("PASS: missing heading rejected");
    await writeFile(mdPath, mdOrig);
  }
  {
    const { code } = await runValidate();
    if (code !== 0) { console.error("FAIL: clean tree should pass"); failures++; }
    else console.log("PASS: clean tree accepted");
  }
  {
    const j = JSON.parse(original);
    j.id = "not-the-directory";
    await writeFile(target, JSON.stringify(j, null, 2));
    const { code, out } = await runValidate();
    if (code === 0 || !out.includes("does not match directory")) {
      console.error("FAIL: expected id/directory mismatch rejection"); failures++;
    } else console.log("PASS: id/directory mismatch rejected");
    await writeFile(target, original);
  }
  if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
  console.log("\nAll skill validator mutation tests passed");
}
main().catch((e) => { console.error(e); process.exit(2); });
