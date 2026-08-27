/**
 * build123d backend adapter (Phase 6.2).
 *
 * Executes the Phase 6.2 conformance slice through an isolated Python
 * process (b23d/worker.py). No FreeCAD imports on this path; dependency
 * isolation per ADR-0004. Selected centrally via BATTENMARK_CAD_BACKEND.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CadDocument, Feature } from "../types";
import { cadError } from "../errors";
import { paramMap } from "../document";
import { resolveDim } from "../expressions";
import { rmSync } from "node:fs";
import type { CadKernel, ExportOptions, KernelExport, KernelStatus } from "./types";

const WORKER = resolve(process.cwd(), "b23d/worker.py");
const PYTHON = () => process.env.B23D_PYTHON ?? "/Applications/FreeCAD.app/Contents/Resources/bin/python";
const DEFAULT_VENDOR = join(process.cwd(), "vendor/b23d-py");
const VENDOR = (): string | undefined => {
  if (process.env.B23D_VENDOR) return join(process.cwd(), process.env.B23D_VENDOR);
  try {
    if (require("node:fs").existsSync(DEFAULT_VENDOR)) return DEFAULT_VENDOR;
  } catch { /* ignore */ }
  return undefined;
};

function numericFeatures(doc: CadDocument): Feature[] {
  const params = paramMap(doc);
  const num = (v: unknown): number => (typeof v === "number" ? v : Number(resolveDim(v as never, params, "dim")));
  return doc.features.map((f) => {
    const clone = JSON.parse(JSON.stringify(f)) as Record<string, any>;
    for (const key of ["length", "width", "height", "radius", "diameter", "depth", "distance", "u", "v", "x_mm", "y_mm"]) {
      if (clone[key] !== undefined && typeof clone[key] !== "object") {
        try { clone[key] = num(clone[key]); } catch { /* leave; worker reports honestly */ }
      }
    }
    if (clone.origin) {
      for (const axis of ["x", "y", "z"]) {
        if (clone.origin[axis] !== undefined) clone.origin[axis] = num(clone.origin[axis]);
      }
    }
    return clone as unknown as Feature;
  });
}

function run(op: string, payload: Record<string, unknown>): Record<string, any> {
  const dir = mkdtempSync(join(tmpdir(), "b23d-"));
  const payloadPath = join(dir, "payload.json");
  writeFileSync(payloadPath, JSON.stringify(payload));
  try {
    const stdout = execFileSync(PYTHON(), [WORKER, op, payloadPath], {
      env: { ...process.env, PYTHONUNBUFFERED: "1", ...(VENDOR() ? { PYTHONPATH: VENDOR() } : {}) },
      timeout: 120_000,
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const line = stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
    const parsed = JSON.parse(line ?? "{}") as Record<string, any>;
    if (!parsed.ok) {
      const code = String(parsed.error?.code ?? "");
      throw cadError(
        code === "UNSUPPORTED_FEATURE" ? "BACKEND_UNSUPPORTED" : op === "export" ? "EXPORT_FAILED" : op === "import" ? "IMPORT_FAILED" : "RECOMPUTE_FAILED",
        String(parsed.error?.message ?? "build123d execution failed"),
        { backend: "build123d" },
      );
    }
    return parsed.result as Record<string, any>;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    if ((e as any).jse_cause || e.message?.includes("BACKEND_UNSUPPORTED") || e.message?.includes("not supported by this backend")) {
      throw cadError("BACKEND_UNSUPPORTED", e.message, { backend: "build123d" });
    }
    if (e.code === "ENOENT") {
      throw cadError("BACKEND_UNAVAILABLE", `build123d python interpreter not found: ${PYTHON()}`);
    }
    throw err;
  } finally {
    try { require("node:fs").rmSync(dir, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ }
  }
}

let cachedHello: KernelStatus | null = null;
async function hello(): Promise<KernelStatus> {
  if (cachedHello) return cachedHello as KernelStatus;
  try {
    const r = run("hello", {});
    cachedHello = {
      id: "build123d",
      name: "build123d / OpenCascade",
      available: true,
      version: String(r.version ?? "unknown"),
      kernel: "OpenCascade",
      headless: true,
      detail: "Experimental second authoritative backend (Phase 6.2 conformance slice)",
    };
  } catch (err) {
    cachedHello = {
      id: "build123d",
      name: "build123d / OpenCascade",
      available: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  return cachedHello;
}

export const build123dKernel: CadKernel = {
  id: "build123d",
  name: "build123d / OpenCascade",

  async available(): Promise<KernelStatus> {
    return hello();
  },

  async evaluate(doc: CadDocument) {
    void doc;
    throw cadError("BACKEND_UNSUPPORTED", "JSCAD evaluation is the preview path; build123d does not provide it.");
  },

  async inspect(doc: CadDocument) {
    const r = run("build", { document: { parameters: doc.parameters, bodies: doc.bodies, features: numericFeatures(doc) } });
    return {
      valid: Boolean(r.valid),
      issues: [],
      bodies: [],
      features: [],
      parameters: {},
      bounding_box: r.bounding_box,
      solid_count: Number(r.solid_count),
      volume_mm3: Number(r.volume_mm3),
      surface_area_mm2: Number(r.surface_area_mm2 ?? 0),
      shape_type: String(r.shape_type ?? "Solid"),
    } as never;
  },

  async validate(doc: CadDocument) {
    const i = await this.inspect(doc);
    return {
      valid: i.valid,
      shape_type: i.shape_type,
      solid_count: i.solid_count,
      volume_mm3: i.volume_mm3,
      surface_area_mm2: i.surface_area_mm2,
      bounding_box: i.bounding_box,
      issues: [],
    };
  },

  async exportModel(doc: CadDocument, options: ExportOptions): Promise<KernelExport> {
    if (options.format !== "step") {
      throw cadError("BACKEND_UNSUPPORTED", `build123d adapter supports STEP export only (got ${options.format}).`);
    }
    const slugified = (options.projectSlug || doc.name || "model").replace(/[^\w-]+/g, "-").toLowerCase();
    const path = join(tmpdir(), `b23d-${slugified}-${Date.now().toString(36)}.step`);
    const r = run("export", { document: { parameters: doc.parameters, bodies: doc.bodies, features: numericFeatures(doc) }, path });
    const inspection = await this.inspect(doc);
    return {
      format: "step",
      path: r.path,
      filename: r.path.split("/").pop()!,
      bytes: Number(r.bytes),
      objects: [],
      success: true,
      validation: {
        valid: inspection.valid,
        shape_type: inspection.shape_type,
        solid_count: inspection.solid_count,
        volume_mm3: inspection.volume_mm3,
        bounding_box: inspection.bounding_box,
        issues: [],
      },
    } as unknown as KernelExport;
  },
};

/** Import an existing STEP file through build123d and inspect it. */
export async function importInspect(path: string): Promise<{
  valid: boolean;
  volume_mm3: number;
  solid_count: number;
  bounding_box: unknown;
}> {
  const r = run("import", { path });
  return {
    valid: Boolean(r.valid),
    volume_mm3: Number(r.volume_mm3),
    solid_count: Number(r.solid_count),
    bounding_box: r.bounding_box,
  };
}

/** Centralized backend selection (Phase 6.2 §11). FreeCAD remains default. */
export function selectedBackend(): "freecad" | "build123d" {
  return process.env.BATTENMARK_CAD_BACKEND === "build123d" ? "build123d" : "freecad";
}
