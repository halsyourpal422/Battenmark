import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export function getCadWorkspace() {
  return process.env.AGENTCAD_WORKSPACE || resolve(process.cwd(), "projects");
}

/** @deprecated Use getCadWorkspace() so tests can retarget the workspace. */
export const CAD_WORKSPACE = getCadWorkspace();

const SAFE = /^[A-Za-z0-9._-]+$/;

export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "model";
}

export function assertSafeSegment(value: string, field = "name") {
  if (!value || value.includes("..") || value.includes(sep) || value.includes("/") || !SAFE.test(value)) {
    const err = new Error(`Illegal ${field} '${value}'.`);
    (err as Error & { code: string }).code = "PATH_DENIED";
    throw err;
  }
}

export function projectRoot(slug: string) {
  assertSafeSegment(slug, "project");
  const ws = resolve(getCadWorkspace());
  const root = resolve(ws, slug);
  if (!root.startsWith(ws + sep) && root !== ws) {
    const err = new Error("Path traversal denied.");
    (err as Error & { code: string }).code = "PATH_DENIED";
    throw err;
  }
  return root;
}

export function ensureProject(slug: string) {
  const root = projectRoot(slug);
  for (const dir of ["source", "revisions", "exports", "previews", "logs", "artifacts", "imports"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}

export function workspacePath(slug: string, ...parts: string[]) {
  const root = ensureProject(slug);
  const resolved = resolve(root, ...parts);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    const err = new Error("Path traversal denied.");
    (err as Error & { code: string }).code = "PATH_DENIED";
    throw err;
  }
  return resolved;
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function fileHash(path: string) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function exportFilename(slug: string, format: string) {
  const ext = format === "fcstd" ? "FCStd" : format;
  return `${slug}.${ext}`;
}

export function revisionFilename(index: number) {
  return `rev_${String(index).padStart(4, "0")}.FCStd`;
}

export { basename, join };
