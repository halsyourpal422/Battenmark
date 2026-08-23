/**
 * Phase 6 authoritative assembly proof through the real FreeCAD worker:
 * L-bracket build/inspect, pin-in-hole concentric, FCStd + STEP export,
 * FCStd reopen, and worker-restart persistence of assembly state.
 */
import { emptyDocument } from "../document";
import { applyAll } from "../operations";
import { buildAssemblyAuthoritative, exportAssemblyAuthoritative } from "./assembly.server";
import { getFreeCadWorker } from "./client.server";
import { freeCadKernel } from "./freecad.server";
import { getArtifact } from "../service/artifacts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const approx = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

function lAssemblyDoc(): ReturnType<typeof emptyDocument> {
  const { document } = applyAll(emptyDocument("asm-freecad"), [
    { op: "define_parameter", name: "plate_l", value: 100 },
    { op: "define_parameter", name: "plate_w", value: 60 },
    { op: "define_parameter", name: "plate_t", value: 10 },
    { op: "create_box", name: "Plate", length_mm: "plate_l", width_mm: "plate_w", height_mm: "plate_t" },
    { op: "create_body", name: "BracketBody" },
    { op: "create_box", body_id: "BracketBody", name: "Bracket", length_mm: 60, width_mm: 10, height_mm: 50 },
    { op: "create_assembly", name: "bracket_demo" },
    { op: "define_component", assembly_id: "bracket_demo", component_id: "plate", include: { body_ids: ["Body"] } },
    { op: "define_component", assembly_id: "bracket_demo", component_id: "bracket", include: { body_ids: ["BracketBody"] } },
    { op: "create_instance", assembly_id: "bracket_demo", component_id: "plate", instance_id: "plate_1" },
    { op: "create_instance", assembly_id: "bracket_demo", component_id: "bracket", instance_id: "bracket_1" },
    { op: "fix_instance", assembly_id: "bracket_demo", instance_id: "plate_1" },
    { op: "mate_faces", assembly_id: "bracket_demo", a_instance: "plate_1", a_face: "top_face", b_instance: "bracket_1", b_face: "bottom_face" },
    { op: "mate_faces", assembly_id: "bracket_demo", a_instance: "plate_1", a_face: "back_face", b_instance: "bracket_1", b_face: "front_face" },
  ]);
  return document;
}

