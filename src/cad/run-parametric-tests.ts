import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import { evaluateDocument } from "./evaluate";
import { evaluateExpression, resolveParameters, resolveVec3 } from "./expressions";
import { inspectDependencies } from "./deps";
import { runExample } from "./examples";
import { paramMap } from "./document";

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function approx(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
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

const results: T[] = [];

results.push(
  run("literal", "Literal number", () => {
    assert(evaluateExpression("12.5", {}) === 12.5, "literal");
    return "12.5";
  }),
);

results.push(
  run("param-ref", "Parameter reference", () => {
    const v = evaluateExpression("wall", { wall: 2.4 });
    assert(approx(v, 2.4), `${v}`);
    return String(v);
  }),
);

results.push(
  run("arith", "Add/sub/mul/div/parens", () => {
    const v = evaluateExpression("inner_length + 2 * wall", { inner_length: 100, wall: 2.4 });
    assert(approx(v, 104.8), `${v}`);
    const v2 = evaluateExpression("(width - 2 * wall) / 2", { width: 80, wall: 3 });
    assert(approx(v2, 37), `${v2}`);
    return `${v} / ${v2}`;
  }),
);

results.push(
  run("nested", "Nested parameter deps", () => {
    const vars = resolveParameters([
      { name: "wall", value: 2.4, unit: "mm" },
      { name: "inner", value: 100, unit: "mm" },
      { name: "outer", value: 0, unit: "mm", expression: "inner + 2 * wall" },
    ]);
    assert(approx(vars.outer, 104.8), JSON.stringify(vars));
    return `outer=${vars.outer}`;
  }),
);

results.push(
  run("unknown", "Unknown parameter", () => {
    try {
      evaluateExpression("nope + 1", { wall: 1 });
      throw new Error("should have thrown");
    } catch (err) {
      const code = (err as { body?: { error?: string } }).body?.error;
      assert(code === "UNKNOWN_PARAMETER", `code ${code}`);
      return code!;
    }
  }),
);

results.push(
  run("cycle", "Parameter cycle", () => {
    try {
      resolveParameters([
        { name: "length", value: 0, unit: "mm", expression: "width" },
        { name: "width", value: 0, unit: "mm", expression: "length" },
      ]);
      throw new Error("should have thrown");
    } catch (err) {
      const body = (err as { body?: { error?: string; parameters?: string[] } }).body;
      assert(body?.error === "PARAMETER_CYCLE", `code ${body?.error}`);
      return (body?.parameters ?? []).join("→");
    }
  }),
);

results.push(
  run("vec3", "Expression-backed origin", () => {
    const origin = resolveVec3({ x: "wall", y: "wall", z: "floor" }, { wall: 3, floor: 2.4 });
    assert(approx(origin.x, 3) && approx(origin.y, 3) && approx(origin.z, 2.4), JSON.stringify(origin));
    return `${origin.x},${origin.y},${origin.z}`;
  }),
);

results.push(
  run("cavity", "Parametric cavity follows wall", () => {
    const { document, results: ops } = applyAll(emptyDocument("cavity"), [
      { op: "define_parameter", name: "wall", value: 2 },
      { op: "create_box", name: "Outer", length_mm: 100, width_mm: 80, height_mm: 20 },
      { op: "create_body", name: "Cavity" },
      {
        op: "create_box",
        body_id: "Cavity",
        name: "InnerCut",
        length_mm: "100 - 2 * wall",
        width_mm: "80 - 2 * wall",
        height_mm: 20,
        origin: { x: "wall", y: "wall", z: "wall" },
      },
      { op: "boolean", target_body_id: "Body", tool_body_id: "Cavity", operation: "subtract" },
    ]);
    const failed = ops.find((r) => !r.ok);
    assert(!failed, failed?.error?.message ?? "ops");
    const inner = document.features.find((f) => f.name === "InnerCut");
    assert(inner !== undefined && inner.kind === "box", "inner box");
    const o1 = resolveVec3(inner.origin, paramMap(document));
    assert(approx(o1.x, 2) && approx(o1.y, 2) && approx(o1.z, 2), `origin ${JSON.stringify(o1)}`);
    const ev1 = evaluateDocument(document);
    assert(ev1.ok, ev1.issues.map((i) => i.message).join("; "));
    const { document: d2, result } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
    assert(result.ok, result.error?.message ?? "set_parameter failed");
    const inner2 = d2.features.find((f) => f.name === "InnerCut")!;
    assert(inner2.kind === "box", "InnerCut still a box");
    const o2 = resolveVec3(inner2.origin, paramMap(d2));
    assert(approx(o2.x, 3) && approx(o2.y, 3) && approx(o2.z, 3), `moved origin ${JSON.stringify(o2)}`);
    const ev2 = evaluateDocument(d2);
    assert(ev2.ok, ev2.issues.map((i) => i.message).join("; "));
    const bb = ev2.bbox!;
    assert(approx(bb.max.x - bb.min.x, 100, 0.2), "outer length");
    return `origin ${o1.x}→${o2.x}; V ${ev1.volumeMm3.toFixed(0)}→${ev2.volumeMm3.toFixed(0)}`;
  }),
);

results.push(
  run("enclosure-wall", "Enclosure cavity uses wall expressions", () => {
    const { document } = runExample("enclosure");
    const inner = document.features.find((f) => f.name === "InnerCut");
    assert(inner !== undefined && inner.kind === "box", "InnerCut");
    assert(inner.origin.x === "wall" && inner.origin.y === "wall", JSON.stringify(inner.origin));
    const o1 = resolveVec3(inner.origin, paramMap(document));
    assert(approx(o1.x, 2.4, 1e-6), `origin ${o1.x}`);
    const { document: d2 } = applyOperation(document, { op: "set_parameter", name: "wall", value: 3 });
    const inner2 = d2.features.find((f) => f.name === "InnerCut")!;
    assert(inner2.kind === "box", "InnerCut still a box");
    const o2 = resolveVec3(inner2.origin, paramMap(d2));
    assert(approx(o2.x, 3) && approx(o2.y, 3), `after wall ${JSON.stringify(o2)}`);
    const deps = inspectDependencies(d2, "wall");
    assert(deps.feature_names.includes("InnerCut"), `deps ${deps.feature_names.join(",")}`);
    assert(deps.feature_names.includes("Outer"), "outer depends on wall");
    const ev = evaluateDocument(d2);
    assert(ev.ok, ev.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
    return `origin ${o1.x}→${o2.x}; dependents ${deps.feature_names.length}`;
  }),
);

let failed = 0;
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.name} — ${r.detail}`);
  if (!r.passed) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} parametric tests passed`);
if (failed) process.exit(1);
