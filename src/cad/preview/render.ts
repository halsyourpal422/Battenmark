import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Assembly, CadDocument, Evaluation, MeshData } from "../types";
import { evaluateDocument } from "../evaluate";
import { rasterizeMeshes, type PreviewView } from "./raster";
import { applyTransform, type RigidTransform } from "../assembly/transforms";
import { solveAssembly } from "../assembly/solver";

function transformMesh(m: MeshData, t: RigidTransform): MeshData {
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const p = applyTransform(t, { x: m.positions[i]!, y: m.positions[i + 1]!, z: m.positions[i + 2]! });
    positions[i] = p.x;
    positions[i + 1] = p.y;
    positions[i + 2] = p.z;
  }
  return { ...m, positions };
}

function defDocumentOf(def: Assembly["definitions"][number]): CadDocument {
  return {
    schemaVersion: 2,
    id: `def_${def.id}`,
    name: def.name,
    units: "mm",
    createdAt: 0,
    updatedAt: 0,
    parameters: def.parameters,
    bodies: def.bodies,
    features: def.features,
    log: [],
    revisions: [],
    currentRevisionId: null,
  };
}

/** Assembly preview: every instance's definition mesh at its solved world transform. */
export function meshesFromAssembly(doc: CadDocument, assemblyId: string): MeshData[] {
  const asm = doc.assemblies?.find((a) => a.id === assemblyId || a.name === assemblyId);
  if (!asm) {
    throw Object.assign(new Error(`Assembly '${assemblyId}' was not found.`), { code: "ASSEMBLY_NOT_FOUND" });
  }
  const solved = solveAssembly(doc, asm.id);
  const out: MeshData[] = [];
  asm.instances.forEach((inst, idx) => {
    const def = asm.definitions.find((d) => d.id === inst.componentId);
    if (!def) return;
    const T = solved.placements[inst.id] as unknown as RigidTransform;
    for (const mesh of meshesFromEvaluation(evaluateDocument(defDocumentOf(def)))) {
      out.push({ ...transformMesh(mesh, T), bodyName: inst.id, color: idx % 2 ? "#8a8f98" : undefined });
    }
  });
  return out;
}

export const PREVIEW_VIEWS: PreviewView[] = ["isometric", "front", "top", "right", "thumbnail"];

export interface RenderedView {
  view: PreviewView;
  png: Buffer;
  width: number;
  height: number;
  triangleCount: number;
  bytes: number;
}

export function resolvePreviewViews(view?: string | string[]): PreviewView[] {
  if (!view || view === "all") return ["isometric", "front", "top", "right"];
  const list = Array.isArray(view) ? view : [view];
  const out: PreviewView[] = [];
  for (const raw of list) {
    const v = raw === "side" ? "right" : raw;
    if ((PREVIEW_VIEWS as string[]).includes(v) && !out.includes(v as PreviewView)) out.push(v as PreviewView);
  }
  if (out.length === 0) {
    throw Object.assign(new Error(`Unknown preview view '${String(view)}'.`), { code: "MALFORMED_REQUEST" });
  }
  return out;
}

export function meshesFromEvaluation(evaluation: Evaluation): MeshData[] {
  return evaluation.bodies.filter((b) => b.visible && !b.consumed && b.mesh).map((b) => b.mesh!);
}

export function renderDocumentPreview(
  doc: CadDocument,
  view: string | string[] = "isometric",
  size?: { width?: number; height?: number },
  options?: { assemblyId?: string },
): RenderedView[] {
  const evaluation = evaluateDocument(doc);
  const meshes = options?.assemblyId
    ? meshesFromAssembly(doc, options.assemblyId)
    : meshesFromEvaluation(evaluation);
  if (meshes.length === 0) {
    throw Object.assign(new Error("No visible solid geometry to render."), {
      code: "PREVIEW_FAILED",
      suggestion: "Create a box, cylinder, or pad first.",
    });
  }
  return resolvePreviewViews(view).map((v) => {
    const rendered = rasterizeMeshes(meshes, v, {
      width: v === "thumbnail" ? 256 : size?.width,
      height: v === "thumbnail" ? 256 : size?.height,
    });
    return {
      view: v,
      png: rendered.png,
      width: rendered.width,
      height: rendered.height,
      triangleCount: rendered.triangleCount,
      bytes: rendered.png.length,
    };
  });
}

export function writePreviewPng(path: string, png: Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}
