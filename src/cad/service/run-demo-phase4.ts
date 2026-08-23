/**
 * Phase 4 demo: box → preview PNGs → STEP export → import into a second project.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";

async function main() {
  const workspace = process.env.AGENTCAD_WORKSPACE || mkdtempSync(join(tmpdir(), "agentcad-demo4-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  const service = resetAgentCadService();

  const created = service.createProject({ name: "preview-plate" });
  const projectId = created.project_id!;
  await service.executeTool("define_parameter", { project_id: projectId, name: "length", value: 80 });
  await service.executeTool("define_parameter", { project_id: projectId, name: "width", value: 50 });
  await service.executeTool("define_parameter", { project_id: projectId, name: "height", value: 12 });
  await service.executeTool("create_box", {
    project_id: projectId,
    length_mm: "length",
    width_mm: "width",
    height_mm: "height",
    name: "Blank",
  });
  const preview = await service.renderPreview(projectId, { view: "all" });
  const views = ((preview.data as { views?: Array<{ view: string; artifact_id: string; bytes: number }> })?.views) || [];
  for (const v of views) process.stdout.write(`preview ${v.view} ${v.artifact_id} ${v.bytes} bytes\n`);

  const step = await service.exportArtifact(projectId, "step");
  process.stdout.write(`export step ${step.ok ? (step.data as { artifact_id: string }).artifact_id : step.error?.error}\n`);

  if (step.ok) {
    const art = service.getArtifactFile((step.data as { artifact_id: string }).artifact_id);
    const incoming = service.createProject({ name: "imported-plate" });
    const imported = await service.executeTool("import_step", {
      project_id: incoming.project_id,
      path: art.path,
      name: "Plate",
    });
    process.stdout.write(
      `import ${imported.ok ? "ok" : imported.error?.error} volume=${(imported.data as { volume_mm3?: number })?.volume_mm3}\n`,
    );
  }

  process.stdout.write(`\nPhase 4 demo project_id=${projectId} workspace=${workspace}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
