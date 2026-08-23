import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { evaluateDocument } from "../evaluate";
import { freeCadKernel } from "./freecad.server";
import { getFreeCadWorker } from "./client.server";

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
  const t0 = Date.now();
  process.stdout.write(`… ${id} `);
  try {
    const detail = (await fn()) ?? "ok";
    console.log(`PASS ${detail} (${Date.now() - t0}ms)`);
    return { id, name, passed: true, detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.log(`FAIL ${detail} (${Date.now() - t0}ms)`);
    return { id, name, passed: false, detail };
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const out: T[] = [];
  const worker = getFreeCadWorker();
  const holeVol = Math.PI * 4 * 5;

  out.push(
    await run("jscad-linear", "JSCAD linear hole pattern", async () => {
      const { document } = applyAll(emptyDocument("pat"), [
        { op: "create_box", length_mm: 80, width_mm: 30, height_mm: 5 },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 10, y_mm: 15, diameter_mm: 4, through: true, name: "H" },
        { op: "create_pattern", feature_id: "H", count: 4, direction: "x", spacing_mm: 20, name: "Row" },
      ]);
      const ev = evaluateDocument(document);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      const expected = 80 * 30 * 5 - 4 * holeVol;
      assert(approx(ev.volumeMm3, expected, 40), `V ${ev.volumeMm3} != ${expected}`);
      return `V=${ev.volumeMm3.toFixed(1)}`;
    }),
  );

  out.push(
    await run("jscad-rect", "JSCAD rectangular pattern", async () => {
      const { document } = applyAll(emptyDocument("rect"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 5 },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 10, y_mm: 10, diameter_mm: 4, through: true, name: "H" },
        {
          op: "create_pattern",
          feature_id: "H",
          count: 8,
          kind: "rectangular",
          count_x: 4,
          count_y: 2,
          spacing_x_mm: 20,
          spacing_y_mm: 30,
          name: "Grid",
        },
      ]);
      const ev = evaluateDocument(document);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      const expected = 80 * 50 * 5 - 8 * holeVol;
      assert(approx(ev.volumeMm3, expected, 50), `V ${ev.volumeMm3} != ${expected}`);
      return `V=${ev.volumeMm3.toFixed(1)}`;
    }),
  );

  out.push(
    await run("pd-linear", "PartDesign linear pattern", async () => {
      const { document } = applyAll(emptyDocument("pd-pat"), [
        { op: "define_parameter", name: "count", value: 4, unit: "count" },
        { op: "define_parameter", name: "spacing", value: 20 },
        { op: "create_box", length_mm: 80, width_mm: 30, height_mm: 5 },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 10, y_mm: 15, diameter_mm: 4, through: true, name: "H" },
        { op: "create_pattern", feature_id: "H", count: "count", direction: "x", spacing_mm: "spacing", name: "Row" },
      ]);
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues));
      const expected = 80 * 30 * 5 - 4 * holeVol;
      assert(approx(a.volume_mm3, expected, 4), `V ${a.volume_mm3} != ${expected}`);
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "count", value: 3 });
      const b = await freeCadKernel.inspect(d2);
      assert(b.valid, JSON.stringify(b.issues));
      const expected3 = 80 * 30 * 5 - 3 * holeVol;
      assert(approx(b.volume_mm3, expected3, 4), `V3 ${b.volume_mm3}`);
      const types = JSON.stringify(a.features);
      assert(types.includes("LinearPattern") || types.includes("PartDesign::LinearPattern"), types);
      return `V ${a.volume_mm3.toFixed(1)}→${b.volume_mm3.toFixed(1)}`;
    }),
  );

  await worker.restart();
  const failed = out.filter((t) => !t.passed).length;
  console.log(`\n${out.length - failed}/${out.length} pattern tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
