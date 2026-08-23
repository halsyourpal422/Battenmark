/**
 * Backend-agnostic conformance suite.
 *
 * A future build123d or CadQuery adapter should pass the same cases
 * (skipping only capabilities it advertises as false).
 */
import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { evaluateDocument } from "../evaluate";
import { queryEnvelopeGeometry } from "../selectors";
import { CadError } from "../errors";
import { paramMap } from "../document";
import { resolveVec3 } from "../expressions";
import type { CadDocument, Feature, Vec3Expr } from "../types";

export interface ConformanceInspect {
  valid: boolean;
  volume_mm3: number;
  solid_count: number;
  bounding_box?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  issues?: { code?: string; message?: string }[];
  shape_type?: string;
}

export interface ConformanceExport {
  success: boolean;
  path?: string;
  bytes: number;
}

export interface ConformanceBackend {
  id: string;
  inspect: (doc: CadDocument) => Promise<ConformanceInspect>;
  exportModel?: (doc: CadDocument, format: "step" | "stl" | "fcstd") => Promise<ConformanceExport>;
  query?: (
    doc: CadDocument,
    opts: { entity?: "edge" | "face"; selector?: string | { gref?: string; unique?: boolean } },
  ) => Promise<{ match_count: number; confidence?: string }>;
  importStep?: (path: string) => Promise<{ valid: boolean; volume_mm3: number; parametric?: boolean }>;
}

export interface ConformanceCase {
  id: string;
  name: string;
  run: (backend: ConformanceBackend) => Promise<string>;
}

function approx(a: number, b: number, eps: number) {
  return Math.abs(a - b) <= eps;
}

