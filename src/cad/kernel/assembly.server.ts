/**
 * Authoritative FreeCAD path for assemblies.
 *
 * Battenmark owns canonical assembly state; this adapter ships
 * {assembly, definitions, solved placements} to the worker, which builds an
 * App::Part hierarchy and returns per-instance inspection plus world bounds.
 */
import type { Assembly, CadDocument } from "../types";
import { cadError } from "../errors";
import { solveAssembly } from "../assembly/solver";
import { getFreeCadWorker, withDocumentLock } from "./client.server";
import { workspacePath } from "./workspace.server";

function stripDefinition(def: Assembly["definitions"][number]) {
  return {
    id: def.id,
    name: def.name,
    source: def.source,
    parameters: def.parameters,
    bodies: def.bodies,
    features: def.features,
  };
}

export async function buildAssemblyAuthoritative(doc: CadDocument, assemblyId: string) {
  const asm = doc.assemblies?.find((a) => a.id === assemblyId || a.name === assemblyId);
  if (!asm) throw cadError("ASSEMBLY_NOT_FOUND", `Assembly '${assemblyId}' was not found.`);
  const solved = solveAssembly(doc, asm.id);
  if (!solved.solved) {
    throw cadError("ASSEMBLY_UNSOLVED", "Assembly has constraints that could not be applied.", {
      deferred: solved.constraints.filter((c) => c.status === "deferred").map((c) => c.id),
    });
  }
  const definitions: Record<string, unknown> = {};
  for (const d of asm.definitions) definitions[d.id] = stripDefinition(d);
  const payload = {
    assembly: { id: asm.id, name: asm.name, instances: asm.instances },
    definitions,
    placements: solved.placements,
  };
  return withDocumentLock(`${doc.id}:${asm.id}`, async () => {
    const worker = getFreeCadWorker();
    const res = await worker.request("assembly", { arguments: { mode: "inspect", ...payload } }, 180_000);
    if (!res.ok || !res.result) {
      throw new (await import("./client.server")).CadWorkerError(
        res.error?.code ?? "RECOMPUTE_FAILED",
        res.error?.message ?? "assembly rebuild failed",
      );
    }
    return res.result;
  });
}

export async function exportAssemblyAuthoritative(
  doc: CadDocument,
  assemblyId: string,
  format: "fcstd" | "step",
) {
  const asm = doc.assemblies?.find((a) => a.id === assemblyId || a.name === assemblyId);
  if (!asm) throw cadError("ASSEMBLY_NOT_FOUND", `Assembly '${assemblyId}' was not found.`);
  const slug = `${doc.name || "model"}-${asm.id}`.replace(/[^\w-]+/g, "-").toLowerCase();
  const solved = solveAssembly(doc, asm.id);
  if (!solved.solved) {
    throw cadError("ASSEMBLY_UNSOLVED", "Assembly has constraints that could not be applied.");
  }
  const definitions: Record<string, unknown> = {};
  for (const d of asm.definitions) definitions[d.id] = stripDefinition(d);
  const payload = {
    assembly: { id: asm.id, name: asm.name, instances: asm.instances },
    definitions,
    placements: solved.placements,
  };
  const path = workspacePath(slug, "exports", `${asm.id}.${format}`);
  return withDocumentLock(`${doc.id}:${asm.id}:export`, async () => {
    const worker = getFreeCadWorker();
    const res = await worker.request(
      "assembly",
      { arguments: { mode: "export", format, path, ...payload } },
      180_000,
    );
    if (!res.ok || !res.result) {
      throw new (await import("./client.server")).CadWorkerError(
        res.error?.code ?? "EXPORT_FAILED",
        res.error?.message ?? "assembly export failed",
      );
    }
    return res.result;
  });
}
