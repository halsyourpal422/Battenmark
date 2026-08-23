/**
 * Phase 5.5.1 — registry, roles, pluggability. No FreeCAD required.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CadError } from "../errors";
import { emptyDocument } from "../document";
import { applyAll } from "../operations";
import { TOOL_CATALOG, getCatalogEntry } from "../schema";
import { resetAgentCadService } from "../service/agentcad";
import { handleAgentCadHttp } from "../service/http";
import {
  FREECAD_BACKEND_ID,
  JSCAD_BACKEND_ID,
  MOCKCAD_BACKEND_ID,
  capabilityFlags,
  capabilityReport,
  type BackendId,
} from "./capabilities";
import {
  createBackendRegistry,
  createProductionRegistry,
  getBackendRegistry,
  resetBackendRegistry,
} from "./registry";
import { mockcadInspect, mockcadRegistration } from "./mockcad";

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

function codeOf(err: unknown): string {
  if (err instanceof CadError) return err.body.error;
  if (err && typeof err === "object" && "body" in err) {
    return String((err as { body: { error?: string } }).body.error);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

async function main() {
  const out: T[] = [];

  out.push(
    await run("open-id", "BackendId is an open string, not a two-member union", () => {
      const extra: BackendId = "build123d";
      const extra2: BackendId = "cadquery";
      const extra3: BackendId = "experimental-backend";
      const r = createBackendRegistry();
      r.register({
        id: extra,
        name: "build123d stub",
        roles: ["authoritative"],
        capabilities: capabilityFlags({ "primitives.box": true }),
        available: true,
      });
      r.register({
        id: extra2,
        name: "cadquery stub",
        roles: ["authoritative"],
        capabilities: capabilityFlags(),
        available: false,
      });
      r.register({
        id: extra3,
        name: "experimental",
        roles: ["preview"],
        capabilities: capabilityFlags({ "render.preview": true }),
        available: true,
      });
      const report = r.report();
      assert(report.roles.authoritative === "build123d", `authoritative ${report.roles.authoritative}`);
      assert(report.roles.preview === "experimental-backend", `preview ${report.roles.preview}`);
      assert(report.default_backend === "build123d", report.default_backend);
      assert(report.authoritative_geometry === report.roles.authoritative, "alias mismatch");
      assert(report.preview === report.roles.preview, "preview alias mismatch");
      return `ids=${r.ids().join(",")}`;
    }),
  );

  out.push(
    await run("production-roles", "production registry derives freecad/jscad from registration", () => {
      const r = createProductionRegistry();
      r.update("freecad", { available: true, version: "1.0.2" });
      const report = r.report();
      assert(report.roles.authoritative === FREECAD_BACKEND_ID, String(report.roles.authoritative));
      assert(report.roles.preview === JSCAD_BACKEND_ID, String(report.roles.preview));
      assert(report.default_backend === FREECAD_BACKEND_ID, report.default_backend);
      assert(!Object.values(report.roles).every((id) => id === "freecad"), "not all roles hardcoded freecad");
      return `authoritative=${report.roles.authoritative} preview=${report.roles.preview}`;
    }),
  );

  out.push(
    await run("derived-not-hardcoded", "capabilityReport with swapped roles does not force freecad", () => {
      const report = capabilityReport([
        {
          id: "other-occ",
          name: "Other OCC",
          role: "authoritative",
          roles: ["authoritative"],
          available: true,
          capabilities: capabilityFlags({ "primitives.box": true }),
          notes: [],
        },
        {
          id: "fast-mesh",
          name: "Fast mesh",
          role: "preview",
          roles: ["preview"],
          available: true,
          capabilities: capabilityFlags({ "render.preview": true }),
          notes: [],
        },
      ]);
      assert(report.authoritative_geometry === "other-occ", report.authoritative_geometry);
      assert(report.preview === "fast-mesh", report.preview);
      assert(report.roles.authoritative === "other-occ", "roles.authoritative");
      return "other-occ / fast-mesh";
    }),
  );

  out.push(
    await run("duplicate", "duplicate ID is BACKEND_REGISTRATION_CONFLICT", () => {
      const r = createProductionRegistry();
      try {
        r.register({
          id: "freecad",
          name: "dup",
          roles: ["authoritative"],
          capabilities: capabilityFlags(),
        });
        throw new Error("should have thrown");
      } catch (err) {
        assert(codeOf(err) === "BACKEND_REGISTRATION_CONFLICT", codeOf(err));
        return "BACKEND_REGISTRATION_CONFLICT";
      }
    }),
  );

  out.push(
    await run("role-conflict", "exclusive role conflict is BACKEND_ROLE_CONFLICT", () => {
      const r = createBackendRegistry();
      r.register({
        id: "alpha",
        name: "alpha",
        roles: ["authoritative"],
        exclusiveRoles: ["authoritative"],
        capabilities: capabilityFlags(),
        available: true,
      });
      try {
        r.register({
          id: "beta",
          name: "beta",
          roles: ["authoritative"],
          exclusiveRoles: ["authoritative"],
          capabilities: capabilityFlags(),
          available: true,
        });
        throw new Error("should have thrown");
      } catch (err) {
        assert(codeOf(err) === "BACKEND_ROLE_CONFLICT", codeOf(err));
        return "BACKEND_ROLE_CONFLICT";
      }
    }),
  );

  out.push(
    await run("not-found", "unknown backend is BACKEND_NOT_FOUND", () => {
      const r = createProductionRegistry();
      try {
        r.select("no-such-engine");
        throw new Error("should have thrown");
      } catch (err) {
        assert(codeOf(err) === "BACKEND_NOT_FOUND", codeOf(err));
        return "BACKEND_NOT_FOUND";
      }
    }),
  );

  out.push(
    await run("unavailable", "registered-but-down is BACKEND_UNAVAILABLE", () => {
      const r = createProductionRegistry();
      r.update("freecad", { available: false, detail: "missing" });
      try {
        r.select("freecad", ["primitives.box"]);
        throw new Error("should have thrown");
      } catch (err) {
        assert(codeOf(err) === "BACKEND_UNAVAILABLE", codeOf(err));
        return "BACKEND_UNAVAILABLE";
      }
    }),
  );

  out.push(
    await run("mockcad-register", "mockcad registers without touching TOOL_CATALOG", () => {
      const before = TOOL_CATALOG.map((t) => t.name).join(",");
      const r = createProductionRegistry();
      r.register(mockcadRegistration({ available: true }));
      const after = TOOL_CATALOG.map((t) => t.name).join(",");
      assert(before === after, "catalog mutated");
      assert(getCatalogEntry("create_box")?.mapsTo === "create_box", "create_box");
      assert(getCatalogEntry("create_hole")?.mapsTo === "create_hole", "create_hole");
      assert(r.get(MOCKCAD_BACKEND_ID)?.test_only === true, "test_only");
      const report = r.report();
      assert(report.backends.some((b) => b.id === MOCKCAD_BACKEND_ID), "mockcad missing from report");
      assert(report.roles.authoritative === FREECAD_BACKEND_ID, "mockcad must not steal authoritative");
      return `backends=${r.ids().join(",")}`;
    }),
  );

  out.push(
    await run("mockcad-box", "mockcad inspects an IR box at 48000 mm³", () => {
      const { document } = applyAll(emptyDocument("mock-box"), [
        { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
      ]);
      const ins = mockcadInspect(document);
      assert(ins.valid && ins.volume_mm3 === 48000, `V=${ins.volume_mm3}`);
      assert(ins.kernel === MOCKCAD_BACKEND_ID, ins.kernel);
      return `V=${ins.volume_mm3}`;
    }),
  );

  out.push(
    await run("mockcad-hole-unsupported", "mockcad rejects create_hole", () => {
      const r = createProductionRegistry();
      r.register(mockcadRegistration({ available: true }));
      try {
        r.select(MOCKCAD_BACKEND_ID, ["feature.hole.through"]);
        throw new Error("should have thrown");
      } catch (err) {
        assert(codeOf(err) === "BACKEND_UNSUPPORTED", codeOf(err));
        return "BACKEND_UNSUPPORTED";
      }
    }),
  );

  out.push(
    await run("schema-untouched", "create_hole / fillet / create_pattern catalog is unchanged", () => {
      for (const name of ["create_box", "create_hole", "fillet", "create_pattern", "inspect_backend_capabilities"]) {
        assert(getCatalogEntry(name), `missing ${name}`);
      }
      const hole = getCatalogEntry("create_hole")!;
      assert(!JSON.stringify(hole).includes("PartDesign"), "PartDesign leaked into catalog");
      return `tools=${TOOL_CATALOG.length}`;
    }),
  );

  const workspace = mkdtempSync(join(tmpdir(), "cad-reg-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  delete process.env.AGENTCAD_REQUIRE_AUTH;
  const service = resetAgentCadService();

  out.push(
    await run("service-default", "service capability report still names freecad/jscad via roles", async () => {
      const r = await service.executeTool("inspect_backend_capabilities", {});
      assert(r.ok, JSON.stringify(r.error));
      const data = r.data as {
        default_backend: string;
        authoritative_geometry: string;
        preview: string;
        roles: { authoritative: string; preview: string };
        backends: Array<{ id: string }>;
      };
      assert(data.roles.authoritative === "freecad", JSON.stringify(data.roles));
      assert(data.roles.preview === "jscad", JSON.stringify(data.roles));
      assert(data.authoritative_geometry === data.roles.authoritative, "alias");
      assert(data.backends.every((b) => b.id !== MOCKCAD_BACKEND_ID), "mockcad leaked into production report");
      return `default=${data.default_backend}`;
    }),
  );

  out.push(
    await run("service-mockcad", "explicit backend=mockcad is selectable on a test registry", async () => {
      const testReg = createProductionRegistry();
      testReg.update("freecad", { available: true, discovery_mode: "test" });
      testReg.register(mockcadRegistration({ available: true }));
      resetBackendRegistry(testReg);
      const svc = resetAgentCadService();
      // resetAgentCadService resets registry to production — re-apply test registry
      resetBackendRegistry(testReg);
      void svc;
      const box = await getBackendRegistry().select("mockcad", ["primitives.box"]);
      assert(box.id === "mockcad", box.id);
      const caps = await handleAgentCadHttp(new Request("http://127.0.0.1/api/v1/capabilities"));
      const body = (await caps.json()) as { ok: boolean; data: { backends: Array<{ id: string }> } };
      assert(body.ok && body.data.backends.some((b) => b.id === "mockcad"), JSON.stringify(body.data));
      const denied = await handleAgentCadHttp(
        new Request("http://127.0.0.1/api/v1/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "mock-proj" }),
        }),
      );
      const created = (await denied.json()) as { ok: boolean; project_id: string };
      assert(created.ok, JSON.stringify(created));
      const hole = await handleAgentCadHttp(
        new Request(`http://127.0.0.1/api/v1/projects/${created.project_id}/operations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "create_hole",
            backend: "mockcad",
            arguments: { body_id: "Body", diameter_mm: 5, face: "top_face" },
          }),
        }),
      );
      const holeBody = (await hole.json()) as { ok: boolean; error?: { error: string } };
      assert(!holeBody.ok && holeBody.error?.error === "BACKEND_UNSUPPORTED", JSON.stringify(holeBody));
      return "mockcad visible + hole unsupported";
    }),
  );

  out.push(
    await run("http-not-found", "HTTP unknown backend → BACKEND_NOT_FOUND", async () => {
      resetBackendRegistry();
      resetAgentCadService();
      const created = await handleAgentCadHttp(
        new Request("http://127.0.0.1/api/v1/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "nf" }),
        }),
      );
      const proj = (await created.json()) as { project_id: string };
      const res = await handleAgentCadHttp(
        new Request(`http://127.0.0.1/api/v1/projects/${proj.project_id}/operations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "create_box",
            backend: "nope",
            arguments: { length_mm: 80, width_mm: 50, height_mm: 12 },
          }),
        }),
      );
      const body = (await res.json()) as { ok: boolean; error?: { error: string } };
      assert(res.status === 404, `status ${res.status}`);
      assert(body.error?.error === "BACKEND_NOT_FOUND", JSON.stringify(body));
      return "404 BACKEND_NOT_FOUND";
    }),
  );

  resetBackendRegistry();
  rmSync(workspace, { recursive: true, force: true });

  let failed = 0;
  for (const r of out) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(22)} ${r.name} — ${r.detail}`);
    if (!r.passed) failed += 1;
  }
  console.log(`\n${out.length - failed}/${out.length} registry tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
