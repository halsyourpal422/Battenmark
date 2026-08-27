/**
 * Phase 6.2 backend-neutrality conformance.
 * Same Battenmark IR → FreeCAD/OCC and build123d → equivalent geometry.
 */
import { emptyDocument } from "../document";
import { applyAll } from "../operations";
import { getFreeCadWorker, CadWorkerError } from "./client.server";
import { freeCadKernel } from "./freecad.server";
import { build123dKernel, importInspect } from "./b23d.server";
import { build123dCapabilities } from "../backend/capabilities";

const TOL = {
  goldenAbsMm3: 1,
  featureRelTol: 0.002,
  bboxAbsMm: 0.05,
  crossRelTol: 0.002,
};

let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failed += 1;
}
const relDiff = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

function goldenBoxDoc() {
  return applyAll(emptyDocument("neutral-golden"), [
    { op: "create_box", name: "Base", length_mm: 80, width_mm: 50, height_mm: 12 },
  ]).document;
}

function featureDoc() {
  return applyAll(emptyDocument("neutral-feature"), [
    { op: "create_box", name: "Base", length_mm: 80, width_mm: 50, height_mm: 12 },
    { op: "create_hole", body_id: "Body", face: "top_face", centered: true, diameter_mm: 10, through: true },
    { op: "fillet", body_id: "Body", radius_mm: 2, edges: "top_perimeter" },
  ]).document;
}

async function main() {
  const golden = goldenBoxDoc();
  const feature = featureDoc();

  // capability honesty (unit-level slice check)
  const caps = build123dCapabilities({ available: true });
  check("caps.build123d.slice", caps.capabilities["primitives.box"] === true &&
    caps.capabilities["feature.hole.through"] === true &&
    caps.capabilities["assembly"] === false &&
    caps.capabilities["assembly.interference"] === false, "conformance-slice flags");

  // Golden box on both backends
  const t0 = Date.now();
  const fcGolden = await freeCadKernel.inspect(golden);
  const fcMs = Date.now() - t0;
  const t1 = Date.now();
  const b23Golden = await build123dKernel.inspect(golden);
  const b23Ms = Date.now() - t1;

  check("golden.freecad.volume", fcGolden.valid && Math.abs(fcGolden.volume_mm3 - 48000) <= TOL.goldenAbsMm3, `V=${fcGolden.volume_mm3} (${fcMs}ms)`);
  check("golden.build123d.volume", b23Golden.valid && Math.abs(b23Golden.volume_mm3 - 48000) <= TOL.goldenAbsMm3, `V=${b23Golden.volume_mm3} (${b23Ms}ms)`);
  check("golden.cross-agreement", relDiff(fcGolden.volume_mm3, b23Golden.volume_mm3) <= TOL.crossRelTol,
    `relDiff=${relDiff(fcGolden.volume_mm3, b23Golden.volume_mm3).toExponential(2)}`);

  // Feature sequence on both backends
  const t2 = Date.now();
  const fcFeat = await freeCadKernel.inspect(feature);
  const fcFeatMs = Date.now() - t2;
  const t3 = Date.now();
  const b23Feat = await build123dKernel.inspect(feature);
  const b23FeatMs = Date.now() - t3;
  check("feature.freecad", fcFeat.valid && fcFeat.solid_count === 1 && fcFeat.volume_mm3 < 48000, `V=${fcFeat.volume_mm3} (${fcFeatMs}ms)`);
  check("feature.build123d", b23Feat.valid && b23Feat.solid_count === 1 && b23Feat.volume_mm3 < 48000, `V=${b23Feat.volume_mm3} (${b23FeatMs}ms)`);
  check("feature.cross-agreement", relDiff(fcFeat.volume_mm3, b23Feat.volume_mm3) <= TOL.featureRelTol,
    `relDiff=${(relDiff(fcFeat.volume_mm3, b23Feat.volume_mm3) * 100).toFixed(3)}%`);

  // STEP interoperability, both directions
  const fcStep = await freeCadKernel.exportModel(golden, { format: "step", projectSlug: "neutrality-fc" });
  check("step.freecad-export", fcStep.success && fcStep.bytes > 500, `${fcStep.bytes}B`);
  const b23OfFc = await importInspect(fcStep.path);
  check("step.fc→build123d", b23OfFc.valid && Math.abs(b23OfFc.volume_mm3 - 48000) <= TOL.goldenAbsMm3, `V=${b23OfFc.volume_mm3}`);

  const b23Step = await build123dKernel.exportModel(golden, { format: "step", projectSlug: "neutrality-b23" });
  check("step.build123d-export", b23Step.success && b23Step.bytes > 500, `${b23Step.bytes}B`);
  const worker = getFreeCadWorker();
  const imp = await worker.request("import", { arguments: { path: b23Step.path } }, 120_000);
      const impRes = imp.result as Record<string, any>;
    const impVol = Number(impRes?.inspect?.volume_mm3 ?? impRes?.volume_mm3 ?? 0);
    check("step.build123d→freecad", Boolean(imp.ok) && Math.abs(impVol - 48000) <= TOL.goldenAbsMm3, `V=${impVol}`);

  try {
    await worker.request("shutdown", {}, 5_000);
  } catch { /* ignore */ }
  worker.kill("SIGKILL");

  console.log(failed === 0 ? "\nBACKEND NEUTRALITY CONFORMANCE: ALL PASS" : `\nFAILURES: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
