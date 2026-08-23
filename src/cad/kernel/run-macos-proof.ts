/**
 * Real Apple Silicon proof runner.
 *
 * On darwin/arm64 this executes the Phase 5.5.1 hardware sequence.
 * On any other host it records the environment and SKIPs — it does not
 * pretend mocked Darwin unit tests are hardware verification.
 */
import { spawnSync } from "node:child_process";
import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { discoverFreeCad } from "./discover.server";
import { paramMap } from "../document";
import { resolveVec3 } from "../expressions";
import type { Feature, Vec3Expr } from "../types";

function uname(flag: string): string {
  try {
    return spawnSync("uname", [flag], { encoding: "utf8" }).stdout.trim();
  } catch {
    return "unknown";
  }
}

function swVers(): string {
  try {
    return spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).stdout.trim() || "n/a";
  } catch {
    return "n/a";
  }
}

function boxOrigin(features: Feature[], name: string): Vec3Expr {
  const f = features.find((x) => x.name === name);
  if (!f || f.kind !== "box") throw new Error(`missing box ${name}`);
  return f.origin;
}

async function hardwareProof(): Promise<void> {
  const { freeCadKernel } = await import("./freecad.server");
  const { getFreeCadWorker } = await import("./client.server");
  const { renderDocumentPreview } = await import("../preview/render");

  const worker = getFreeCadWorker();
  const hello = await freeCadKernel.available();
  if (!hello.available) throw new Error(`worker startup failed: ${hello.detail}`);
  console.log(`PASS  worker startup  ${hello.version} pid=${hello.pid}`);

  const box = applyAll(emptyDocument("mac-box"), [
    { op: "define_parameter", name: "length", value: 80 },
    { op: "create_box", name: "Base", length_mm: "length", width_mm: 50, height_mm: 12 },
  ]);
  const ins = await freeCadKernel.inspect(box.document);
  if (!ins.valid || Math.abs(ins.volume_mm3 - 48000) > 1) throw new Error(`box V=${ins.volume_mm3}`);
  console.log(`PASS  create_box  V=${ins.volume_mm3}`);

  const grown = applyOperation(box.document, { op: "set_parameter", name: "length", value: 120 });
  const ins2 = await freeCadKernel.inspect(grown.document);
  if (!ins2.valid || Math.abs(ins2.volume_mm3 - 72000) > 2) throw new Error(`param V=${ins2.volume_mm3}`);
  console.log(`PASS  parametric rebuild  V=${ins2.volume_mm3}`);

  const holed = applyAll(emptyDocument("mac-hole"), [
    { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
    { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 10, y_mm: 10, diameter_mm: 5, through: true },
  ]);
  const insH = await freeCadKernel.inspect(holed.document);
  if (!insH.valid) throw new Error(`hole invalid ${JSON.stringify(insH.issues)}`);
  console.log(`PASS  create_hole  V=${insH.volume_mm3}`);

  const filleted = applyAll(emptyDocument("mac-fillet"), [
    { op: "define_parameter", name: "length", value: 80 },
    { op: "create_box", length_mm: "length", width_mm: 50, height_mm: 12 },
    { op: "fillet", body_id: "Body", radius_mm: 3, edges: "top_perimeter", name: "TopRound" },
  ]);
  const insF0 = await freeCadKernel.inspect(filleted.document);
  const grownF = applyOperation(filleted.document, { op: "set_parameter", name: "length", value: 120 });
  const insF1 = await freeCadKernel.inspect(grownF.document);
  if (!insF0.valid || !insF1.valid) throw new Error("fillet invalid after length change");
  console.log(`PASS  semantic fillet  V ${insF0.volume_mm3} → ${insF1.volume_mm3}`);

  const expr = applyAll(emptyDocument("mac-expr"), [
    { op: "define_parameter", name: "wall", value: 2.4 },
    { op: "create_box", name: "Outer", length_mm: 40, width_mm: 30, height_mm: 10 },
    {
      op: "create_box",
      body_id: "Body",
      name: "Inner",
      length_mm: "40 - 2 * wall",
      width_mm: 20,
      height_mm: 8,
      origin: { x: "wall", y: "wall", z: 0 },
    },
  ]);
  const o1 = resolveVec3(boxOrigin(expr.document.features, "Inner"), paramMap(expr.document));
  const expr2 = applyOperation(expr.document, { op: "set_parameter", name: "wall", value: 4 });
  const o2 = resolveVec3(boxOrigin(expr2.document.features, "Inner"), paramMap(expr2.document));
  if (Math.abs(o1.x - 2.4) > 1e-6 || Math.abs(o2.x - 4) > 1e-6) throw new Error(`expr ${o1.x} → ${o2.x}`);
  console.log(`PASS  expression rebuild  origin ${o1.x} → ${o2.x}`);

  const views = renderDocumentPreview(grown.document, "all");
  const names = views.map((v) => v.view).sort().join(",");
  if (!["front", "isometric", "right", "top"].every((v) => names.includes(v))) throw new Error(`views ${names}`);
  console.log(`PASS  render_preview  ${names}`);

  const step = await freeCadKernel.exportModel(grown.document, { format: "step", projectSlug: "mac-proof" });
  const fcstd = await freeCadKernel.exportModel(grown.document, { format: "fcstd", projectSlug: "mac-proof" });
  if (!step.success || step.bytes < 100) throw new Error("STEP export failed");
  if (!fcstd.success || fcstd.bytes < 100) throw new Error("FCStd export failed");
  console.log(`PASS  STEP export  bytes=${step.bytes}`);
  console.log(`PASS  FCStd save  bytes=${fcstd.bytes}`);

  const pid0 = worker.getPid();
  worker.kill("SIGKILL");
  const hello2 = await freeCadKernel.available();
  if (!hello2.available) throw new Error("restart failed");
  const insR = await freeCadKernel.inspect(grown.document);
  if (!insR.valid) throw new Error("post-restart inspect failed");
  console.log(`PASS  worker restart  ${pid0} → ${hello2.pid}`);

  try {
    await worker.request("shutdown", {}, 5_000);
  } catch {
    /* ignore */
  }
  worker.kill("SIGKILL");
}

async function main() {
  const arch = uname("-m") || process.arch;
  const sys = uname("-s") || process.platform;
  const macos = swVers();
  const disc = discoverFreeCad();

  console.log("=== Apple Silicon proof ===");
  console.log(`host: ${sys} ${arch}`);
  console.log(`macOS: ${macos}`);
  console.log(`discovery: mode=${disc.mode} exe=${disc.executable ?? "none"} version=${disc.version ?? "?"}`);

  const isAppleSilicon = process.platform === "darwin" && (arch === "arm64" || process.arch === "arm64");
  if (!isAppleSilicon) {
    console.log("");
    console.log("SKIP  Apple Silicon hardware proof");
    console.log("      This host is not darwin/arm64.");
    console.log("      Darwin unit tests (test:discover) cover candidate paths only.");
    console.log("      Do not treat this SKIP as a PASS.");
    process.exit(0);
  }

  console.log(`FreeCAD bundle/exec: ${disc.executable}`);
  console.log(`FreeCAD version: ${disc.version}`);
  console.log(`discovery method: ${disc.mode}`);
  await hardwareProof();
  console.log("\nApple Silicon proof complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
