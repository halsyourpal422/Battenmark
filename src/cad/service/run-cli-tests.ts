import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run(args: string[], workspace: string) {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.json", "src/cad/cli/main.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AGENTCAD_WORKSPACE: workspace },
  });
  return result;
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-cli-"));
  const status = run(["status", "--json"], workspace);
  assert(status.status === 0, `status exit ${status.status} ${status.stderr}`);
  const statusJson = JSON.parse(status.stdout);
  assert(statusJson.ok, status.stdout);

  const created = run(["project", "create", "cli-bracket", "--json"], workspace);
  assert(created.status === 0, created.stderr + created.stdout);
  const proj = JSON.parse(created.stdout) as { project_id: string };
  assert(proj.project_id, created.stdout);

  const box = run(
    ["box", "--project", proj.project_id, "--length", "80", "--width", "50", "--height", "12", "--json"],
    workspace,
  );
  assert(box.status === 0, box.stderr + box.stdout);
  const boxJson = JSON.parse(box.stdout);
  assert(boxJson.ok, box.stdout);

  const validated = run(["validate", "--project", proj.project_id, "--json"], workspace);
  assert(validated.status === 0, validated.stderr + validated.stdout);
  const v = JSON.parse(validated.stdout);
  assert(v.ok, validated.stdout);

  const listed = run(["project", "list", "--json"], workspace);
  assert(listed.status === 0, listed.stderr);
  assert(JSON.parse(listed.stdout).ok, listed.stdout);

  console.log(`PASS  cli  project=${proj.project_id}`);
  rmSync(workspace, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
