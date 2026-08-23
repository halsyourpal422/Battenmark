import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CadDocument, Evaluation, MeshData } from "../types";
import { evaluateDocument } from "../evaluate";
import { rasterizeMeshes, type PreviewView } from "./raster";

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
): RenderedView[] {
  const evaluation = evaluateDocument(doc);
  const meshes = meshesFromEvaluation(evaluation);
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
