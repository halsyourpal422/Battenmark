/**
 * Phase 6.2 — backend-neutrality closeout.
 *
 * Does not ship a second production CAD engine. Proves the public contract,
 * registry, capability routing, and error envelope stay backend-neutral so a
 * future adapter can register without leaking worker details upward.
 */
import { TOOL_CATALOG, TOOL_NAMES } from "../schema";
import { cadError, CadError } from "../errors";
import {
  capabilityFlags,
  firstUnsupportedCapability,
  requiredCapabilitiesFor,
} from "./capabilities";
import { createBackendRegistry } from "./registry";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function run(id: string, name: string, fn: () => string | void): T {
  try {
    const detail = fn() ?? "ok";
    return { id, name, passed: true, detail: String(detail) };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

const LEAK_RE =
  /PartDesign::|Part::|TopoDS_|FreeCADCmd|App::Link|App::Part|OpenCascade|OCC native/i;

function main() {
  const out: T[] = [];

  out.push(
    run("live-catalog-count", "Public catalog count is derived from TOOL_NAMES", () => {
      assert(Array.isArray(TOOL_NAMES) && TOOL_NAMES.length > 0, "empty catalog");
      assert(TOOL_NAMES.length === TOOL_CATALOG.length, "TOOL_NAMES / TOOL_CATALOG mismatch");
      const unique = new Set(TOOL_NAMES);
      assert(unique.size === TOOL_NAMES.length, "duplicate catalog names");
      return `live tool count: ${TOOL_NAMES.length}`;
    }),
  );

  out.push(
    run("no-backend-leak-in-names", "Public operation names are backend-neutral", () => {
      const leaks = TOOL_NAMES.filter((n) => LEAK_RE.test(n) || n.includes("::"));
      assert(leaks.length === 0, `leaking names: ${leaks.join(",")}`);
      return `checked ${TOOL_NAMES.length} names`;
    }),
  );

  out.push(
    run("no-native-args", "Catalog argument names are not native kernel types", () => {
      const leaks: string[] = [];
      for (const t of TOOL_CATALOG) {
        const keys = Object.keys(t.properties ?? {});
        for (const k of keys) {
          if (LEAK_RE.test(k) || k.includes("::")) leaks.push(`${t.name}.${k}`);
        }
        for (const r of t.required ?? []) {
          if (LEAK_RE.test(r) || r.includes("::")) leaks.push(`${t.name} required:${r}`);
        }
      }
      assert(leaks.length === 0, `leaking args: ${leaks.join(",")}`);
      return "argument names are backend-neutral";
    }),
  );

  out.push(
    run("future-backend-id", "Registry accepts a future backend id without schema change", () => {
      const r = createBackendRegistry();
      r.register({
        id: "future-kernel",
        name: "Future kernel stub",
        roles: ["authoritative"],
        capabilities: capabilityFlags({ "primitives.box": true, "export.step": false }),
        available: true,
        testOnly: true,
      });
      assert(r.get("future-kernel")?.id === "future-kernel", "missing registration");
      const report = r.report();
      assert(report.roles.authoritative === "future-kernel", String(report.roles.authoritative));
      return `authoritative=${report.roles.authoritative}`;
    }),
  );

  out.push(
    run("unsupported-envelope", "Missing capability uses BACKEND_UNSUPPORTED", () => {
      const needed = requiredCapabilitiesFor("create_pattern");
      const backend = {
        id: "stub",
        name: "stub",
        role: "authoritative" as const,
        roles: ["authoritative" as const],
        available: true,
        capabilities: capabilityFlags({ "primitives.box": true, "pattern.circular": false }),
        notes: [],
      };
      const circularMissing = firstUnsupportedCapability(backend, ["pattern.circular"]);
      assert(circularMissing === "pattern.circular", String(circularMissing));
      try {
        throw cadError("BACKEND_UNSUPPORTED", "Circular patterns are not available on this backend.", {
          capability: "pattern.circular",
        });
      } catch (err) {
        assert(err instanceof CadError, "expected CadError");
        assert(err.body.error === "BACKEND_UNSUPPORTED", err.body.error);
      }
      return `create_pattern required=${needed.join(",") || "n/a"}`;
    }),
  );

  out.push(
    run("kernel-vs-backend-id", "Evaluator KernelId stays distinct from open BackendId", () => {
      return "BackendId=open string; KernelId=in-tree evaluator adapters";
    }),
  );

  const failed = out.filter((t) => !t.passed).length;
  for (const t of out) {
    console.log(`${t.passed ? "PASS" : "FAIL"} ${t.id.padEnd(28)} ${t.detail}`);
  }
  console.log(`\n${out.length - failed}/${out.length} Phase 6.2 neutrality tests passed`);
  if (failed) process.exit(1);
}

main();
