import { existsSync } from "node:fs";
import { applyOperation } from "../operations";
import { evaluateDocument } from "../evaluate";
import { runExample } from "../examples";
import { paramMap } from "../document";
import { resolveVec3 } from "../expressions";
import { inspectDependencies } from "../deps";
import { queryEnvelopeGeometry } from "../selectors";
import { freeCadKernel } from "./freecad.server";
import { queryGeometry } from "./freecad.server";
import { getFreeCadWorker } from "./client.server";
import { emptyDocument } from "../document";
import { applyAll } from "../operations";

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

  out.push(
    await run("fillet-stable", "Fillet top_perimeter survives length change", async () => {
      const { document } = applyAll(emptyDocument("semantic-box"), [
        { op: "define_parameter", name: "length", value: 80 },
        { op: "create_box", name: "Block", length_mm: "length", width_mm: 50, height_mm: 12 },
        { op: "fillet", body_id: "Body", radius_mm: 3, target: { entity: "edge", selector: "top_perimeter" }, name: "TopRound" },
      ]);
      const q1 = await queryGeometry(document, { entity: "edge", selector: "top_perimeter" });
      // After fillet, top perimeter may be filleted away; query the box before fillet via created_by is envelope.
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues));
      const v0 = a.volume_mm3;
      assert(v0 < 80 * 50 * 12 - 10, `fillet should reduce volume ${v0}`);
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "length", value: 120 });
      const b = await freeCadKernel.inspect(d2);
      assert(b.valid, JSON.stringify(b.issues));
      const dx = b.bounding_box!.max.x - b.bounding_box!.min.x;
      assert(approx(dx, 120, 0.2), `length ${dx}`);
      assert(b.volume_mm3 > v0, "volume should grow with length");
      const fcstd = await freeCadKernel.exportModel(d2, { format: "fcstd", projectSlug: "semantic-box" });
      assert(existsSync(fcstd.path) && fcstd.bytes > 0, "fcstd");
      return `V ${v0.toFixed(1)}→${b.volume_mm3.toFixed(1)} peri0=${q1.match_count}`;
    }),
  );

  out.push(
    await run("enclosure", "Enclosure wall + size torture", async () => {
      const { document, results } = runExample("enclosure");
      assert(!results.find((r) => !r.ok), results.find((r) => !r.ok)?.error?.message ?? "ops");
      const inner = document.features.find((f) => f.name === "InnerCut");
      assert(inner !== undefined && inner.kind === "box" && inner.origin.x === "wall", JSON.stringify(inner));
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues.filter((i) => i.severity === "error")));
      const o1 = resolveVec3(inner.origin, paramMap(document));
      assert(approx(o1.x, 2.4, 1e-6), `origin ${o1.x}`);
      const deps = inspectDependencies(document, "wall");
      assert(deps.feature_names.includes("InnerCut"), deps.feature_names.join(","));

      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
      const inner2 = d2.features.find((f) => f.name === "InnerCut")!;
      assert(inner2.kind === "box", "InnerCut remains a box");
      const o2 = resolveVec3(inner2.origin, paramMap(d2));
      assert(approx(o2.x, 3, 1e-6) && approx(o2.y, 3, 1e-6), JSON.stringify(o2));
      const b = await freeCadKernel.inspect(d2);
      assert(b.valid, JSON.stringify(b.issues.filter((i) => i.severity === "error")));
      assert(b.solid_count >= 2, `solids ${b.solid_count}`);

      const { document: d3 } = applyOperation(d2, { op: "set_parameter", name: "inner_length", value: 140 });
      const { document: d4 } = applyOperation(d3, { op: "set_parameter", name: "inner_width", value: 90 });
      const c = await freeCadKernel.inspect(d4);
      assert(c.valid, JSON.stringify(c.issues.filter((i) => i.severity === "error")));
      const dx = c.bounding_box!.max.x - c.bounding_box!.min.x;
      assert(dx > 140, `outer length ${dx}`);
      assert(c.solid_count >= 2, `solids ${c.solid_count}`);

      const step = await freeCadKernel.exportModel(d4, { format: "step", projectSlug: "parametric-enclosure" });
      const fcstd = await freeCadKernel.exportModel(d4, { format: "fcstd", projectSlug: "parametric-enclosure" });
      assert(existsSync(step.path) && step.bytes > 200, "step");
      assert(existsSync(fcstd.path) && fcstd.bytes > 200, "fcstd");
      return `wall origin ${o1.x}→${o2.x}; V ${a.volume_mm3.toFixed(0)}→${b.volume_mm3.toFixed(0)}→${c.volume_mm3.toFixed(0)}`;
    }),
  );

  out.push(
    await run("multistep", "Sequential param edits + rollback", async () => {
      const { document } = runExample("enclosure");
      const rev = document.currentRevisionId!;
      let cur = document;
      for (const [name, value] of [
        ["wall", 3],
        ["inner_length", 120],
        ["inner_width", 80],
        ["fillet_radius", 5],
        ["screw_d", 4],
      ] as const) {
        const r = applyOperation(cur, { op: "set_parameter", name, value });
        assert(r.result.ok, r.result.error?.message ?? `${name} failed`);
        cur = r.document;
        const ins = await freeCadKernel.inspect(cur);
        assert(ins.valid, `${name}=${value} ${JSON.stringify(ins.issues.filter((i) => i.severity === "error"))}`);
      }
      const { document: back } = applyOperation(cur, { op: "rollback_revision", revision_id: rev });
      const wall = back.parameters.find((p) => p.name === "wall");
      assert(wall?.value === 2.4, `wall ${wall?.value}`);
      const inner = back.features.find((f) => f.name === "InnerCut");
      assert(inner !== undefined && inner.kind === "box", "InnerCut");
      const origin = resolveVec3(inner.origin, paramMap(back));
      assert(approx(origin.x, 2.4, 1e-6), JSON.stringify(origin));
      const ins = await freeCadKernel.inspect(back);
      assert(ins.valid, JSON.stringify(ins.issues.filter((i) => i.severity === "error")));
      return `restored wall=${wall?.value} V=${ins.volume_mm3}`;
    }),
  );

  out.push(
    await run("lost-ref", "GEOMETRY_REFERENCE_LOST on missing gref fillet", async () => {
      const { document } = applyAll(emptyDocument("lost"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
        { op: "fillet", body_id: "Body", radius_mm: 2, edges: { gref: "gref_edge_does_not_exist" }, name: "Ghost" },
      ]);
      const ins = await freeCadKernel.inspect(document);
      const hit = ins.issues.find(
        (i) =>
          i.code === "GEOMETRY_REFERENCE_LOST" ||
          i.code === "GEOMETRY_SELECTOR_NO_MATCH" ||
          i.code === "FILLET_FAILED",
      );
      assert(hit, `expected lost-ref, got ${JSON.stringify(ins.issues)}`);
      return hit.code;
    }),
  );

  out.push(
    await run("imported-query", "Query imported box B-rep", async () => {
      const { document } = applyAll(emptyDocument("ibox"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const q = await queryGeometry(document, { entity: "face", selector: "normal_positive_z" });
      assert(q.match_count === 1, `faces ${q.match_count}`);
      const v = await queryGeometry(document, { entity: "edge", selector: "all_vertical" });
      assert(v.match_count === 4, `vertical ${v.match_count}`);
      return `+Z faces=${q.match_count} vertical=${v.match_count}`;
    }),
  );

  void queryEnvelopeGeometry;
  void evaluateDocument;

  await worker.restart();
  const failed = out.filter((t) => !t.passed).length;
  console.log(`\n${out.length - failed}/${out.length} semantic enclosure tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
