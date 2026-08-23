import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import { queryEnvelopeGeometry } from "./selectors";
import { evaluateDocument } from "./evaluate";
import { CadError } from "./errors";

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function run(id: string, name: string, fn: () => string | void): T {
  try {
    return { id, name, passed: true, detail: fn() ?? "ok" };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const env = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 50, H: 12, createdBy: "Box" };

const results: T[] = [];

results.push(
  run("top-face", "Top face", () => {
    const q = queryEnvelopeGeometry(env, { entity: "face", selector: "top_face" });
    assert(q.match_count === 1 && q.matches[0]?.role === "top_face", JSON.stringify(q.matches));
    return q.matches[0]!.semantic_id;
  }),
);

results.push(
  run("bottom-face", "Bottom face", () => {
    const q = queryEnvelopeGeometry(env, "bottom_face");
    assert(q.match_count === 1, String(q.match_count));
    return q.matches[0]!.role ?? "";
  }),
);

results.push(
  run("largest-planar", "Largest planar (top+bottom tie on non-cube is top/bottom pair)", () => {
    const q = queryEnvelopeGeometry(env, { entity: "face", selector: "largest_planar" });
    assert(q.match_count >= 1, String(q.match_count));
    return `${q.match_count} faces area=${q.matches[0]?.area_mm2}`;
  }),
);

results.push(
  run("vertical", "Vertical edges", () => {
    const q = queryEnvelopeGeometry(env, "all_vertical");
    assert(q.match_count === 4, `count ${q.match_count}`);
    return `4 edges`;
  }),
);

results.push(
  run("top-peri", "Top perimeter", () => {
    const q = queryEnvelopeGeometry(env, "top_perimeter");
    assert(q.match_count === 4, `count ${q.match_count}`);
    const zs = q.matches.map((m) => m.midpoint?.z ?? 0);
    assert(zs.every((z) => Math.abs(z - 12) < 1e-6), `z ${zs}`);
    return q.matches.map((m) => m.semantic_id).join(",");
  }),
);

results.push(
  run("stability", "Selector stability after length change", () => {
    const a = queryEnvelopeGeometry(env, "top_perimeter");
    const env2 = { ...env, L: 120 };
    const b = queryEnvelopeGeometry(env2, "top_perimeter");
    assert(a.match_count === 4 && b.match_count === 4, "count");
    const rolesA = a.matches.map((m) => m.role).sort();
    const rolesB = b.matches.map((m) => m.role).sort();
    assert(rolesA.join() === rolesB.join(), "roles drifted");
    const long = b.matches.filter((m) => Math.abs((m.length_mm ?? 0) - 120) < 0.1);
    assert(long.length === 2, `long edges ${long.length}`);
    return `4→4; two 120 mm edges`;
  }),
);

results.push(
  run("created-by", "created_by filter", () => {
    const q = queryEnvelopeGeometry(env, { entity: "edge", selector: "all_vertical", created_by: "Box" });
    assert(q.match_count === 4, String(q.match_count));
    const miss = queryEnvelopeGeometry(env, { entity: "edge", selector: "all_vertical", created_by: "Nope" });
    assert(miss.match_count === 0, "should miss");
    return "Box=4 Nope=0";
  }),
);

results.push(
  run("adjacent", "adjacent_to top_face", () => {
    const q = queryEnvelopeGeometry(env, {
      entity: "edge",
      selector: "all_edges",
      adjacent_to: "top_face",
    });
    assert(q.match_count === 4, `count ${q.match_count}`);
    assert(q.matches.every((m) => m.role === "top_perimeter"), "not perimeter");
    return "4 top perimeter";
  }),
);

results.push(
  run("no-match", "No match", () => {
    const q = queryEnvelopeGeometry(env, { entity: "face", selector: "cylindrical" });
    assert(q.match_count === 0 && q.confidence === "missing", JSON.stringify(q));
    return "missing";
  }),
);

results.push(
  run("ambiguous", "Nearest tie is ambiguous", () => {
    const square = { origin: { x: 0, y: 0, z: 0 }, L: 80, W: 80, H: 12 };
    try {
      queryEnvelopeGeometry(square, {
        entity: "edge",
        selector: "top_perimeter",
        nearest: { x: 40, y: 40, z: 12 },
      });
      throw new Error("should have thrown");
    } catch (err) {
      assert(err instanceof CadError, "not CadError");
      assert(err.body.error === "GEOMETRY_REFERENCE_AMBIGUOUS", err.body.error);
      return `${err.body.match_count} candidates`;
    }
  }),
);

results.push(
  run("gref-lost", "Lost gref", () => {
    try {
      queryEnvelopeGeometry(env, { entity: "edge", gref: "gref_edge_999" });
      throw new Error("should have thrown");
    } catch (err) {
      assert(err instanceof CadError, "not CadError");
      assert(err.body.error === "GEOMETRY_REFERENCE_LOST", err.body.error);
      return err.body.error;
    }
  }),
);

results.push(
  run("fillet-sel", "Fillet accepts top_perimeter", () => {
    const { document, results: ops } = applyAll(emptyDocument("t"), [
      { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
      { op: "fillet", body_id: "Body", radius_mm: 3, edges: "top_perimeter", name: "TopRound" },
    ]);
    const failed = ops.find((r) => !r.ok);
    assert(!failed, failed?.error?.message ?? "ops failed");
    const f = document.features.find((x) => x.kind === "fillet");
    assert(f !== undefined && f.kind === "fillet", "fillet missing");
    const ev = evaluateDocument(document);
    assert(ev.ok, ev.issues.map((i) => i.message).join("; "));
    return `fillet ${JSON.stringify(f.edges)}`;
  }),
);

results.push(
  run("tool-lost", "query_geometry lost gref via operation", () => {
    const { document } = applyAll(emptyDocument("t"), [{ op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 }]);
    const { result } = applyOperation(document, {
      op: "query_geometry",
      entity: "edge",
      selector: { gref: "gref_edge_999" },
    });
    assert(!result.ok && result.error?.error === "GEOMETRY_REFERENCE_LOST", JSON.stringify(result.error));
    return result.error!.error;
  }),
);

let failed = 0;
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.name} — ${r.detail}`);
  if (!r.passed) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} selector tests passed`);
if (failed) process.exit(1);
