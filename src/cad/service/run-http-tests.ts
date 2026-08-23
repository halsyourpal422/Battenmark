import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";
import { handleAgentCadHttp } from "./http";
import { getFreeCadWorker } from "../kernel/client.server";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function call(path: string, init: RequestInit = {}) {
  const url = `http://127.0.0.1${path}`;
  const res = await handleAgentCadHttp(new Request(url, init));
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-http-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  process.env.AGENTCAD_API_TOKEN = "secret-token";
  process.env.AGENTCAD_REQUIRE_AUTH = "1";
  resetAgentCadService();

  const health = await call("/api/v1/status");
  assert(health.status === 200, `status ${health.status}`);

  const denied = await call("/api/v1/projects", { method: "POST", body: JSON.stringify({ name: "x" }) });
  assert(denied.status === 401, `expected 401 got ${denied.status}`);

  const bad = await call("/api/v1/projects", {
    method: "POST",
    headers: { authorization: "Bearer wrong" },
    body: JSON.stringify({ name: "x" }),
  });
  assert(bad.status === 403, `expected 403 got ${bad.status}`);

  const auth = { authorization: "Bearer secret-token", "content-type": "application/json" };
  const created = await call("/api/v1/projects", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name: "http-box" }),
  });
  assert(created.status === 200 && created.body.ok, JSON.stringify(created.body));
  const projectId = created.body.project_id as string;

  const op = await call(`/api/v1/projects/${projectId}/operations`, {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": "box-1" },
    body: JSON.stringify({
      operation: "create_box",
      arguments: { length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" },
    }),
  });
  assert(op.status === 200 && op.body.ok, JSON.stringify(op.body));

  const retry = await call(`/api/v1/projects/${projectId}/operations`, {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": "box-1" },
    body: JSON.stringify({
      operation: "create_box",
      arguments: { length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" },
    }),
  });
  assert(retry.body.feature_id === op.body.feature_id, "idempotency failed");

  const missing = await call("/api/v1/projects/no-such/document", { headers: auth });
  assert(missing.status === 404, `missing ${missing.status}`);

  const validated = await call(`/api/v1/projects/${projectId}/validate`, { method: "POST", headers: auth, body: "{}" });
  assert(validated.status === 200 && validated.body.ok, JSON.stringify(validated.body));

  const exported = await call(`/api/v1/projects/${projectId}/exports`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ format: "json" }),
  });
  assert(exported.status === 200 && exported.body.ok, JSON.stringify(exported.body));
  const artifactId = (exported.body.data as { artifact_id: string }).artifact_id;
  const file = await handleAgentCadHttp(
    new Request(`http://127.0.0.1/api/v1/artifacts/${artifactId}`, { headers: auth }),
  );
  assert(file.status === 200, `artifact ${file.status}`);
  assert((await file.arrayBuffer()).byteLength > 0, "empty artifact");

  console.log("PASS  http  health/auth/project/operation/validate/export/artifact");

  // Explicit worker teardown: detached child pipes otherwise hold the event loop.
  const worker = getFreeCadWorker();
  try {
    await worker.request("shutdown", {}, 5_000);
  } catch {
    /* worker never started */
  }
  worker.kill("SIGKILL");

  rmSync(workspace, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
