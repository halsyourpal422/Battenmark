import { emptyDocument } from "../document";
import { applyAll } from "../operations";
import { runExample } from "../examples";
import { evaluateDocument } from "../evaluate";
import { freeCadKernel } from "./freecad.server";

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function approx(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps;
}

async function run(id: string, name: string, fn: () => Promise<string | void>): Promise<T> {
  try {
    const detail = (await fn()) ?? "ok";
    return { id, name, passed: true, detail };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const out: T[] = [];

  out.push(
    await run("box", "Box bbox + volume parity", async () => {
      const { document } = applyAll(emptyDocument("p"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const js = evaluateDocument(document);
      const fc = await freeCadKernel.inspect(document);
      const jdx = js.bbox!.max.x - js.bbox!.min.x;
      const fdx = fc.bounding_box!.max.x - fc.bounding_box!.min.x;
      assert(approx(jdx, fdx, 0.05), `length JSCAD ${jdx} vs FreeCAD ${fdx}`);
      assert(approx(js.volumeMm3, fc.volume_mm3, 1), `volume JSCAD ${js.volumeMm3} vs FreeCAD ${fc.volume_mm3}`);
      assert(js.ok === fc.valid, `validity JSCAD ${js.ok} vs FreeCAD ${fc.valid}`);
      return `V ${js.volumeMm3.toFixed(1)} / ${fc.volume_mm3}  L ${jdx}/${fdx}`;
    }),
  );

  out.push(
    await run("cyl", "Cylinder bbox parity (volume faceted)", async () => {
      const { document } = applyAll(emptyDocument("p"), [
        { op: "create_cylinder", radius_mm: 10, height_mm: 20 },
      ]);
      const js = evaluateDocument(document);
      const fc = await freeCadKernel.inspect(document);
      const jh = js.bbox!.max.z - js.bbox!.min.z;
      const fh = fc.bounding_box!.max.z - fc.bounding_box!.min.z;
      assert(approx(jh, fh, 0.05), `height ${jh} vs ${fh}`);
      const ratio = js.volumeMm3 / fc.volume_mm3;
      assert(ratio > 0.9 && ratio < 1.02, `volume ratio ${ratio} (JSCAD is faceted)`);
      return `V js=${js.volumeMm3.toFixed(1)} fc=${fc.volume_mm3} ratio=${ratio.toFixed(3)}`;
    }),
  );

  out.push(
    await run("bracket", "L-bracket bbox + success parity", async () => {
      const { document } = runExample("bracket");
      const js = evaluateDocument(document);
      const fc = await freeCadKernel.inspect(document);
      assert(js.ok && fc.valid, `js=${js.ok} fc=${fc.valid} ${JSON.stringify(fc.issues)}`);
      const jx = js.bbox!.max.x - js.bbox!.min.x;
      const fx = fc.bounding_box!.max.x - fc.bounding_box!.min.x;
      assert(approx(jx, fx, 0.5), `length ${jx} vs ${fx}`);
      const visJs = js.bodies.filter((b) => b.visible && !b.consumed).length;
      const visFc = fc.bodies.filter((b) => !b.consumed).length;
      assert(visJs === visFc, `bodies ${visJs} vs ${visFc}`);
      return `bodies ${visFc}  L ${jx.toFixed(2)}/${fx.toFixed(2)}  V ${js.volumeMm3.toFixed(0)}/${fc.volume_mm3}`;
    }),
  );

  out.push(
    await run("enclosure", "Enclosure body count + outer size", async () => {
      const { document } = runExample("enclosure");
      const js = evaluateDocument(document);
      const fc = await freeCadKernel.inspect(document);
      assert(fc.valid, JSON.stringify(fc.issues));
      const visJs = js.bodies.filter((b) => b.visible && !b.consumed && b.mesh).length;
      const visFc = fc.bodies.filter((b) => !b.consumed).length;
      assert(visJs >= 2 && visFc >= 2, `bodies js=${visJs} fc=${visFc}`);
      const jx = js.bbox!.max.x - js.bbox!.min.x;
      const fx = fc.bounding_box!.max.x - fc.bounding_box!.min.x;
      assert(approx(jx, fx, 1.0), `outer X ${jx} vs ${fx}`);
      return `bodies ${visJs}/${visFc}  X ${jx.toFixed(2)}/${fx.toFixed(2)}`;
    }),
  );

  let failed = 0;
  for (const r of out) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(12)} ${r.name} — ${r.detail}`);
    if (!r.passed) failed += 1;
  }
  console.log(`\n${out.length - failed}/${out.length} parity tests passed`);
  const { getFreeCadWorker } = await import("./client.server");
  const w = getFreeCadWorker();
  try { await w.request("shutdown", {}, 5_000); } catch { /* ignore */ }
  w.kill("SIGKILL");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
