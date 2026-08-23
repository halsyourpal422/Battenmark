import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-persist-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  let service = resetAgentCadService();
  const created = service.createProject({ name: "survive" });
  await service.executeTool("define_parameter", { project_id: created.project_id, name: "length", value: 80 });
  await service.executeTool("create_box", {
    project_id: created.project_id,
    length_mm: "length",
    width_mm: 50,
    height_mm: 12,
    name: "Plate",
  });
  const before = service.inspectDocument(created.project_id!);
  const features = (before.data as { feature_count: number }).feature_count;
  assert(features === 1, `features ${features}`);

  service = resetAgentCadService();
  const opened = service.openProject(created.project_id!);
  assert(opened.ok, JSON.stringify(opened.error));
  const after = service.inspectDocument(created.project_id!);
  const data = after.data as { feature_count: number; parameters: { name: string; value: number }[] };
  assert(data.feature_count === 1, "lost features after restart");
  assert(data.parameters.some((p) => p.name === "length" && p.value === 80), "lost params");
  console.log("PASS  persist  project survived service restart");
  rmSync(workspace, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
