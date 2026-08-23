/**
 * Phase 5.5.1B consolidated Apple Silicon E2E proof.
 * Gates: B (capability report via canonical service), C/D (box + resize),
 * I (four-view PNG previews), J (STEP export -> OCC re-import),
 * K (FCStd save -> reload), L (STL export -> independent mesh re-read),
 * M (kill -> respawn race regression).
 * Complements `npm run test:macos` (A, C-H, M core flows).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { emptyDocument } from "./src/cad/document";
import { applyAll, applyOperation } from "./src/cad/operations";
import { freeCadKernel } from "./src/cad/kernel/freecad.server";
import { getFreeCadWorker } from "./src/cad/kernel/client.server";
import { getAgentCadService } from "./src/cad/service/agentcad";
import { renderDocumentPreview, writePreviewPng } from "./src/cad/preview/render";

let failures = 0;
const ARTIFACTS = resolve("artifacts/e2e-mac");

function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failures += 1;
}

const approx = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

function flatten(value: unknown, prefix = ""): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...flatten(item, `${prefix}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") out.push(...flatten(v, p));
      else out.push(`${p}=${String(v)}`);
    }
  } else {
    out.push(prefix ? `${prefix}=${String(value)}` : String(value));
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACTS, { recursive: true });
  const svc = getAgentCadService();
  const worker = getFreeCadWorker();

  // ---------- TEST B ----------
  console.log("== B: inspect_backend_capabilities via canonical service ==");
  const capsRes = await svc.executeTool("inspect_backend_capabilities", {}, { transport: "e2e-direct" });
  check("B.service_call_ok", capsRes.ok === true, capsRes.ok ? "" : JSON.stringify(capsRes.error));
  const flat = flatten((capsRes as { data?: unknown }).data);
  console.log("-- capability report (flattened) --");
  for (const line of flat) console.log("   " + line);
  console.log("-----------------------------------");
  const capLine = (key: string, value: string): boolean =>
    flat.some((s) => s.endsWith(`.capabilities.${key}=${value}`));
  for (const key of [
    "feature.hole.through",
    "feature.hole.blind",
    "feature.hole.counterbore",
    "feature.hole.countersink",
    "pattern.linear",
    "pattern.rectangular",
  ]) {
    check(`B.${key}=true`, capLine(key, "true"));
  }
  check("B.feature.hole.helical_thread=false", capLine("feature.hole.helical_thread", "false"));
  check("B.pattern.circular=false", capLine("pattern.circular", "false"));
  check("B.assembly=false", capLine("assembly", "false"));
  check("B.constraints=false", capLine("constraints", "false"));
  check("B.no_mockcad_in_production_report", !flat.some((s) => s.endsWith(".id=mockcad")));
  check("B.default_backend=freecad", flat.includes("default_backend=freecad"));
  check("B.roles.authoritative=freecad", flat.includes("roles.authoritative=freecad"));
  check("B.roles.preview=jscad", flat.includes("roles.preview=jscad"));

  // ---------- TESTS C/D ----------
  console.log("== C/D: canonical box + parametric resize (authoritative kernel) ==");
  const built = applyAll(emptyDocument("mac-e2e"), [
    { op: "create_box", name: "Base", length_mm: 80, width_mm: 50, height_mm: 12 },
  ]);
  const insC = await freeCadKernel.inspect(built.document);
  check("C.box_valid_one_solid", insC.valid && insC.solid_count === 1, `shape=${insC.shape_type}`);
  check("C.volume_48000", approx(insC.volume_mm3, 48000, 1), `V=${insC.volume_mm3}`);

  const grownDoc = applyAll(emptyDocument("mac-e2e-resize"), [
    { op: "define_parameter", name: "length", value: 80 },
    { op: "create_box", name: "Base", length_mm: "length", width_mm: 50, height_mm: 12 },
  ]);
  const resized = applyOperation(grownDoc.document, { op: "set_parameter", name: "length", value: 120 });
  const insD = await freeCadKernel.inspect(resized.document);
  const bbD = insD.bounding_box!;
  const dxD = typeof bbD.x === "number" ? bbD.x : bbD.max.x - bbD.min.x;
  check("D.resize_valid_72000", insD.valid && approx(insD.volume_mm3, 72000, 2), `V=${insD.volume_mm3}`);
  check("D.bbox_x_120", approx(dxD, 120, 0.05), `dx=${dxD}`);

  // ---------- TEST I ----------
  console.log("== I: four-view preview as real PNG files ==");
  const views = renderDocumentPreview(built.document, "all");
  check(
    "I.four_views_requested",
    ["front", "isometric", "right", "top"].every((n) => views.some((v) => v.view === n)),
    views.map((v) => v.view).sort().join(","),
  );
  for (const v of views) {
    const p = join(ARTIFACTS, `${v.view}.png`);
    writePreviewPng(p, v.png);
    const buf = readFileSync(p);
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    check(`I.${v.view}`, isPng && buf.length > 500 && w >= 128 && h >= 128, `${w}x${h} ${buf.length}B`);
  }

  // ---------- TEST J ----------
  console.log("== J: STEP export -> FreeCAD/OCC re-import ==");
  const step = await freeCadKernel.exportModel(built.document, { format: "step", projectSlug: "mac-e2e" });
  check("J.exported_nonzero", step.success && step.bytes > 100 && existsSync(step.path), `${step.bytes}B`);
  check("J.iso10303_header", readFileSync(step.path, "utf8").slice(0, 200).includes("ISO-10303"));
  const impStep = await worker.request("import", { arguments: { path: step.path } }, 120_000);
  check("J.reimport_ok", impStep.ok === true, impStep.ok ? "" : JSON.stringify(impStep.error));
  const si = (((impStep.result ?? {}) as { inspect?: Record<string, unknown> }).inspect ?? {}) as Record<string, unknown>;
  check("J.reimport_valid_one_solid", si.valid === true && Number(si.solid_count) === 1, `solids=${si.solid_count}`);
  check("J.reimport_volume_48000", approx(Number(si.volume_mm3), 48000, 1), `V=${si.volume_mm3}`);
  const sb = si.bounding_box as
    | { min?: { x: number; y: number; z: number }; max?: { x: number; y: number; z: number }; x?: number; y?: number; z?: number }
    | null;
  if (sb) {
    const dx = typeof sb.x === "number" ? sb.x : sb.max!.x - sb.min!.x;
    const dy = typeof sb.y === "number" ? sb.y : sb.max!.y - sb.min!.y;
    const dz = typeof sb.z === "number" ? sb.z : sb.max!.z - sb.min!.z;
    check("J.reimport_dims_80x50x12", approx(dx, 80, 0.05) && approx(dy, 50, 0.05) && approx(dz, 12, 0.05), `${dx}x${dy}x${dz}`);
  } else {
    check("J.reimport_dims_80x50x12", false, "no bbox in import result");
  }
  const stepIssues = (si.issues ?? []) as Array<{ code?: string }>;
  check("J.honest_import_not_parametric", stepIssues.some((i) => i.code === "IMPORT_NOT_PARAMETRIC"));

  // ---------- TEST K ----------
  console.log("== K: FCStd save -> reload ==");
  const fcstd = await freeCadKernel.exportModel(built.document, { format: "fcstd", projectSlug: "mac-e2e" });
  const fcBytes = readFileSync(fcstd.path);
  check("K.saved_zip_nonzero", fcBytes[0] === 0x50 && fcBytes[1] === 0x4b && fcBytes.length > 100, `${fcstd.bytes}B`);
  const impFc = await worker.request("import", { arguments: { path: fcstd.path } }, 120_000);
  check("K.reload_ok", impFc.ok === true, impFc.ok ? "" : JSON.stringify(impFc.error));
  const fr = (impFc.result ?? {}) as {
    bodies?: Array<Record<string, unknown>>;
    features?: Array<Record<string, unknown>>;
    inspect?: Record<string, unknown>;
    issues?: Array<{ code?: string }>;
  };
  check(
    "K.object_tree_present",
    Array.isArray(fr.bodies) && fr.bodies.length >= 1,
    `bodies=${fr.bodies?.length} features=${fr.features?.length}`,
  );
  const fi = (fr.inspect ?? {}) as Record<string, unknown>;
  check("K.reload_geometry_valid", fi.valid === true);
  // Native PartDesign documents retain intermediate feature shapes alongside
  // the final Body Tip; physical truth is the final-result solid, never the
  // sum over historical features (which would double-count sequential history).
  const reloadBodies = (Array.isArray(fi.bodies) ? fi.bodies : []) as Array<Record<string, unknown>>;
  // Sanity bound for this fixture class: a real solid of an ~80×50×12 part is
  // O(10^4–10^5) mm³. Degenerate datum/artifact shapes can report absurd OCC
  // numbers (observed 1.8e152) — those are not physical solids.
  const reloadVols = reloadBodies
    .map((b) => ({ name: String(b.name ?? b.id ?? "?"), v: Number(b.volume_mm3 ?? 0) }))
    .filter((x) => Number.isFinite(x.v) && x.v > 0 && x.v < 1e6);
  const tipVol = reloadVols.length > 0 ? Math.max(...reloadVols.map((x) => x.v)) : 0;
  console.log(
    `   [K] objects=${fr.bodies?.length} physicalSolids=[${reloadVols.map((x) => `${x.name}:${x.v}`).join(", ")}] naiveAggregate=${fi.volume_mm3}`,
  );
  check("K.final_tip_volume_48000", approx(tipVol, 48000, 1), `Tip V=${tipVol}`);
  const fb = fi.bounding_box as { min?: { x: number; y: number; z: number }; max?: { x: number; y: number; z: number }; x?: number; y?: number; z?: number } | null;
  if (fb) {
    const dx = typeof fb.x === "number" ? fb.x : fb.max!.x - fb.min!.x;
    const dy = typeof fb.y === "number" ? fb.y : fb.max!.y - fb.min!.y;
    const dz = typeof fb.z === "number" ? fb.z : fb.max!.z - fb.min!.z;
    check("K.tip_bounds_80x50x12", approx(dx, 80, 0.05) && approx(dy, 50, 0.05) && approx(dz, 12, 0.05), `${dx}x${dy}x${dz}`);
  } else {
    check("K.tip_bounds_80x50x12", false, "no bbox in reload result");
  }
  check(
    "K.parametric_info_honest",
    Array.isArray(fr.issues) && fr.issues.some((i) => i.code === "IMPORT_NOT_PARAMETRIC"),
    "architecture note: AgentCAD params live in document.json, not arbitrary FCStd trees",
  );

  // ---------- TEST L ----------
  console.log("== L: STL export -> independent mesh re-read ==");
  const stl = await freeCadKernel.exportModel(built.document, { format: "stl", projectSlug: "mac-e2e" });
  check("L.exported_nonzero", stl.bytes > 84, `${stl.bytes}B`);
  const raw = readFileSync(stl.path);
  let triangles = 0;
  let sizeConsistent = false;
  if (raw.toString("utf8", 0, 5) === "solid") {
    const text = raw.toString("utf8");
    triangles = (text.match(/facet normal/g) ?? []).length;
    sizeConsistent = triangles > 0;
  } else {
    triangles = raw.readUInt32LE(80);
    sizeConsistent = raw.length === 84 + 50 * triangles;
  }
  check("L.mesh_reread_triangles_gt_0", triangles > 0, `triangles=${triangles}`);
  check("L.stl_size_consistent", sizeConsistent, `fileLen=${raw.length}`);

  // ---------- TEST M ----------
  console.log("== M: kill -> immediate respawn (restart-race regression) ==");
  const pid0 = worker.getPid();
  worker.kill("SIGKILL");
  const hello = await freeCadKernel.available();
  check(
    "M.respawned_with_new_pid",
    hello.available === true && Boolean(hello.pid) && hello.pid !== pid0,
    `${pid0} -> ${hello.pid}`,
  );
  const insM = await freeCadKernel.inspect(built.document);
  check("M.usable_after_restart", insM.valid && approx(insM.volume_mm3, 48000, 1), `V=${insM.volume_mm3}`);

  try {
    await worker.request("shutdown", {}, 5_000);
  } catch {
    /* worker exit races shutdown ack */
  }
  worker.kill("SIGKILL");

  console.log(failures === 0 ? "\nE2E APPLE SILICON PROOF: ALL CHECKS PASSED" : `\nE2E FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
