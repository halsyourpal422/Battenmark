import { existsSync } from "node:fs";
import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { freeCadKernel } from "./freecad.server";
import { queryGeometry } from "./freecad.server";
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

const HOLE_VOL = Math.PI * 4 * 5; // r=2, h=5

async function main() {
  const out: T[] = [];
  const worker = getFreeCadWorker();

  out.push(
    await run("through", "Through PartDesign hole", async () => {
      const { document } = applyAll(emptyDocument("pd-through"), [
        { op: "create_box", name: "Plate", length_mm: 40, width_mm: 40, height_mm: 10 },
        {
          op: "create_hole",
          body_id: "Body",
          face: "top_face",
          x_mm: 20,
          y_mm: 20,
          diameter_mm: 6,
          through: true,
          name: "Thru",
        },
      ]);
      const ins = await freeCadKernel.inspect(document);
      assert(ins.valid, JSON.stringify(ins.issues));
      const expected = 40 * 40 * 10 - Math.PI * 9 * 10;
      assert(approx(ins.volume_mm3, expected, 2), `V ${ins.volume_mm3} != ${expected}`);
      const types = (ins.features || []).map((f) => String((f as { feature_type?: string }).feature_type || ""));
      const objects = JSON.stringify(ins.features);
      assert(
        objects.includes("PartDesign::Hole") || types.includes("PartDesign::Hole"),
        `no PartDesign::Hole in ${objects}`,
      );
      return `V=${ins.volume_mm3} types=${types.filter(Boolean).join(",")}`;
    }),
  );

  out.push(
    await run("blind", "Blind PartDesign hole", async () => {
      const { document } = applyAll(emptyDocument("pd-blind"), [
        { op: "create_box", name: "Plate", length_mm: 40, width_mm: 40, height_mm: 10 },
        {
          op: "create_hole",
          body_id: "Body",
          face: "top_face",
          x_mm: 20,
          y_mm: 20,
          diameter_mm: 6,
          type: "blind",
          through: false,
          depth_mm: 4,
          name: "Blind",
        },
      ]);
      const ins = await freeCadKernel.inspect(document);
      assert(ins.valid, JSON.stringify(ins.issues));
      const expected = 40 * 40 * 10 - Math.PI * 9 * 4;
      assert(approx(ins.volume_mm3, expected, 4), `V ${ins.volume_mm3} != ${expected}`);
      return `V=${ins.volume_mm3}`;
    }),
  );

  out.push(
    await run("plate", "Four corner holes stay 10 mm inset", async () => {
      const { document } = applyAll(emptyDocument("hole-plate"), [
        { op: "define_parameter", name: "length", value: 100 },
        { op: "define_parameter", name: "width", value: 60 },
        { op: "define_parameter", name: "thickness", value: 5 },
        { op: "define_parameter", name: "inset", value: 10 },
        { op: "define_parameter", name: "hole_d", value: 4 },
        { op: "create_box", name: "Plate", length_mm: "length", width_mm: "width", height_mm: "thickness" },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "inset", y_mm: "inset", diameter_mm: "hole_d", through: true, name: "FL" },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "length - inset", y_mm: "inset", diameter_mm: "hole_d", through: true, name: "FR" },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "inset", y_mm: "width - inset", diameter_mm: "hole_d", through: true, name: "BL" },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: "length - inset", y_mm: "width - inset", diameter_mm: "hole_d", through: true, name: "BR" },
      ]);
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues));
      const v0 = 100 * 60 * 5 - 4 * HOLE_VOL;
      assert(approx(a.volume_mm3, v0, 3), `V0 ${a.volume_mm3}`);
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "length", value: 140 });
      const { document: d3 } = applyOperation(d2, { op: "set_parameter", name: "width", value: 80 });
      const b = await freeCadKernel.inspect(d3);
      assert(b.valid, JSON.stringify(b.issues));
      const v1 = 140 * 80 * 5 - 4 * HOLE_VOL;
      assert(approx(b.volume_mm3, v1, 3), `V1 ${b.volume_mm3}`);
      const dx = b.bounding_box!.max.x - b.bounding_box!.min.x;
      const dy = b.bounding_box!.max.y - b.bounding_box!.min.y;
      assert(approx(dx, 140, 0.1) && approx(dy, 80, 0.1), `bbox ${dx}x${dy}`);
      const step = await freeCadKernel.exportModel(d3, { format: "step", projectSlug: "hole-plate" });
      const fcstd = await freeCadKernel.exportModel(d3, { format: "fcstd", projectSlug: "hole-plate" });
      assert(existsSync(step.path) && step.bytes > 0, "step");
      assert(existsSync(fcstd.path) && fcstd.bytes > 0, "fcstd");
      return `V ${a.volume_mm3.toFixed(1)}→${b.volume_mm3.toFixed(1)} step=${step.bytes}`;
    }),
  );

  out.push(
    await run("cbore", "Counterbore hole", async () => {
      const { document } = applyAll(emptyDocument("cbore"), [
        { op: "create_box", length_mm: 40, width_mm: 40, height_mm: 10 },
        {
          op: "create_hole",
          body_id: "Body",
          face: "top_face",
          x_mm: 20,
          y_mm: 20,
          diameter_mm: 4,
          through: true,
          counterbore_diameter_mm: 8,
          counterbore_depth_mm: 2,
          name: "CBore",
        },
      ]);
      const ins = await freeCadKernel.inspect(document);
      assert(ins.valid, JSON.stringify(ins.issues));
      const throughOnly = 40 * 40 * 10 - Math.PI * 4 * 10;
      assert(ins.volume_mm3 < throughOnly - 10, `counterbore should remove extra material ${ins.volume_mm3} vs ${throughOnly}`);
      return `V=${ins.volume_mm3}`;
    }),
  );

  out.push(
    await run("query", "FreeCAD top_perimeter query", async () => {
      const { document } = applyAll(emptyDocument("q"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const q = await queryGeometry(document, { entity: "edge", selector: "top_perimeter" });
      assert(q.match_count === 4, `count ${q.match_count} ${JSON.stringify(q.matches)}`);
      assert(q.kernel === "freecad", q.kernel);
      return q.matches.map((m) => m.semantic_id).join(",");
    }),
  );

  await worker.restart();
  const failed = out.filter((t) => !t.passed).length;
  console.log(`\n${out.length - failed}/${out.length} hole tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