async function main() {
  const worker = getFreeCadWorker();
  const results: string[] = [];
  let failed = 0;
  const check = async (name: string, fn: () => string | Promise<string>) => {
    try {
      const detail = await fn();
      results.push(`PASS ${name} — ${detail}`);
      console.log(`PASS ${name} — ${detail}`);
    } catch (err) {
      failed += 1;
      results.push(`FAIL ${name} — ${(err as Error).message}`);
      console.log(`FAIL ${name} — ${(err as Error).message}`);
    }
  };

  const doc = lAssemblyDoc();
  let importedStepPid: string | null = null;

  let inspection: Record<string, any> | null = null;
  await check("worker-start", async () => {
    const st = await freeCadKernel.available();
    assert(st.available, st.detail ?? "unavailable");
    return `freecad ${st.version} pid=${st.pid}`;
  });

  await check("build-inspect", async () => {
    inspection = (await buildAssemblyAuthoritative(doc, "bracket_demo")) as Record<string, any>;
    const inst = inspection.instances as Array<Record<string, any>>;
    assert(inst.length === 2, `instances ${inst.length} :: ${JSON.stringify((inspection as any).issues ?? []).slice(0,400)}`);
    const plate = inst.find((i) => i.instance_id === "plate_1")!;
    const bracket = inst.find((i) => i.instance_id === "bracket_1")!;
    assert(plate.valid && bracket.valid, "invalid solids");
    assert(approx(plate.volume_mm3, 60000, 1), `plate V ${plate.volume_mm3}`);
    assert(approx(bracket.volume_mm3, 30000, 1), `bracket V ${bracket.volume_mm3}`);
    const bz = bracket.world_bbox.min.z;
    assert(approx(bz, 10, 0.05), `bracket min z ${bz} expected 10`);
    return `plate=60000 bracket=30000 bracket_z=${bz.toFixed(2)} total_bbox_z_max=${inspection.world_bbox.max.z.toFixed(2)}`;
  });

  await check("fcstd-export", async () => {
    const r = (await exportAssemblyAuthoritative(doc, "bracket_demo", "fcstd")) as Record<string, any>;
    assert(r.bytes > 500, `bytes ${r.bytes}`);
    assert((r.objects as string[]).length >= 3, `objects ${r.objects}`);
    return `fcstd ${r.bytes}B objects=${(r.objects as string[]).join(",")}`;
  });

  await check("step-export", async () => {
    const r = (await exportAssemblyAuthoritative(doc, "bracket_demo", "step")) as Record<string, any>;
    assert(r.bytes > 1000, `bytes ${r.bytes}`);
    return `step ${r.bytes}B (placed solids; structured hierarchy per OCC XCAF)`;
  });

  await check("fcstd-reopen", async () => {
    const r = (await exportAssemblyAuthoritative(doc, "bracket_demo", "fcstd")) as Record<string, any>;
    const imp = await worker.request("import", { arguments: { path: r.path } }, 120_000);
    assert(imp.ok, JSON.stringify(imp.error));
    const res = imp.result as Record<string, any>;
    assert((res.features as unknown[]).length >= 2, `objects ${res.features?.length}`);
    return `reopen ok: ${res.features?.length} objects (Tip semantics per docs/MACOS.md)`;
  });

  await check("restart-persistence", async () => {
    const pid0 = worker.getPid();
    worker.kill("SIGKILL");
    const st = await freeCadKernel.available();
    assert(st.available && st.pid !== pid0, `restart failed ${pid0}→${st.pid}`);
    const again = (await buildAssemblyAuthoritative(doc, "bracket_demo")) as Record<string, any>;
    assert(again.instances.length === 2 && again.valid, "post-restart rebuild diverged");
    return `${pid0} → ${st.pid}; assembly state intact`;
  });

  // ---- Blocker 2 repair proof: imported components through the public contract
  await check("imported-step-x2", async () => {
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    const proj = (await svc.createProject({ name: "asm-import-step" })) as Record<string, any>;
    const pid = (proj.data as Record<string, any>).project_id as string;
    importedStepPid = pid;
    await await svc.executeTool("create_box", { project_id: pid, length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" });
    const exp = await svc.executeTool("export_step", { project_id: pid });
    assert(exp.ok, JSON.stringify(exp.error));
    const stepData = exp.data as Record<string, any>;
    const stepPath = stepData.path ?? getArtifact(stepData.artifact_id as string)?.path;
    assert(Boolean(stepPath), `no export path (data=${JSON.stringify(stepData).slice(0,200)})`);
    await await svc.executeTool("create_assembly", { project_id: pid, name: "imported_asm" });
    await await svc.executeTool("define_component", { project_id: pid, assembly_id: "imported_asm", component_id: "imp", source_format: "step", source_path: stepPath });
    await await svc.executeTool("create_instance", { project_id: pid, assembly_id: "imported_asm", component_id: "imp", instance_id: "a", position: { x: 0 } });
    await await svc.executeTool("fix_instance", { project_id: pid, assembly_id: "imported_asm", instance_id: "a" });
    await await svc.executeTool("create_instance", { project_id: pid, assembly_id: "imported_asm", component_id: "imp", instance_id: "b", position: { x: 100 } });
    const rebuilt = await svc.executeTool("rebuild_assembly", { project_id: pid, assembly_id: "imported_asm" });
    assert(rebuilt.ok, JSON.stringify(rebuilt.error));
    const inst = (rebuilt.data as Record<string, any>).instances as Array<Record<string, any>>;
    assert(inst.length === 2, `instances ${inst.length} :: ${JSON.stringify((inspection as any).issues ?? []).slice(0,400)}`);
    for (const i of inst) {
      assert(i.valid && approx(i.volume_mm3, 48000, 1), `${i.instance_id} V=${i.volume_mm3}`);
    }
    const bbA = inst[0]!.world_bbox, bbB = inst[1]!.world_bbox;
    assert(approx(bbB.min.x - bbA.min.x, 100, 0.05), `offset ${bbB.min.x - bbA.min.x}`);
    return `2x48000 mm³; bounds offset=${(bbB.min.x - bbA.min.x).toFixed(2)} (public service→worker path)`;
  });

  await check("imported-fcstd-tip", async () => {
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    const proj = (await svc.createProject({ name: "asm-import-fcstd" })) as Record<string, any>;
    const pid = (proj.data as Record<string, any>).project_id as string;
    await await svc.executeTool("create_box", { project_id: pid, length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" });
    const exp = await svc.executeTool("export_fcstd", { project_id: pid });
    assert(exp.ok, JSON.stringify(exp.error));
    const fcData = exp.data as Record<string, any>;
    const fcPath = fcData.path ?? getArtifact(fcData.artifact_id as string)?.path;
    assert(Boolean(fcPath), "no fcstd export path");
    await await svc.executeTool("create_assembly", { project_id: pid, name: "fcstd_asm" });
    await await svc.executeTool("define_component", { project_id: pid, assembly_id: "fcstd_asm", component_id: "native_file", source_format: "fcstd", source_path: fcPath });
    await await svc.executeTool("set_definition_parameter", { project_id: pid, assembly_id: "fcstd_asm", component_id: "native_file", name: "nope", value: 1 })
      .catch(() => undefined);
    const rec = await svc.executeTool("set_definition_parameter", { project_id: pid, assembly_id: "fcstd_asm", component_id: "native_file", name: "nope", value: 1 });
    assert(!rec.ok && rec.error?.error === "UNKNOWN_PARAMETER", `imported params must be rejected: ${JSON.stringify(rec).slice(0,300)}`);
    await await svc.executeTool("create_instance", { project_id: pid, assembly_id: "fcstd_asm", component_id: "native_file", instance_id: "f1" });
    await await svc.executeTool("fix_instance", { project_id: pid, assembly_id: "fcstd_asm", instance_id: "f1" });
    const rebuilt = await svc.executeTool("rebuild_assembly", { project_id: pid, assembly_id: "fcstd_asm" });
    assert(rebuilt.ok, JSON.stringify(rebuilt.error));
    const inst = (rebuilt.data as Record<string, any>).instances as Array<Record<string, any>>;
    assert(inst.length === 1 && inst[0]!.valid && approx(inst[0]!.volume_mm3, 48000, 1),
      `V=${inst[0]?.volume_mm3} (Tip/visible-result semantics)`);
    return `fcstd import Tip-volume=${inst[0]!.volume_mm3}`;
  });

  // ---- Blocker B: multi-feature PartDesign FCStd (history dedup) --------------
  await check("multi-feature-fcstd-tip", async () => {
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    const proj = (await svc.createProject({ name: "asm-import-multifeature" })) as Record<string, any>;
    const pid = (proj.data as Record<string, any>).project_id as string;
    await svc.executeTool("create_box", { project_id: pid, length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" });
    await svc.executeTool("create_hole", { project_id: pid, body_id: "Body", face: "top_face", centered: true, diameter_mm: 10, through: true });
    await svc.executeTool("fillet", { project_id: pid, body_id: "Body", radius_mm: 2, edges: "top_perimeter" });
    const inspD = (await (svc.executeTool("validate", { project_id: pid, kernel: "freecad" }))).data as Record<string, any>;
    const vFinal = Number((inspD.validation ?? inspD).volume_mm3);
    assert(vFinal > 0 && vFinal < 48000, `final ${vFinal} should be reduced by hole+fillet (OCC-authoritative)`);
    const exp = await svc.executeTool("export_fcstd", { project_id: pid });
    assert(exp.ok, JSON.stringify(exp.error));
    const fcData = exp.data as Record<string, any>;
    const fcPath = fcData.path ?? getArtifact(fcData.artifact_id as string)?.path;
    await svc.executeTool("create_assembly", { project_id: pid, name: "mf_asm" });
    await svc.executeTool("define_component", { project_id: pid, assembly_id: "mf_asm", component_id: "hist", source_format: "fcstd", source_path: fcPath as string });
    await svc.executeTool("create_instance", { project_id: pid, assembly_id: "mf_asm", component_id: "hist", instance_id: "h1" });
    await svc.executeTool("fix_instance", { project_id: pid, assembly_id: "mf_asm", instance_id: "h1" });
    const rebuilt = await svc.executeTool("rebuild_assembly", { project_id: pid, assembly_id: "mf_asm" });
    assert(rebuilt.ok, JSON.stringify(rebuilt.error));
    const inst = (rebuilt.data as Record<string, any>).instances as Array<Record<string, any>>;
    const vImported = inst[0]?.volume_mm3 ?? -1;
    assert(approx(vImported, vFinal, 1),
      `imported ${vImported} != final Tip ${vFinal} — history double-counted`);
    return `final=${vFinal} imported=${vImported} (<48k: hole+fillet history present, not summed)`;
  });

  await check("restart-with-imported", async () => {
    const pid0 = worker.getPid();
    worker.kill("SIGKILL");
    const st = await freeCadKernel.available();
    assert(st.available && st.pid !== pid0, `restart ${pid0}→${st.pid}`);
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    assert(importedStepPid, "imported-step check did not run");
    const rebuilt = await svc.executeTool("rebuild_assembly", { project_id: importedStepPid, assembly_id: "imported_asm" });
    assert(rebuilt.ok && (rebuilt.data as Record<string, any>).instances.length === 2, `post-restart diverged: ${JSON.stringify({ok:rebuilt.ok,err:rebuilt.error,n:(rebuilt.data as any)?.instances?.length}).slice(0,300)}`);
    return `${pid0} → ${st.pid}; imported definitions resolve from persisted source`;
  });

  // ================= Phase 6.1: interference + instance efficiency =================
  async function interferenceFor(pid: string, assemblyId: string) {
    const { getAgentCadService } = await import("../service/agentcad");
    const r = await getAgentCadService().executeTool("check_interference", { project_id: pid, assembly_id: assemblyId });
    assert(r.ok, JSON.stringify(r.error));
    return r.data as Record<string, any>;
  }

  /**
   * Two-component interference fixture built through the public contract:
   * each component comes from its own single-part project (exported STEP,
   * imported as definition), so snapshots are independent.
   */
  async function buildTwoBoxAssembly(offsetX: number): Promise<string> {
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    const paths: string[] = [];
    for (const n of ["boxa", "boxb"]) {
      const proj = (await svc.createProject({ name: `p61-${n}` })) as Record<string, any>;
      const pid = (proj.data as Record<string, any>).project_id as string;
      await svc.executeTool("create_box", { project_id: pid, length_mm: 20, width_mm: 20, height_mm: 20, name: "Box" });
      const exp = await svc.executeTool("export_step", { project_id: pid });
      assert(exp.ok, JSON.stringify(exp.error));
      paths.push(getArtifact((exp.data as Record<string, any>).artifact_id as string)?.path ?? "");
    }
    assert(paths.every(Boolean), "step exports missing");
    const host = (await svc.createProject({ name: `p61-host-${offsetX}` })) as Record<string, any>;
    const pidH = (host.data as Record<string, any>).project_id as string;
    await svc.executeTool("create_box", { project_id: pidH, length_mm: 1, width_mm: 1, height_mm: 1, name: "Anchor" });
    await svc.executeTool("create_assembly", { project_id: pidH, name: "two_boxes" });
    for (const [idx, p] of paths.entries()) {
      await svc.executeTool("define_component", { project_id: pidH, assembly_id: "two_boxes", component_id: `c${idx}`, source_format: "step", source_path: p });
    }
    await svc.executeTool("create_instance", { project_id: pidH, assembly_id: "two_boxes", component_id: "c0", instance_id: "A", position: { x: 0 } });
    await svc.executeTool("fix_instance", { project_id: pidH, assembly_id: "two_boxes", instance_id: "A" });
    await svc.executeTool("create_instance", { project_id: pidH, assembly_id: "two_boxes", component_id: "c1", instance_id: "B", position: { x: offsetX } });
    return pidH;
  }

  await check("p61-interference-overlap", async () => {
    const pid = await buildTwoBoxAssembly(10);
    const d = await interferenceFor(pid, "two_boxes");
    const pair = (d.pairs as Array<Record<string, any>>)[0];
    assert(pair && pair.intersects && approx(pair.volume_mm3, 4000, 5), JSON.stringify(d.pairs));
    assert(d.stats.aabb_candidates >= 1 && d.stats.occ_boolean_calls >= 1, JSON.stringify(d.stats));
    return `overlap=${pair.volume_mm3.toFixed(1)} mm³ occ_calls=${d.stats.occ_boolean_calls}`;
  });

  await check("p61-interference-separated", async () => {
    const pid = await buildTwoBoxAssembly(25);
    const d = await interferenceFor(pid, "two_boxes");
    assert(d.pairs.length === 0, JSON.stringify(d.pairs));
    return "no volumetric interference";
  });

  await check("p61-interference-contact", async () => {
    const pid = await buildTwoBoxAssembly(20);
    const d = await interferenceFor(pid, "two_boxes");
    assert(d.pairs.length === 0, `contact misread as interference: ${JSON.stringify(d.pairs)}`);
    return "face contact not flagged";
  });

  await check("p61-imported-overlap-restart", async () => {
    const pid = await buildTwoBoxAssembly(10);
    const before = await interferenceFor(pid, "two_boxes");
    const pid0 = worker.getPid();
    worker.kill("SIGKILL");
    const st = await freeCadKernel.available();
    assert(st.available && st.pid !== pid0, "restart failed");
    const after = await interferenceFor(pid, "two_boxes");
    assert(JSON.stringify(before.pairs) === JSON.stringify(after.pairs), "interference changed across restart");
    return `identical post-restart (${after.stats.occ_boolean_calls} occ calls)`;
  });

  await check("p61-links-100", async () => {
    const { getAgentCadService } = await import("../service/agentcad");
    const svc = getAgentCadService();
    const src = (await svc.createProject({ name: "p61-link-src" })) as Record<string, any>;
    const pidS = (src.data as Record<string, any>).project_id as string;
    await svc.executeTool("create_box", { project_id: pidS, length_mm: 80, width_mm: 50, height_mm: 12, name: "Golden" });
    const exp = await svc.executeTool("export_step", { project_id: pidS });
    const stepPath = getArtifact((exp.data as Record<string, any>).artifact_id as string)?.path ?? "";
    const host = (await svc.createProject({ name: "p61-link-host" })) as Record<string, any>;
    const pid = (host.data as Record<string, any>).project_id as string;
    await svc.executeTool("create_box", { project_id: pid, length_mm: 1, width_mm: 1, height_mm: 1, name: "Anchor" });
    await svc.executeTool("create_assembly", { project_id: pid, name: "link_asm" });
    await svc.executeTool("define_component", { project_id: pid, assembly_id: "link_asm", component_id: "golden", source_format: "step", source_path: stepPath });
    for (let i = 0; i < 100; i += 1) {
      await svc.executeTool("create_instance", { project_id: pid, assembly_id: "link_asm", component_id: "golden", instance_id: `L${i}`, position: { x: i * 90 } });
    }
    await svc.executeTool("fix_instance", { project_id: pid, assembly_id: "link_asm", instance_id: "L0" });
    const t0 = Date.now();
    const rebuilt = await svc.executeTool("rebuild_assembly", { project_id: pid, assembly_id: "link_asm", use_links: true });
    const ms = Date.now() - t0;
    assert(rebuilt.ok, `rebuild failed: ${JSON.stringify(rebuilt.error ?? rebuilt).slice(0, 400)}`);
    const data = rebuilt.data as Record<string, any>;
    const inst = data.instances as Array<Record<string, any>>;
    assert(inst.length === 100, `instances ${inst.length}`);
    assert(inst.every((i) => i.valid && approx(i.volume_mm3, 48000, 1)), `volume/validity drift: ${JSON.stringify(inst.find((i) => !i.valid || !approx(i.volume_mm3, 48000, 1)))}`);
    // Blocker E proof: instances must BE App::Link objects sharing ONE definition.
    assert(data.representation === "app_link", `representation ${data.representation}`);
    assert(data.representation_counts.links === 100, `links ${data.representation_counts.links}`);
    assert(data.representation_counts.definitions === 1, `definitions ${data.representation_counts.definitions}`);
    assert(inst.every((i) => i.representation === "app_link" && i.linked_definition), "per-instance link proof failed");
    // Fallback visibility: same assembly without use_links must report shape_copy.
    const copies = await svc.executeTool("rebuild_assembly", { project_id: pid, assembly_id: "link_asm" });
    assert(copies.ok, JSON.stringify(copies.error));
    assert((copies.data as Record<string, any>).representation === "shape_copy", "fallback not visible");
    return `100 App::Link instances (defs=1), rebuild ${ms} ms, fallback path verified`;
  });

  try {
    await worker.request("shutdown", {}, 5_000);
  } catch { /* ignore */ }
  worker.kill("SIGKILL");

  console.log(`\n${results.length - failed}/${results.length} assembly-freecad tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
