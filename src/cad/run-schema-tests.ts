import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENTCAD_MCP_VERSION,
  AGENTCAD_SCHEMA_MIN_READABLE,
  AGENTCAD_SCHEMA_VERSION,
  CAD_SERVICE_VERSION,
  WORKING_PACKAGE_NAME,
  assertCompatibleSchema,
  getCatalogEntry,
  TOOL_CATALOG,
} from "./schema";
import { emptyDocument } from "./document";
import { applyAll, applyOperation } from "./operations";
import { resetAgentCadService } from "./service/agentcad";
import { handleAgentCadHttp } from "./service/http";
import { readProject } from "./service/store";
import { requiredCapabilitiesFor, freecadCapabilities } from "./backend/capabilities";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

async function run(id: string, name: string, fn: () => Promise<string | void> | string | void): Promise<T> {
  try {
    const detail = (await fn()) ?? "ok";
    return { id, name, passed: true, detail: String(detail) };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "cad-schema-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  delete process.env.AGENTCAD_REQUIRE_AUTH;
  const service = resetAgentCadService();
  const out: T[] = [];

  out.push(
    await run("const", "single source of truth", () => {
      assert(AGENTCAD_SCHEMA_VERSION === 2, `schema ${AGENTCAD_SCHEMA_VERSION}`);
      assert(AGENTCAD_SCHEMA_MIN_READABLE === 1, "minReadable");
      assert(AGENTCAD_MCP_VERSION === "5.0.0", AGENTCAD_MCP_VERSION);
      assert(CAD_SERVICE_VERSION === "0.5.6", CAD_SERVICE_VERSION);
      assert(WORKING_PACKAGE_NAME === "cad-service", WORKING_PACKAGE_NAME);
      const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string };
      assert(pkg.name === WORKING_PACKAGE_NAME, `package name ${pkg.name}`);
      assert(pkg.version === CAD_SERVICE_VERSION, `package version ${pkg.version}`);
      return `${pkg.name}@${pkg.version} schema=${AGENTCAD_SCHEMA_VERSION} mcp=${AGENTCAD_MCP_VERSION}`;
    }),
  );

  out.push(
    await run("mismatch", "unknown schema throws SCHEMA_MISMATCH", () => {
      try {
        assertCompatibleSchema(99);
        throw new Error("should have thrown");
      } catch (err) {
        assert(err && typeof err === "object" && (err as { code?: string }).code === "SCHEMA_MISMATCH", String(err));
        return "SCHEMA_MISMATCH";
      }
    }),
  );

  out.push(
    await run("readable-v1", "schema 1 remains readable", () => {
      assertCompatibleSchema(1);
      assertCompatibleSchema(2);
      assertCompatibleSchema(undefined);
      return "1 and 2 ok";
    }),
  );

  out.push(
    await run("catalog", "inspect_backend_capabilities + create_hole are backend-neutral", () => {
      const cap = getCatalogEntry("inspect_backend_capabilities");
      assert(cap && !cap.needsProject && cap.mapsTo === "inspect_backend_capabilities", "capabilities tool");
      const hole = getCatalogEntry("create_hole");
      assert(hole?.mapsTo === "create_hole", `mapsTo ${hole?.mapsTo}`);
      assert(!TOOL_CATALOG.some((t) => t.name.includes("partdesign") || t.mapsTo.includes("partdesign")), "PartDesign leaked");
      assert(requiredCapabilitiesFor("create_hole", { through: true })[0] === "feature.hole.through", "through cap");
      const fc = freecadCapabilities({ available: true });
      assert(fc.capabilities["pattern.circular"] === false, "circular claimed");
      assert(fc.capabilities.assembly === true && fc.capabilities["assembly.face_mate"] === true && fc.capabilities["assembly.interference"] === false, "assembly capability flags");
      assert(fc.capabilities["feature.hole.helical_thread"] === false, "helical claimed");
      return `tools=${TOOL_CATALOG.length}`;
    }),
  );

  out.push(
    await run("circular", "circular pattern is BACKEND_UNSUPPORTED", () => {
      const { document } = applyAll(emptyDocument("circ"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
        { op: "create_hole", body_id: "Body", diameter_mm: 4, x_mm: 10, y_mm: 10, through: true, name: "H" },
      ]);
      const { result } = applyOperation(document, { op: "create_pattern", feature_id: "H", count: 4, kind: "circular" });
      assert(!result.ok, "circular should fail");
      assert(result.error?.error === "BACKEND_UNSUPPORTED", JSON.stringify(result.error));
      assert(result.error?.capability === "pattern.circular", String(result.error?.capability));
      return result.error!.error;
    }),
  );

  out.push(
    await run("http-schema", "HTTP never claims schema 1", async () => {
      const status = await handleAgentCadHttp(new Request("http://127.0.0.1/api/v1/status"));
      const body = (await status.json()) as { agentcad_schema_version: number; ok: boolean };
      assert(body.agentcad_schema_version === 2, `status schema ${body.agentcad_schema_version}`);
      const src = readFileSync("src/cad/service/http.ts", "utf8");
      assert(!src.includes("agentcad_schema_version: 1"), "http.ts still hardcodes 1");
      process.env.AGENTCAD_API_TOKEN = "secret-token";
      process.env.AGENTCAD_REQUIRE_AUTH = "1";
      const denied = await handleAgentCadHttp(
        new Request("http://127.0.0.1/api/v1/projects", { method: "POST", body: JSON.stringify({ name: "x" }) }),
      );
      const deniedBody = (await denied.json()) as { agentcad_schema_version: number };
      assert(deniedBody.agentcad_schema_version === 2, `auth schema ${deniedBody.agentcad_schema_version}`);
      delete process.env.AGENTCAD_REQUIRE_AUTH;
      delete process.env.AGENTCAD_API_TOKEN;
      return "status+auth=2";
    }),
  );

  out.push(
    await run("http-mismatch", "HTTP SCHEMA_MISMATCH on unknown version", async () => {
      const res = await handleAgentCadHttp(
        new Request("http://127.0.0.1/api/v1/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "x", agentcad_schema_version: 99 }),
        }),
      );
      const body = (await res.json()) as { error?: { error: string }; agentcad_schema_version: number };
      assert(res.status === 409, `status ${res.status}`);
      assert(body.error?.error === "SCHEMA_MISMATCH", JSON.stringify(body));
      assert(body.agentcad_schema_version === 2, "response still claims 2");
      return "409 SCHEMA_MISMATCH";
    }),
  );

  out.push(
    await run("load-v1", "schema 1 project.json remains readable", () => {
      const slug = "legacy-v1";
      const root = join(workspace, slug);
      mkdirSync(join(root, "logs"), { recursive: true });
      writeFileSync(
        join(root, "project.json"),
        JSON.stringify({
          agentcad_schema_version: 1,
          project_id: slug,
          document_id: "doc_legacy",
          name: "legacy",
          slug,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      const doc = emptyDocument("legacy");
      doc.schemaVersion = 1;
      doc.id = "doc_legacy";
      writeFileSync(join(root, "document.json"), JSON.stringify(doc));
      const loaded = readProject(slug);
      assert(loaded, "not loaded");
      assert(loaded!.meta.agentcad_schema_version === 2, "responses/meta upgrade to 2");
      assert(loaded!.document.schemaVersion === 1, "document stays 1 until rewritten");
      return "loaded";
    }),
  );

  out.push(
    await run("service-caps", "inspect_backend_capabilities via service", async () => {
      const r = await service.executeTool("inspect_backend_capabilities", {});
      assert(r.ok, JSON.stringify(r.error));
      assert(r.agentcad_schema_version === 2, "schema");
      const data = r.data as {
        default_backend: string;
        authoritative_geometry: string;
        backends: Array<{ id: string; capabilities: Record<string, boolean> }>;
      };
      assert(data.authoritative_geometry === "freecad", data.authoritative_geometry);
      const fc = data.backends.find((b) => b.id === "freecad");
      assert(fc, "no freecad backend");
      assert(fc!.capabilities["feature.hole.through"] === true, "hole.through");
      assert(fc!.capabilities["pattern.circular"] === false, "circular");
      assert(fc!.capabilities.assembly === true && fc!.capabilities["assembly.authoritative"] === true, "assembly authoritative via service");
      return data.default_backend;
    }),
  );

  let failed = 0;
  for (const r of out) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(14)} ${r.name} — ${r.detail}`);
    if (!r.passed) failed += 1;
  }
  console.log(`\n${out.length - failed}/${out.length} schema tests passed`);
  rmSync(workspace, { recursive: true, force: true });
  try {
    const { getFreeCadWorker } = await import("./kernel/client.server");
    getFreeCadWorker().kill("SIGKILL");
  } catch {
    /* worker may not have started */
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
