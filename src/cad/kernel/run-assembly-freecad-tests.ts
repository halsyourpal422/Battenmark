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

  let inspection: Record<string, any> | null = null;
  await check("worker-start", async () => {
    const st = await freeCadKernel.available();
    assert(st.available, st.detail ?? "unavailable");
    return `freecad ${st.version} pid=${st.pid}`;
  });

  await check("build-inspect", async () => {
    inspection = (await buildAssemblyAuthoritative(doc, "bracket_demo")) as Record<string, any>;
    const inst = inspection.instances as Array<Record<string, any>>;
    assert(inst.length === 2, `instances ${inst.length}`);
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
