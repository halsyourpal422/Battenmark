import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";
import { cadError } from "../errors";
import { ensureProject, getCadWorkspace, workspacePath } from "../kernel/workspace.server";
import { getArtifact } from "./artifacts";

const FORMAT_MAP: Record<string, "step" | "fcstd" | "iges" | "stl" | "obj" | "3mf"> = {
  step: "step",
  stp: "step",
  fcstd: "fcstd",
  iges: "iges",
  igs: "iges",
  stl: "stl",
  obj: "obj",
  "3mf": "3mf",
};

function under(root: string, target: string) {
  const r = resolve(root);
  const t = resolve(target);
  return t === r || t.startsWith(r + sep);
}

export function detectImportFormat(name: string, explicit?: string) {
  const raw = (explicit || extname(name).replace(".", "")).toLowerCase();
  const mapped = FORMAT_MAP[raw];
  if (!mapped) {
    throw cadError("UNSUPPORTED_FORMAT", `Cannot import '${raw || "unknown"}'.`, {
      suggestion: "Use STEP, FCStd, IGES, STL, OBJ, or 3MF.",
    });
  }
  return mapped;
}

export function resolveReadablePath(raw: string): string {
  const abs = resolve(raw);
  const allowed = [getCadWorkspace(), resolve(process.cwd()), "/tmp", "/opt/freecad"];
  if (!existsSync(abs)) {
    throw cadError("IMPORT_FAILED", `File not found: ${raw}`);
  }
  if (!allowed.some((root) => under(root, abs))) {
    throw cadError("PATH_DENIED", "Import paths must be inside the AgentCAD workspace.", {
      suggestion: "Copy the file into the project workspace first, or pass an artifact_id.",
    });
  }
  return abs;
}

export function ingestImportSource(
  slug: string,
  args: { path?: string; artifact_id?: string; format?: string; name?: string },
): { absPath: string; format: ReturnType<typeof detectImportFormat>; filename: string } {
  let sourcePath: string;
  let filename: string;
  if (args.artifact_id) {
    const art = getArtifact(args.artifact_id);
    if (!art) throw cadError("ARTIFACT_NOT_FOUND", `Artifact '${args.artifact_id}' was not found.`);
    sourcePath = art.path;
    filename = art.meta.filename;
  } else if (args.path) {
    sourcePath = resolveReadablePath(args.path);
    filename = basename(sourcePath);
  } else {
    throw cadError("MALFORMED_REQUEST", "import requires path or artifact_id.");
  }
  const format = detectImportFormat(filename, args.format);
  const safe = filename.replace(/[^\w.-]+/g, "_") || `import.${format}`;
  mkdirSync(workspacePath(slug, "imports"), { recursive: true });
  const dest = workspacePath(slug, "imports", safe);
  if (resolve(sourcePath) !== dest) copyFileSync(sourcePath, dest);
  ensureProject(slug);
  return { absPath: dest, format, filename: safe };
}
