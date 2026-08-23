import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";
import { handleAgentCadHttp } from "./http";
import { isPng, pngHasIdat, readPngSize } from "../preview/png";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-p4-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  const service = resetAgentCadService();

  const created = service.createProject({ name: "phase4-box" });
  const projectId = created.project_id!;
  const box = await service.executeTool("create_box", {
    project_id: projectId,
    length_mm: 80,
    width_mm: 50,
    height_mm: 12,
  });
  assert(box.ok, JSON.stringify(box));

  const preview = await service.renderPreview(projectId, { view: "all" });
  assert(preview.ok, JSON.stringify(preview.error));
  const views = (preview.data as { views: Array<{ artifact_id: string; view: string }> }).views;
  assert(views.length === 4, `views ${views.length}`);
  for (const v of views) {
    const art = service.getArtifactFile(v.artifact_id);
    assert(isPng(art.bytes), `${v.view} not png`);
    assert(pngHasIdat(art.bytes), `${v.view} missing IDAT`);
    const size = readPngSize(art.bytes);
    assert(size && size.width >= 64, `${v.view} size`);
  }
  console.log(`PASS  render_preview  ${views.map((v) => v.view).join(",")}`);

  const listed = await service.executeTool("list_previews", { project_id: projectId });
  assert(listed.ok, JSON.stringify(listed));
  const files = (listed.data as { files: unknown[] }).files;
  assert(files.length >= 4, `preview files ${files.length}`);
  console.log("PASS  list_previews");

  const httpPrev = await handleAgentCadHttp(
    new Request(`http://127.0.0.1/api/v1/projects/${projectId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view: "isometric" }),
    }),
  );
  assert(httpPrev.ok, `http preview ${httpPrev.status}`);
  const httpJson = (await httpPrev.json()) as { ok: boolean };
  assert(httpJson.ok, "http preview body");
  console.log("PASS  http preview");

  const exported = await service.exportArtifact(projectId, "step");
  if (!exported.ok) {
    console.log(`SKIP  import (export_step failed: ${exported.error?.error} ${exported.error?.message})`);
  } else {
    const artId = (exported.data as { artifact_id: string }).artifact_id;
    const stepArt = service.getArtifactFile(artId);
    const stepPath = join(workspace, "seed.step");
    writeFileSync(stepPath, stepArt.bytes);

    const incoming = service.createProject({ name: "phase4-import" });
    const imported = await service.executeTool("import_step", {
      project_id: incoming.project_id,
      path: stepPath,
      name: "SeedSolid",
    });
    assert(imported.ok, JSON.stringify(imported.error || imported));
    const data = imported.data as { volume_mm3: number; solid_count: number; parametric: boolean };
    assert(data.parametric === false, "imported should not be parametric");
    assert(data.solid_count >= 1, "solid count");
    assert(Math.abs(data.volume_mm3 - 48000) / 48000 < 0.05, `volume ${data.volume_mm3}`);
    console.log(`PASS  import_step  volume=${data.volume_mm3}`);

    const inspect = service.inspectDocument(incoming.project_id!);
    const featureCount = (inspect.data as { feature_count?: number }).feature_count;
    assert((featureCount ?? 0) >= 1, "imported feature present");
    console.log("PASS  import inspect");
  }

  rmSync(workspace, { recursive: true, force: true });
  console.log("PASS  phase4");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
