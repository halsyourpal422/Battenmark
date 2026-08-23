import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CadDocument } from "../types";
import { emptyDocument } from "../document";
import { cadError } from "../errors";
import { uid } from "../ids";
import { AGENTCAD_SCHEMA_VERSION, assertCompatibleSchema } from "../schema";
import { ensureProject, getCadWorkspace, slugify, writeJson } from "../kernel/workspace.server";

export interface ProjectMeta {
  agentcad_schema_version: typeof AGENTCAD_SCHEMA_VERSION;
  project_id: string;
  document_id: string;
  name: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
  current_revision_id: string | null;
  kernel?: "jscad" | "freecad";
}

export interface CadProject {
  meta: ProjectMeta;
  document: CadDocument;
}

export interface IdempotencyRecord {
  key: string;
  operation: string;
  argsHash: string;
  result: unknown;
  ts: number;
}

function metaPath(slug: string) {
  return join(ensureProject(slug), "project.json");
}

function documentPath(slug: string) {
  return join(ensureProject(slug), "document.json");
}

function idemPath(slug: string) {
  return join(ensureProject(slug), "logs", "idempotency.json");
}

export function listProjectSlugs(): string[] {
  const ws = getCadWorkspace();
  if (!existsSync(ws)) return [];
  return readdirSync(ws, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((slug) => existsSync(join(ws, slug, "project.json")));
}

export function readProject(idOrSlug: string): CadProject | null {
  const slug = resolveSlug(idOrSlug);
  if (!slug) return null;
  const root = join(getCadWorkspace(), slug);
  const metaFile = join(root, "project.json");
  if (!existsSync(metaFile)) return null;
  let meta = JSON.parse(readFileSync(metaFile, "utf8")) as Partial<ProjectMeta> & {
    document_id?: string;
    name?: string;
  };
  const docFile = join(root, "document.json");
  let document: CadDocument;
  if (existsSync(docFile)) {
    document = JSON.parse(readFileSync(docFile, "utf8")) as CadDocument;
  } else {
    document = emptyDocument(meta.name || slug);
    document.id = meta.document_id || document.id;
  }
  try {
    assertCompatibleSchema(meta.agentcad_schema_version);
    assertCompatibleSchema(document.schemaVersion);
  } catch (err) {
    throw cadError("SCHEMA_MISMATCH", err instanceof Error ? err.message : String(err));
  }
  const normalized: ProjectMeta = {
    agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
    project_id: meta.project_id || slug,
    document_id: meta.document_id || document.id,
    name: meta.name || document.name || slug,
    slug,
    createdAt: meta.createdAt || document.createdAt || Date.now(),
    updatedAt: meta.updatedAt || document.updatedAt || Date.now(),
    current_revision_id: meta.current_revision_id ?? document.currentRevisionId ?? null,
    kernel: meta.kernel,
  };
  return { meta: normalized, document };
}

export function resolveSlug(idOrSlug: string): string | null {
  const ws = getCadWorkspace();
  if (!idOrSlug) return null;
  if (existsSync(join(ws, idOrSlug, "project.json"))) return idOrSlug;
  for (const slug of listProjectSlugs()) {
    try {
      const meta = JSON.parse(readFileSync(join(ws, slug, "project.json"), "utf8")) as {
        project_id?: string;
        document_id?: string;
        slug?: string;
      };
      if (meta.project_id === idOrSlug || meta.slug === idOrSlug || meta.document_id === idOrSlug) {
        return slug;
      }
    } catch {
      /* skip corrupt */
    }
  }
  return null;
}

export function writeProject(project: CadProject) {
  const slug = project.meta.slug;
  ensureProject(slug);
  project.meta.updatedAt = Date.now();
  project.meta.current_revision_id = project.document.currentRevisionId;
  project.meta.document_id = project.document.id;
  project.document.updatedAt = project.meta.updatedAt;
  writeJson(metaPath(slug), project.meta);
  writeJson(documentPath(slug), project.document);
}

export function createProjectRecord(name: string, requestedSlug?: string): CadProject {
  const base = slugify(requestedSlug || name);
  let slug = base;
  let n = 2;
  while (existsSync(join(getCadWorkspace(), slug, "project.json"))) {
    slug = `${base}-${n++}`;
  }
  const document = emptyDocument(name);
  const now = Date.now();
  const meta: ProjectMeta = {
    agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
    project_id: slug,
    document_id: document.id,
    name,
    slug,
    createdAt: now,
    updatedAt: now,
    current_revision_id: null,
  };
  const project = { meta, document };
  writeProject(project);
  return project;
}

export function upsertProjectFromDocument(doc: CadDocument, hintName?: string): CadProject {
  for (const slug of listProjectSlugs()) {
    const existing = readProject(slug);
    if (existing && existing.document.id === doc.id) {
      existing.document = doc;
      existing.meta.name = doc.name || existing.meta.name;
      writeProject(existing);
      return existing;
    }
  }
  const created = createProjectRecord(hintName || doc.name || "Untitled");
  created.document = { ...doc, name: doc.name || created.meta.name };
  created.meta.document_id = created.document.id;
  created.meta.name = created.document.name;
  writeProject(created);
  return created;
}

export function requireProject(idOrSlug: string): CadProject {
  const project = readProject(idOrSlug);
  if (!project) {
    throw cadError("PROJECT_NOT_FOUND", `Project '${idOrSlug}' was not found.`, {
      suggestion: "Call project_create or project_list.",
    });
  }
  return project;
}

export function readIdempotency(slug: string): IdempotencyRecord[] {
  const path = idemPath(slug);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as IdempotencyRecord[];
  } catch {
    return [];
  }
}

export function writeIdempotency(slug: string, records: IdempotencyRecord[]) {
  mkdirSync(join(ensureProject(slug), "logs"), { recursive: true });
  writeFileSync(idemPath(slug), JSON.stringify(records.slice(-100), null, 2));
}

export function hashArgs(args: unknown) {
  return JSON.stringify(args);
}

export { uid };
