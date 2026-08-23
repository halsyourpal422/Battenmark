import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";
import { isPrivilegedTool } from "../schema";

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-svc-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  const service = resetAgentCadService();
  const out: T[] = [];

  out.push(
    await run("create", "project_create returns handles", () => {
      const r = service.createProject({ name: "motor-bracket" });
      assert(r.ok, JSON.stringify(r.error));
      assert(r.project_id, "missing project_id");
      assert(r.document_id, "missing document_id");
      return `${r.project_id} ${r.document_id}`;
    }),
  );

  out.push(
    await run("box", "create_box 80×50×12", async () => {
      const created = service.createProject({ name: "box-a" });
      const r = await service.executeTool("create_box", {
        project_id: created.project_id,
        length_mm: 80,
        width_mm: 50,
        height_mm: 12,
        name: "Base",
      });
      assert(r.ok, JSON.stringify(r.error));
      assert(r.feature_id, "no feature_id");
      const v = await service.validateDocument(created.project_id!);
      const data = v.data as { volume_mm3: number };
      assert(Math.abs(data.volume_mm3 - 48000) < 2, `volume ${data.volume_mm3}`);
      return `V=${data.volume_mm3}`;
    }),
  );

  out.push(
    await run("isolation", "two projects do not mutate each other", async () => {
      const a = service.createProject({ name: "iso-a" });
      const b = service.createProject({ name: "iso-b" });
      await service.executeTool("create_box", { project_id: a.project_id, length_mm: 10, width_mm: 10, height_mm: 10 });
      await service.executeTool("create_box", { project_id: b.project_id, length_mm: 20, width_mm: 20, height_mm: 20 });
      const ia = service.inspectDocument(a.project_id!);
      const ib = service.inspectDocument(b.project_id!);
      const va = (ia.validation as { valid: boolean }).valid;
      const da = ia.data as { feature_count: number; bodies: { name: string }[] };
      const db = ib.data as { feature_count: number };
      assert(va, "a invalid");
      assert(da.feature_count === 1 && db.feature_count === 1, "feature counts");
      const volA = (ia.data as { validation: { volume_mm3: number } }).validation.volume_mm3;
      const volB = (ib.data as { validation: { volume_mm3: number } }).validation.volume_mm3;
      assert(Math.abs(volA - 1000) < 2, `a vol ${volA}`);
      assert(Math.abs(volB - 8000) < 2, `b vol ${volB}`);
      return `A=${volA} B=${volB}`;
    }),
  );

  out.push(
    await run("idempotent", "duplicate Idempotency-Key does not double-create", async () => {
      const p = service.createProject({ name: "idem" });
      const args = { project_id: p.project_id, length_mm: 8, width_mm: 4, height_mm: 2, name: "Pad" };
      const a = await service.executeTool("create_box", args, { idempotencyKey: "k1" });
      const b = await service.executeTool("create_box", args, { idempotencyKey: "k1" });
      assert(a.ok && b.ok, JSON.stringify(a.error || b.error));
      assert(a.feature_id === b.feature_id, "feature ids differ");
      const ins = service.inspectDocument(p.project_id!);
      assert((ins.data as { feature_count: number }).feature_count === 1, "duplicated feature");
      const clash = await service.executeTool(
        "create_box",
        { ...args, length_mm: 9 },
        { idempotencyKey: "k1" },
      );
      assert(!clash.ok && clash.error?.error === "IDEMPOTENCY_CONFLICT", JSON.stringify(clash.error));
      return a.feature_id!;
    }),
  );

  out.push(
    await run("dry-run", "dry_run does not persist", async () => {
      const p = service.createProject({ name: "dry" });
      const r = await service.executeTool(
        "create_box",
        { project_id: p.project_id, length_mm: 5, width_mm: 5, height_mm: 5, dry_run: true },
        { dryRun: true },
      );
      assert(r.ok && r.dry_run, JSON.stringify(r));
      const ins = service.inspectDocument(p.project_id!);
      assert((ins.data as { feature_count: number }).feature_count === 0, "dry run leaked");
      return "clean";
    }),
  );

  out.push(
    await run("privileged", "eval_python is denied", async () => {
      assert(isPrivilegedTool("eval_python"), "catalog");
      const r = await service.executeTool("eval_python", { code: "print(1)" });
      assert(!r.ok && r.error?.error === "PRIVILEGED_DENIED", JSON.stringify(r.error));
      return r.error!.error;
    }),
  );

  out.push(
    await run("batch-rollback", "failed batch rolls back", async () => {
      const p = service.createProject({ name: "batch" });
      const r = await service.executeOperations(p.project_id!, [
        { op: "create_box", length_mm: 10, width_mm: 10, height_mm: 10, name: "Ok" },
        { op: "create_hole", body_id: "missing", face: "top_face", x_mm: 1, y_mm: 1, diameter_mm: 2 },
      ]);
      assert(!r.ok, "batch should fail");
      const ins = service.inspectDocument(p.project_id!);
      assert((ins.data as { feature_count: number }).feature_count === 0, "rollback failed");
      return "rolled back";
    }),
  );

  out.push(
    await run("lock", "concurrent mutations serialize", async () => {
      const p = service.createProject({ name: "lock" });
      await service.executeTool("create_body", { project_id: p.project_id, name: "Base" });
      const [a, b] = await Promise.all([
        service.executeTool("create_box", { project_id: p.project_id, body_id: "Base", length_mm: 10, width_mm: 10, height_mm: 4, name: "A" }),
        service.executeTool("create_box", { project_id: p.project_id, body_id: "Base", length_mm: 6, width_mm: 6, height_mm: 4, name: "B" }),
      ]);
      assert(a.ok && b.ok, JSON.stringify(a.error || b.error));
      const ins = service.inspectDocument(p.project_id!);
      assert((ins.data as { feature_count: number }).feature_count === 2, "lost a write");
      return "serialized";
    }),
  );

  out.push(
    await run("artifact-json", "export_json returns artifact_id not bytes", async () => {
      const p = service.createProject({ name: "art" });
      await service.executeTool("create_box", { project_id: p.project_id, length_mm: 3, width_mm: 3, height_mm: 3 });
      const r = await service.exportArtifact(p.project_id!, "json");
      assert(r.ok, JSON.stringify(r.error));
      const data = r.data as { artifact_id: string; bytes: number; ascii?: string };
      assert(data.artifact_id && !data.ascii, "leaked ascii");
      const file = service.getArtifactFile(data.artifact_id);
      assert(file.bytes.length === data.bytes, "size mismatch");
      return data.artifact_id;
    }),
  );

  let failed = 0;
  for (const r of out) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.name} — ${r.detail}`);
    if (!r.passed) failed += 1;
  }
  console.log(`\n${out.length - failed}/${out.length} service tests passed`);
  rmSync(workspace, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
