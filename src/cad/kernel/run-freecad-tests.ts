import { existsSync, readFileSync } from "node:fs";
import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { runExample } from "../examples";
import { freeCadKernel } from "./freecad.server";
import { getFreeCadWorker, CadWorkerError } from "./client.server";
import { slugify, workspacePath } from "./workspace.server";

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
    const r = { id, name, passed: true, detail: `${detail} (${Date.now() - t0}ms)` };
    console.log(`PASS ${r.detail}`);
    return r;
  } catch (err) {
    const r = { id, name, passed: false, detail: `${err instanceof Error ? err.message : String(err)} (${Date.now() - t0}ms)` };
    console.log(`FAIL ${r.detail}`);
    return r;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const out: T[] = [];
  const worker = getFreeCadWorker();

  out.push(
    await run("hello", "FreeCAD worker hello", async () => {
      const status = await freeCadKernel.available();
      assert(status.available, status.detail ?? "kernel unavailable");
      assert(status.version && status.version.startsWith("1."), `version ${status.version}`);
      assert(status.headless, "not headless");
      return `${status.version} pid=${status.pid} py=${status.python}`;
    }),
  );

  out.push(
    await run("box", "Create 80×50×12 mm box", async () => {
      const { document } = applyAll(emptyDocument("vslice-box"), [
        { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const inspected = await freeCadKernel.inspect(document);
      assert(inspected.valid, JSON.stringify(inspected.issues));
      assert(inspected.solid_count === 1, `solids ${inspected.solid_count}`);
      assert(approx(inspected.volume_mm3, 48000, 1), `volume ${inspected.volume_mm3}`);
      const bb = inspected.bounding_box!;
      assert(approx((bb.max.x - bb.min.x) || bb.x || 0, 80, 0.05), "length");
      assert(approx((bb.max.y - bb.min.y) || bb.y || 0, 50, 0.05), "width");
      assert(approx((bb.max.z - bb.min.z) || bb.z || 0, 12, 0.05), "height");
      return `V=${inspected.volume_mm3} ${inspected.shape_type}`;
    }),
  );

  out.push(
    await run("export", "FCStd / STEP / STL export", async () => {
      const { document } = applyAll(emptyDocument("vslice-box"), [
        { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const fcstd = await freeCadKernel.exportModel(document, { format: "fcstd", projectSlug: "vslice-box" });
      const step = await freeCadKernel.exportModel(document, { format: "step", projectSlug: "vslice-box" });
      const stl = await freeCadKernel.exportModel(document, { format: "stl", projectSlug: "vslice-box" });
      assert(existsSync(fcstd.path) && fcstd.bytes > 0, "fcstd missing");
      assert(existsSync(step.path) && step.bytes > 0, "step missing");
      assert(existsSync(stl.path) && stl.bytes > 0, "stl missing");
      const head = readFileSync(step.path, "utf8").slice(0, 20);
      assert(head.includes("ISO-10303"), `step head ${head}`);
      const names = readFileSync(fcstd.path);
      assert(names[0] === 0x50 && names[1] === 0x4b, "fcstd is not a zip");
      return `fcstd=${fcstd.bytes} step=${step.bytes} stl=${stl.bytes}`;
    }),
  );

  out.push(
    await run("param", "Parametric length 80 → 100", async () => {
      const { document } = applyAll(emptyDocument("vslice-box"), [
        { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const before = await freeCadKernel.inspect(document);
      const { document: edited } = applyOperation(document, {
        op: "set_feature_param",
        feature_id: "base",
        param: "length",
        value: 100,
      });
      const after = await freeCadKernel.inspect(edited);
      assert(after.valid, JSON.stringify(after.issues));
      assert(approx(after.volume_mm3, 60000, 1), `volume ${after.volume_mm3}`);
      const dx = after.bounding_box!.max.x - after.bounding_box!.min.x;
      assert(approx(dx, 100, 0.05), `bbox x ${dx}`);
      return `V ${before.volume_mm3} → ${after.volume_mm3}`;
    }),
  );

  out.push(
    await run("pocket-depth", "Pocket depth 3 → 6 rebuild/export/restart", async () => {
      const { document, results } = applyAll(emptyDocument("pocket-depth-regression"), [
        { op: "create_box", name: "Base", length_mm: 20, width_mm: 20, height_mm: 6 },
        { op: "create_sketch", body_id: "Body", name: "VentSketch", plane: "XY", origin: { x: 5, y: 5, z: 0 } },
        { op: "add_rectangle", sketch_id: "VentSketch", x_mm: 0, y_mm: 0, width_mm: 2, height_mm: 10 },
        { op: "pocket", sketch_id: "VentSketch", name: "VentPocket", depth_mm: 3 },
      ]);
      assert(!results.find((r) => !r.ok), results.find((r) => !r.ok)?.error?.message ?? "ops");

      const before = await freeCadKernel.inspect(document);
      assert(before.valid, JSON.stringify(before.issues));
      assert(approx(before.volume_mm3, 2340, 0.2), `3 mm pocket volume ${before.volume_mm3}`);

      const changed = applyOperation(document, {
        op: "set_feature_param",
        feature_id: "VentPocket",
        param: "depth",
        value: 6,
      });
      assert(changed.result.ok, changed.result.error?.message ?? "set_feature_param failed");
      const edited = changed.document;
      const pocket = edited.features.find((f) => f.name === "VentPocket");
      assert(pocket?.kind === "pocket" && pocket.depth === 6, "IR pocket depth did not update to 6 mm");

      const after = await freeCadKernel.inspect(edited);
      assert(after.valid, JSON.stringify(after.issues));
      assert(approx(after.volume_mm3, 2280, 0.2), `6 mm pocket volume ${after.volume_mm3}`);

      const step = await freeCadKernel.exportModel(edited, { format: "step", projectSlug: "pocket-depth-regression" });
      const mf3 = await freeCadKernel.exportModel(edited, { format: "3mf", projectSlug: "pocket-depth-regression" });
      assert(existsSync(step.path) && step.bytes > 0, "updated STEP missing");
      assert(existsSync(mf3.path) && mf3.bytes > 0, "updated 3MF missing");
      assert(step.validation?.valid, JSON.stringify(step.validation?.issues ?? []));
      assert(mf3.validation?.valid, JSON.stringify(mf3.validation?.issues ?? []));
      assert(approx(step.validation?.volume_mm3 ?? 0, 2280, 0.2), `STEP rebuild volume ${step.validation?.volume_mm3}`);
      assert(approx(mf3.validation?.volume_mm3 ?? 0, 2280, 0.2), `3MF rebuild volume ${mf3.validation?.volume_mm3}`);

      await worker.restart();
      const reopened = await freeCadKernel.inspect(edited);
      assert(reopened.valid, JSON.stringify(reopened.issues));
      assert(approx(reopened.volume_mm3, 2280, 0.2), `post-restart volume ${reopened.volume_mm3}`);
      return `V ${before.volume_mm3} → ${after.volume_mm3}; STEP/3MF/restart=${reopened.volume_mm3}`;
    }),
  );

  out.push(
    await run("validate", "B-rep validity of the box", async () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_box", length_mm: 10, width_mm: 10, height_mm: 10 },
        { op: "fillet", body_id: "Body", radius_mm: 8 },
      ]);
      const inspected = await freeCadKernel.inspect(document);
      const hit = inspected.issues.find(
        (i) => i.code === "FILLET_RADIUS_TOO_LARGE" || i.code === "FILLET_FAILED",
      );
      assert(hit, `expected fillet error, got ${JSON.stringify(inspected.issues)}`);
      return hit.code;
    }),
  );

  out.push(
    await run("bracket", "L-bracket + length change + rollback", async () => {
      const { document, results } = runExample("bracket");
      assert(!results.find((r) => !r.ok), results.find((r) => !r.ok)?.error?.message ?? "ops");
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues));
      assert(a.solid_count === 1, `solids ${a.solid_count}`);
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "length", value: 80 });
      const b = await freeCadKernel.inspect(d2);
      assert(b.valid, JSON.stringify(b.issues));
      const dx = b.bounding_box!.max.x - b.bounding_box!.min.x;
      assert(dx > 79, `length did not update (${dx})`);
      const rev = document.currentRevisionId!;
      const { document: d3 } = applyOperation(d2, { op: "rollback_revision", revision_id: rev });
      const c = await freeCadKernel.inspect(d3);
      const dx2 = c.bounding_box!.max.x - c.bounding_box!.min.x;
      assert(approx(dx2, 60, 0.2), `rollback bbox ${dx2}`);
      return `V ${a.volume_mm3} → ${b.volume_mm3} → ${c.volume_mm3}`;
    }),
  );

  await worker.restart();
  out.push(
    await run("enclosure", "Enclosure + wall 2.4 → 3.0", async () => {
      const { document, results } = runExample("enclosure");
      assert(!results.find((r) => !r.ok), results.find((r) => !r.ok)?.error?.message ?? "ops");
      const a = await freeCadKernel.inspect(document);
      assert(a.valid, JSON.stringify(a.issues));
      const visible = a.bodies.filter((b) => !b.consumed);
      assert(visible.length >= 2, `bodies ${visible.map((b) => b.name).join(",")}`);
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
      const b = await freeCadKernel.inspect(d2);
      assert(b.valid, JSON.stringify(b.issues));
      const x = b.bounding_box!.max.x - b.bounding_box!.min.x;
      assert(approx(x, 106, 0.2), `outer length ${x}, expected 106`);
      assert(b.volume_mm3 > a.volume_mm3, "volume should grow with wall");
      const step = await freeCadKernel.exportModel(d2, { format: "step", projectSlug: "enclosure" });
      const fc = await freeCadKernel.exportModel(d2, { format: "fcstd", projectSlug: "enclosure" });
      assert(existsSync(step.path) && existsSync(fc.path), "exports missing");
      return `V ${a.volume_mm3} → ${b.volume_mm3}; step=${step.bytes}`;
    }),
  );

  out.push(
    await run("crash", "Worker crash restarts", async () => {
      const pid = worker.getPid();
      assert(pid, "no pid");
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already dead */
      }
      await new Promise((r) => setTimeout(r, 300));
      const status = await freeCadKernel.available();
      assert(status.available, status.detail ?? "did not recover");
      assert(status.pid && status.pid !== pid, `pid did not change (${status.pid})`);
      return `restarted ${pid} → ${status.pid}`;
    }),
  );

  out.push(
    await run("restart-race", "worker.kill + immediate respawn race", async () => {
      const pid = worker.getPid();
      assert(pid, "no pid");
      const pre = await freeCadKernel.available();
      assert(pre.available, pre.detail ?? "pre-kill unavailable");
      worker.kill("SIGKILL");
      const status = await freeCadKernel.available();
      assert(status.available, status.detail ?? "restart failed");
      assert(status.pid && status.pid !== pid, `pid did not change (${status.pid})`);
      return `${pid} → ${status.pid}`;
    }),
  );

  out.push(
    await run("denied", "eval_python is not a public op", async () => {
      const raw = await worker.request("eval_python" as never, { arguments: { code: "print(1)" } });
      assert(!raw.ok, "eval_python should be denied");
      assert((raw.error?.code ?? "") === "PRIVILEGED_DENIED", JSON.stringify(raw.error));
      return raw.error?.code ?? "denied";
    }),
  );

  void workspacePath;
  void slugify;
  void CadWorkerError;

  let failed = 0;
  for (const r of out) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(12)} ${r.name} — ${r.detail}`);
    if (!r.passed) failed += 1;
  }
  console.log(`\n${out.length - failed}/${out.length} freecad tests passed`);
  try { await worker.request("shutdown", {}, 5_000); } catch { /* ignore */ }
  worker.kill("SIGKILL");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});