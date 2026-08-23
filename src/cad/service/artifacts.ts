import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uid } from "../ids";
import { cadError } from "../errors";
import { ensureProject, getCadWorkspace, writeJson } from "../kernel/workspace.server";
import { listProjectSlugs } from "./store";

export interface ArtifactMeta {
  artifact_id: string;
  project_id: string;
  format: string;
  filename: string;
  bytes: number;
  revision_id?: string | null;
  createdAt: number;
  media_type: string;
}

function indexPath() {
  return join(getCadWorkspace(), "_artifacts.json");
}

function readIndex(): Record<string, { project_id: string; slug: string }> {
  const path = indexPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, { project_id: string; slug: string }>;
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, { project_id: string; slug: string }>) {
  mkdirSync(getCadWorkspace(), { recursive: true });
  writeFileSync(indexPath(), JSON.stringify(index, null, 2));
}

export function mediaTypeFor(format: string) {
  switch (format) {
    case "step":
      return "application/step";
    case "stl":
      return "model/stl";
    case "3mf":
      return "model/3mf";
    case "fcstd":
      return "application/zip";
    case "obj":
      return "model/obj";
    case "json":
    case "agentcad.json":
      return "application/json";
    case "png":
    case "preview":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

export function storeArtifact(opts: {
  slug: string;
  projectId: string;
  format: string;
  filename: string;
  bytes: Buffer | string;
  revisionId?: string | null;
}): ArtifactMeta {
  const artifact_id = uid("art");
  const dir = join(ensureProject(opts.slug), "artifacts", artifact_id);
  mkdirSync(dir, { recursive: true });
  const buf = typeof opts.bytes === "string" ? Buffer.from(opts.bytes, "utf8") : opts.bytes;
  const filePath = join(dir, opts.filename);
  writeFileSync(filePath, buf);
  const meta: ArtifactMeta = {
    artifact_id,
    project_id: opts.projectId,
    format: opts.format,
    filename: opts.filename,
    bytes: buf.length,
    revision_id: opts.revisionId ?? null,
    createdAt: Date.now(),
    media_type: mediaTypeFor(opts.format),
  };
  writeJson(join(dir, "meta.json"), meta);
  const index = readIndex();
  index[artifact_id] = { project_id: opts.projectId, slug: opts.slug };
  writeIndex(index);
  return meta;
}

export function getArtifact(artifactId: string): { meta: ArtifactMeta; path: string; bytes: Buffer } | null {
  const index = readIndex();
  let slug = index[artifactId]?.slug;
  if (!slug) {
    for (const s of listProjectSlugs()) {
      const candidate = join(getCadWorkspace(), s, "artifacts", artifactId, "meta.json");
      if (existsSync(candidate)) {
        slug = s;
        break;
      }
    }
  }
  if (!slug) return null;
  const dir = join(getCadWorkspace(), slug, "artifacts", artifactId);
  const metaFile = join(dir, "meta.json");
  if (!existsSync(metaFile)) return null;
  const meta = JSON.parse(readFileSync(metaFile, "utf8")) as ArtifactMeta;
  const filePath = join(dir, meta.filename);
  if (!existsSync(filePath)) return null;
  return { meta, path: filePath, bytes: readFileSync(filePath) };
}

export function requireArtifact(artifactId: string) {
  const art = getArtifact(artifactId);
  if (!art) {
    throw cadError("ARTIFACT_NOT_FOUND", `Artifact '${artifactId}' was not found.`);
  }
  return art;
}
