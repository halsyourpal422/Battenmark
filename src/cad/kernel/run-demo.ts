import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { runExample } from "../examples";
import { freeCadKernel } from "./freecad.server";

async function demoA() {
  console.log("Demo A — 80×50×12 mm box");
  const { document } = applyAll(emptyDocument("demo-box"), [
    { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
  ]);
  const inspected = await freeCadKernel.inspect(document);
  const fcstd = await freeCadKernel.exportModel(document, { format: "fcstd", projectSlug: "demo-box" });
  const step = await freeCadKernel.exportModel(document, { format: "step", projectSlug: "demo-box" });
  const stl = await freeCadKernel.exportModel(document, { format: "stl", projectSlug: "demo-box" });
  console.log("  inspect", { valid: inspected.valid, volume: inspected.volume_mm3, bbox: inspected.bounding_box });
  console.log("  files", fcstd.path, step.path, stl.path);
  return document;
}

async function demoB() {
  console.log("Demo B — length 80 → 100");
  const { document } = applyAll(emptyDocument("demo-box"), [
    { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
  ]);
  const { document: edited } = applyOperation(document, {
    op: "set_feature_param",
    feature_id: "base",
    param: "length",
    value: 100,
  });
  const inspected = await freeCadKernel.inspect(edited);
  const step = await freeCadKernel.exportModel(edited, { format: "step", projectSlug: "demo-box" });
  const fcstd = await freeCadKernel.exportModel(edited, { format: "fcstd", projectSlug: "demo-box" });
  console.log("  after", { valid: inspected.valid, volume: inspected.volume_mm3, bbox: inspected.bounding_box });
  console.log("  regenerated", step.path, fcstd.path);
}

async function demoC() {
  console.log("Demo C — L-bracket");
  const { document } = runExample("bracket");
  const a = await freeCadKernel.inspect(document);
  const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "length", value: 80 });
  const b = await freeCadKernel.inspect(d2);
  const { document: d3 } = applyOperation(d2, { op: "rollback_revision", revision_id: document.currentRevisionId! });
  const c = await freeCadKernel.inspect(d3);
  await freeCadKernel.exportModel(document, { format: "fcstd", projectSlug: "l-bracket" });
  await freeCadKernel.exportModel(document, { format: "step", projectSlug: "l-bracket" });
  await freeCadKernel.exportModel(document, { format: "stl", projectSlug: "l-bracket" });
  console.log("  original", a.volume_mm3, a.bounding_box);
  console.log("  length=80", b.volume_mm3, b.bounding_box);
  console.log("  rollback", c.volume_mm3, c.bounding_box);
}

async function demoD() {
  console.log("Demo D — Enclosure");
  const { document } = runExample("enclosure");
  const a = await freeCadKernel.inspect(document);
  const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
  const b = await freeCadKernel.inspect(d2);
  await freeCadKernel.exportModel(d2, { format: "fcstd", projectSlug: "enclosure" });
  await freeCadKernel.exportModel(d2, { format: "step", projectSlug: "enclosure" });
  await freeCadKernel.exportModel(d2, { format: "stl", projectSlug: "enclosure" });
  console.log("  wall=2.4", a.valid, a.volume_mm3, a.bounding_box, "solids", a.solid_count);
  console.log("  wall=3.0", b.valid, b.volume_mm3, b.bounding_box, "solids", b.solid_count);
}

async function main() {
  const status = await freeCadKernel.available();
  console.log("FreeCAD", status);
  await demoA();
  await demoB();
  await demoC();
  await demoD();
  const { getFreeCadWorker } = await import("./client.server");
  const w = getFreeCadWorker();
  try { await w.request("shutdown", {}, 5_000); } catch { /* ignore */ }
  w.kill("SIGKILL");
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