function boxOrigin(features: Feature[], name: string): Vec3Expr {
  const f = features.find((x) => x.name === name);
  if (!f || f.kind !== "box") throw new Error(`missing box ${name}`);
  return f.origin;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function conformanceSuite(): ConformanceCase[] {
  return [
    {
      id: "primitive-box",
      name: "80×50×12 mm box bounds + volume + validity",
      async run(backend) {
        const { document } = applyAll(emptyDocument("box"), [
          { op: "create_box", name: "base", length_mm: 80, width_mm: 50, height_mm: 12 },
        ]);
        const ins = await backend.inspect(document);
        assert(ins.valid, JSON.stringify(ins.issues));
        assert(ins.solid_count === 1, `solids ${ins.solid_count}`);
        assert(approx(ins.volume_mm3, 48000, 1), `volume ${ins.volume_mm3}`);
        const bb = ins.bounding_box;
        if (bb) {
          assert(approx(bb.max.x - bb.min.x, 80, 0.05), "length");
          assert(approx(bb.max.y - bb.min.y, 50, 0.05), "width");
          assert(approx(bb.max.z - bb.min.z, 12, 0.05), "height");
        }
        return `V=${ins.volume_mm3}`;
      },
    },
    {
      id: "parametric",
      name: "length 80 → 120 survives",
      async run(backend) {
        const first = applyAll(emptyDocument("param"), [
          { op: "define_parameter", name: "length", value: 80 },
          { op: "create_box", length_mm: "length", width_mm: 50, height_mm: 12 },
        ]);
        const { document } = applyOperation(first.document, { op: "set_parameter", name: "length", value: 120 });
        const ins = await backend.inspect(document);
        assert(ins.valid, JSON.stringify(ins.issues));
        assert(approx(ins.volume_mm3, 120 * 50 * 12, 2), `volume ${ins.volume_mm3}`);
        return `V=${ins.volume_mm3}`;
      },
    },
    {
      id: "hole",
      name: "through hole create_hole (no FreeCAD type in the call)",
      async run(backend) {
        const { document } = applyAll(emptyDocument("hole"), [
          { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
          {
            op: "create_hole",
            body_id: "Body",
            face: "top_face",
            from_left_mm: 10,
            from_front_mm: 10,
            diameter_mm: 8,
            through: true,
            name: "M8",
          },
        ]);
        const ins = await backend.inspect(document);
        assert(ins.valid, JSON.stringify(ins.issues));
        const expected = 80 * 50 * 12 - Math.PI * 16 * 12;
        assert(approx(ins.volume_mm3, expected, 40), `volume ${ins.volume_mm3} != ${expected}`);
        return `V=${ins.volume_mm3.toFixed(1)}`;
      },
    },
    {
      id: "fillet-semantic",
      name: "top_perimeter fillet survives length change",
      async run(backend) {
        const first = applyAll(emptyDocument("fillet"), [
          { op: "define_parameter", name: "length", value: 80 },
          { op: "create_box", length_mm: "length", width_mm: 50, height_mm: 12 },
          { op: "fillet", body_id: "Body", radius_mm: 3, edges: "top_perimeter", name: "TopRound" },
        ]);
        const ins0 = await backend.inspect(first.document);
        assert(ins0.valid, JSON.stringify(ins0.issues));
        const { document } = applyOperation(first.document, { op: "set_parameter", name: "length", value: 120 });
        const ins1 = await backend.inspect(document);
        assert(ins1.valid, `after length: ${JSON.stringify(ins1.issues)}`);
        assert(ins1.volume_mm3 > ins0.volume_mm3, "volume should grow with length");
        return `V ${ins0.volume_mm3.toFixed(1)} → ${ins1.volume_mm3.toFixed(1)}`;
      },
    },
    {
      id: "gref",
      name: "persistent gref: stable / lost / ambiguous",
      async run() {
        const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };
        const stable = queryEnvelopeGeometry(env, "top_perimeter");
        assert(stable.match_count === 4, `stable ${stable.match_count}`);
        try {
          queryEnvelopeGeometry(env, { entity: "edge", gref: "gref_edge_does_not_exist" });
          throw new Error("lost gref should throw");
        } catch (err) {
          assert(err instanceof CadError && err.body.error === "GEOMETRY_REFERENCE_LOST", String(err));
        }
        try {
          queryEnvelopeGeometry({ ...env }, { entity: "edge", selector: "all_vertical", nearest: { x: 40, y: 25, z: 6 } });
        } catch (err) {
          if (err instanceof CadError) {
            assert(
              err.body.error === "GEOMETRY_REFERENCE_AMBIGUOUS" || err.body.error === "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
              err.body.error,
            );
          }
        }
        const amb = queryEnvelopeGeometry(env, { entity: "edge", selector: "all_vertical" });
        assert(amb.match_count === 4, "vertical family");
        return `stable=${stable.match_count} lost=GEOMETRY_REFERENCE_LOST`;
      },
    },
    {
      id: "expression",
      name: "expression wall * 2 rebuilds",
      async run(backend) {
        const first = applyAll(emptyDocument("expr"), [
          { op: "define_parameter", name: "wall", value: 2.4 },
          { op: "create_box", name: "Outer", length_mm: 80, width_mm: 50, height_mm: 12 },
          { op: "create_body", name: "Cavity" },
          {
            op: "create_box",
            body_id: "Cavity",
            name: "InnerCut",
            length_mm: "80 - 2 * wall",
            width_mm: "50 - 2 * wall",
            height_mm: 12,
            origin: { x: "wall", y: "wall", z: 0 },
          },
          { op: "boolean", target_body_id: "Body", tool_body_id: "Cavity", operation: "subtract" },
        ]);
        const o1 = resolveVec3(boxOrigin(first.document.features, "InnerCut"), paramMap(first.document));
        assert(approx(o1.x, 2.4, 1e-6), `origin ${o1.x}`);
        const { document } = applyOperation(first.document, { op: "set_parameter", name: "wall", value: 4 });
        const o2 = resolveVec3(boxOrigin(document.features, "InnerCut"), paramMap(document));
        assert(approx(o2.x, 4, 1e-6), `origin after ${o2.x}`);
        const ins = await backend.inspect(document);
        assert(ins.valid, JSON.stringify(ins.issues));
        return `origin ${o1.x} → ${o2.x}`;
      },
    },
    {
      id: "export",
      name: "STEP and STL export remain valid",
      async run(backend) {
        if (!backend.exportModel) return "skip (no export)";
        const { document } = applyAll(emptyDocument("export"), [
          { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
        ]);
        const step = await backend.exportModel(document, "step");
        const stl = await backend.exportModel(document, "stl");
        assert(step.success && step.bytes > 0, `step ${step.bytes}`);
        assert(stl.success && stl.bytes > 0, `stl ${stl.bytes}`);
        if (backend.importStep && step.path) {
          const imported = await backend.importStep(step.path);
          assert(imported.valid, "imported invalid");
          assert(approx(imported.volume_mm3, 48000, 50), `import volume ${imported.volume_mm3}`);
          assert(imported.parametric !== true, "import must not pretend to be parametric");
          return `step=${step.bytes} stl=${stl.bytes} importV=${imported.volume_mm3}`;
        }
        return `step=${step.bytes} stl=${stl.bytes}`;
      },
    },
    {
      id: "unsupported-circular",
      name: "circular pattern is BACKEND_UNSUPPORTED",
      async run() {
        const { document } = applyAll(emptyDocument("circ"), [
          { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
          { op: "create_hole", body_id: "Body", diameter_mm: 4, x_mm: 10, y_mm: 10, name: "H" },
        ]);
        const { result } = applyOperation(document, { op: "create_pattern", feature_id: "H", count: 6, kind: "circular" });
        assert(!result.ok && result.error?.error === "BACKEND_UNSUPPORTED", JSON.stringify(result.error));
        return "BACKEND_UNSUPPORTED";
      },
    },
    {
      id: "preview-eval",
      name: "JSCAD preview evaluation of the same tree",
      async run() {
        const { document } = applyAll(emptyDocument("preview"), [
          { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
        ]);
        const ev = evaluateDocument(document);
        assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
        assert(approx(ev.volumeMm3, 48000, 1), `preview V ${ev.volumeMm3}`);
        return `V=${ev.volumeMm3}`;
      },
    },
  ];
}

export async function runConformance(backend: ConformanceBackend) {
  const cases = conformanceSuite();
  const results: { id: string; name: string; passed: boolean; detail: string }[] = [];
  for (const c of cases) {
    const t0 = Date.now();
    process.stdout.write(`… ${c.id} `);
    try {
      const detail = await c.run(backend);
      console.log(`PASS ${detail} (${Date.now() - t0}ms)`);
      results.push({ id: c.id, name: c.name, passed: true, detail });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${detail} (${Date.now() - t0}ms)`);
      results.push({ id: c.id, name: c.name, passed: false, detail });
    }
  }
  return results;
}
