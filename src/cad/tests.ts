import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import { evaluateDocument } from "./evaluate";
import { runExample } from "./examples";
import type { CadDocument } from "./types";

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function approx(a: number, b: number, eps = 1.5) {
  return Math.abs(a - b) <= eps;
}

function run(id: string, name: string, fn: () => string | void): TestResult {
  try {
    const detail = fn() ?? "ok";
    return { id, name, passed: true, detail };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function runAcceptanceTests(): TestResult[] {
  const out: TestResult[] = [];

  out.push(
    run("primitive-box", "Primitive box volume", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_box", length_mm: 10, width_mm: 20, height_mm: 30 },
      ]);
      const ev = evaluateDocument(document);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      assert(approx(ev.volumeMm3, 6000, 8), `volume ${ev.volumeMm3} != 6000`);
      const bb = ev.bbox!;
      assert(approx(bb.max.x - bb.min.x, 10), "length");
      assert(approx(bb.max.y - bb.min.y, 20), "width");
      assert(approx(bb.max.z - bb.min.z, 30), "height");
      return `V=${ev.volumeMm3.toFixed(1)} mm³`;
    }),
  );

  out.push(
    run("primitive-cyl", "Primitive cylinder", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_cylinder", radius_mm: 5, height_mm: 10 },
      ]);
      const ev = evaluateDocument(document);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      const expected = Math.PI * 25 * 10;
      assert(approx(ev.volumeMm3, expected, 15), `volume ${ev.volumeMm3} != ${expected}`);
      return `V=${ev.volumeMm3.toFixed(1)} mm³`;
    }),
  );

  out.push(
    run("primitive-sphere", "Primitive sphere", () => {
      const { document } = applyAll(emptyDocument("t"), [{ op: "create_sphere", radius_mm: 10 }]);
      const ev = evaluateDocument(document);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      const expected = (4 / 3) * Math.PI * 1000;
      assert(approx(ev.volumeMm3, expected, 150), `volume ${ev.volumeMm3} != ${expected}`);
      return `V=${ev.volumeMm3.toFixed(1)} mm³`;
    }),
  );

  out.push(
    run("bracket", "Parametric bracket + param change", () => {
      const { document, results } = runExample("bracket");
      const failed = results.find((r) => !r.ok);
      assert(!failed, failed?.error?.message ?? "ops failed");
      const ev1 = evaluateDocument(document);
      assert(ev1.ok, ev1.issues.map((i) => i.message).join("; "));
      assert(ev1.volumeMm3 > 100, "volume too small");
      const { document: d2, result } = applyOperation(document, {
        op: "set_parameter",
        name: "length",
        value: 80,
      });
      assert(result.ok, result.error?.message ?? "set_parameter failed");
      const ev2 = evaluateDocument(d2);
      assert(ev2.ok, ev2.issues.map((i) => i.message).join("; "));
      assert(ev2.bbox && ev2.bbox.max.x - ev2.bbox.min.x > 79, "length did not update");
      return `V ${ev1.volumeMm3.toFixed(0)} → ${ev2.volumeMm3.toFixed(0)} mm³`;
    }),
  );

  out.push(
    run("enclosure", "Electronics enclosure", () => {
      const { document, results } = runExample("enclosure");
      const failed = results.find((r) => !r.ok);
      assert(!failed, failed?.error?.message ?? "ops failed");
      const ev = evaluateDocument(document);
      const errors = ev.issues.filter((i) => i.severity === "error");
      assert(errors.length === 0, errors.map((i) => i.message).join("; "));
      const visible = ev.bodies.filter((b) => b.visible && !b.consumed && b.mesh);
      assert(visible.length >= 2, `expected base+lid, got ${visible.map((b) => b.name).join(",")}`);
      return `${visible.length} bodies, V=${ev.volumeMm3.toFixed(0)} mm³`;
    }),
  );

  out.push(
    run("revision", "Revision rollback", () => {
      let doc: CadDocument = emptyDocument("t");
      doc = applyOperation(doc, { op: "create_box", length_mm: 10, width_mm: 10, height_mm: 10 }).document;
      const rev = doc.currentRevisionId!;
      doc = applyOperation(doc, {
        op: "set_feature_param",
        feature_id: "Box",
        param: "length",
        value: 50,
      }).document;
      const evMid = evaluateDocument(doc);
      assert(evMid.bbox && evMid.bbox.max.x - evMid.bbox.min.x > 49, "edit failed");
      doc = applyOperation(doc, { op: "rollback_revision", revision_id: rev }).document;
      const ev = evaluateDocument(doc);
      assert(ev.bbox && approx(ev.bbox.max.x - ev.bbox.min.x, 10), "rollback did not restore length");
      return "restored 10 mm cube";
    }),
  );

  out.push(
    run("export", "STL export", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_box", length_mm: 5, width_mm: 5, height_mm: 5 },
        { op: "export_stl" },
      ]);
      const { result } = applyOperation(document, { op: "export_stl" });
      assert(result.ok, result.error?.message ?? "export failed");
      const ascii = (result.data as { ascii: string }).ascii;
      assert(ascii.includes("solid"), "not STL");
      assert(ascii.includes("facet"), "no facets");
      return `${ascii.split("\n").length} lines`;
    }),
  );

  out.push(
    run("fail-fillet", "Impossible fillet returns structured error", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_box", length_mm: 10, width_mm: 10, height_mm: 10 },
        { op: "fillet", body_id: "Body", radius_mm: 8 },
      ]);
      const ev = evaluateDocument(document);
      const hit = ev.issues.find((i) => i.code === "FILLET_RADIUS_TOO_LARGE");
      assert(hit, `expected FILLET_RADIUS_TOO_LARGE, got ${ev.issues.map((i) => i.code).join(",")}`);
      return hit!.message;
    }),
  );

  out.push(
    run("fail-hole", "Hole outside face", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "create_box", length_mm: 20, width_mm: 20, height_mm: 8 },
        { op: "create_hole", body_id: "Body", face: "top_face", x_mm: 1, y_mm: 1, diameter_mm: 6, through: true },
      ]);
      const ev = evaluateDocument(document);
      const hit = ev.issues.find((i) => i.code === "HOLE_OUTSIDE_FACE" || i.code === "HOLE_DIAMETER_INVALID");
      assert(hit, `expected hole error, got ${ev.issues.map((i) => i.code).join(",")}`);
      return hit!.code;
    }),
  );

  out.push(
    run("fail-ref", "Unknown body", () => {
      const { result } = applyOperation(emptyDocument("t"), {
        op: "create_hole",
        body_id: "nope",
        face: "top_face",
        x_mm: 5,
        y_mm: 5,
        diameter_mm: 3,
        through: true,
      });
      assert(!result.ok && result.error?.error === "UNKNOWN_BODY", JSON.stringify(result.error));
      return result.error!.error;
    }),
  );

  out.push(
    run("expr-cavity", "Cavity origin follows wall expression", () => {
      const { document } = applyAll(emptyDocument("t"), [
        { op: "define_parameter", name: "wall", value: 2.4 },
        { op: "create_box", name: "Outer", length_mm: "100 + 0 * wall", width_mm: 80, height_mm: 20 },
        { op: "create_body", name: "Cavity" },
        {
          op: "create_box",
          body_id: "Cavity",
          name: "Inner",
          length_mm: "80",
          width_mm: 60,
          height_mm: 20,
          origin: { x: "wall", y: "wall", z: "wall" },
        },
      ]);
      const inner = document.features.find((f) => f.name === "Inner");
      assert(inner?.kind === "box" && inner.origin.x === "wall", "origin not expression");
      const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
      const ev = evaluateDocument(d2);
      assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
      const cav = ev.bodies.find((b) => b.name === "Cavity");
      assert(cav, "cavity body");
      assert(approx(cav.bbox.min.x, 3, 0.05), `cavity x ${cav.bbox.min.x}`);
      assert(approx(cav.bbox.min.y, 3, 0.05), `cavity y ${cav.bbox.min.y}`);
      return `cavity origin x=${cav.bbox.min.x}`;
    }),
  );

  return out;
}
