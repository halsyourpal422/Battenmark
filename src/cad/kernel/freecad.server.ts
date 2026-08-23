import { readFileSync } from "node:fs";
import type { CadDocument, Evaluation, GeometryQueryResult, GeometrySelector } from "../types";
import { evaluateDocument } from "../evaluate";
import { CadWorkerError, getFreeCadWorker, withDocumentLock } from "./client.server";
import type { CadKernel, ExportOptions, KernelExport, KernelStatus } from "./types";
import type { InspectResult, ValidateResult } from "./protocol";
import { exportFilename, fileHash, slugify, workspacePath, writeJson } from "./workspace.server";

function toEval(doc: CadDocument, inspected: InspectResult): Evaluation {
  // Viewport still uses JSCAD; this mapping is for kernel-native consumers.
  const bbox = inspected.bounding_box
    ? { min: inspected.bounding_box.min, max: inspected.bounding_box.max }
    : null;
  return {
    ok: inspected.valid,
    issues: (inspected.issues || []).map((i) => ({
      severity: i.severity,
      code: i.code,
      message: i.message,
      featureId: i.feature,
      bodyId: i.body,
      suggestion: i.suggestion,
    })),
    bodies: doc.bodies.map((b) => {
      const match = inspected.bodies.find((x) => x.id === b.id || x.name === b.name) as
        | { volume_mm3?: number; bounding_box_mm?: { min: Evaluation["bbox"] extends infer B ? B : never } ; valid?: boolean }
        | undefined;
      return {
        bodyId: b.id,
        name: b.name,
        visible: b.visible,
        consumed: b.consumed,
        volumeMm3: Number(match?.volume_mm3 ?? 0),
        bbox: bbox ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        triangleCount: 0,
        faces: [],
        mesh: null,
        valid: match?.valid ?? inspected.valid,
        issues: [],
      };
    }),
    triangleCount: 0,
    volumeMm3: inspected.volume_mm3,
    bbox,
  };
}

export const freeCadKernel: CadKernel = {
  id: "freecad",
  name: "FreeCAD / OpenCascade",

  async available(): Promise<KernelStatus> {
    const worker = getFreeCadWorker();
    const disc = worker.getDiscovery();
    if (!disc.available) {
      return {
        id: "freecad",
        name: this.name,
        available: false,
        detail: disc.detail,
        executable: undefined,
      };
    }
    try {
      const res = await worker.request("hello", {}, 30_000);
      const r = (res.result || {}) as {
        freecad_version?: string;
        python_version?: string;
        pid?: number;
        modules?: Record<string, boolean>;
        headless?: boolean;
      };
      return {
        id: "freecad",
        name: this.name,
        available: Boolean(res.ok),
        version: r.freecad_version ?? disc.version ?? undefined,
        python: r.python_version,
        pid: r.pid ?? worker.getPid() ?? undefined,
        modules: r.modules,
        headless: r.headless ?? true,
        executable: disc.executable ?? undefined,
        detail: disc.detail,
      };
    } catch (err) {
      return {
        id: "freecad",
        name: this.name,
        available: false,
        executable: disc.executable ?? undefined,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async evaluate(doc: CadDocument): Promise<Evaluation> {
    const inspected = (await this.inspect(doc)) as InspectResult;
    return toEval(doc, inspected);
  },

  async inspect(doc: CadDocument): Promise<InspectResult> {
    return withDocumentLock(doc.id, async () => {
      const worker = getFreeCadWorker();
      const res = await worker.request<InspectResult>("rebuild", { document: stripForWorker(doc) }, 180_000);
      if (!res.ok || !res.result) {
        throw new CadWorkerError(res.error?.code ?? "RECOMPUTE_FAILED", res.error?.message ?? "rebuild failed", {
          ...(res.error || {}),
        });
      }
      return res.result;
    });
  },

  async validate(doc: CadDocument) {
    const inspected = await this.inspect(doc);
    return {
      valid: inspected.valid,
      shape_type: inspected.shape_type,
      solid_count: inspected.solid_count,
      volume_mm3: inspected.volume_mm3,
      surface_area_mm2: inspected.surface_area_mm2,
      bounding_box: inspected.bounding_box,
      issues: inspected.issues,
      self_intersection: {
        checked: false,
        note: "OpenCascade Shape.isValid() is the check used. Dedicated self-intersection is not claimed.",
      },
    } satisfies ValidateResult;
  },

  async exportModel(doc: CadDocument, options: ExportOptions): Promise<KernelExport> {
    const slug = slugify(options.projectSlug || doc.name || "model");
    const format = options.format;
    if (format === "obj" || format === "json") {
      throw new CadWorkerError("EXPORT_FAILED", `FreeCAD kernel does not emit ${format}. Use JSCAD or STEP/STL/FCStd.`);
    }
    return withDocumentLock(doc.id, async () => {
      const worker = getFreeCadWorker();
      const rebuilt = await worker.request<InspectResult>("rebuild", { document: stripForWorker(doc) }, 180_000);
      if (!rebuilt.ok || !rebuilt.result) {
        throw new CadWorkerError(rebuilt.error?.code ?? "RECOMPUTE_FAILED", rebuilt.error?.message ?? "rebuild failed");
      }
      const filename = exportFilename(slug, format === "step" ? "step" : format);
      const path = workspacePath(slug, "exports", filename);
      if (format === "fcstd") {
        const src = workspacePath(slug, "source", filename);
        const res = await worker.request("export", { arguments: { format: "fcstd", path: src } }, 60_000);
        if (!res.ok) {
          throw new CadWorkerError(res.error?.code ?? "EXPORT_FAILED", res.error?.message ?? "FCStd export failed");
        }
        const bytes = Number((res.result as { bytes?: number })?.bytes ?? 0);
        const buf = readFileSync(src);
        writeJson(workspacePath(slug, "project.json"), {
          name: doc.name,
          document_id: doc.id,
          kernel: "freecad",
          source: src,
          updatedAt: Date.now(),
          hash: fileHash(src),
          validation: {
            valid: rebuilt.result.valid,
            volume_mm3: rebuilt.result.volume_mm3,
            shape_type: rebuilt.result.shape_type,
          },
        });
        return {
          format: "fcstd",
          path: src,
          filename,
          bytes,
          objects: (res.result as { objects?: string[] })?.objects ?? [],
          base64: buf.toString("base64"),
          success: true,
          revision: options.revisionId ?? doc.currentRevisionId,
          validation: {
            valid: rebuilt.result.valid,
            shape_type: rebuilt.result.shape_type,
            solid_count: rebuilt.result.solid_count,
            volume_mm3: rebuilt.result.volume_mm3,
            surface_area_mm2: rebuilt.result.surface_area_mm2,
            bounding_box: rebuilt.result.bounding_box,
            issues: rebuilt.result.issues,
          },
        };
      }
      const res = await worker.request("export", { arguments: { format, path, body_id: options.bodyId } }, 60_000);
      if (!res.ok) {
        throw new CadWorkerError(res.error?.code ?? "EXPORT_FAILED", res.error?.message ?? `${format} export failed`);
      }
      const buf = readFileSync(path);
      const text = format === "step" || format === "stl" ? buf.toString("utf8") : undefined;
      return {
        format,
        path,
        filename,
        bytes: buf.length,
        objects: (res.result as { objects?: string[] })?.objects ?? [],
        text,
        base64: format === "3mf" ? buf.toString("base64") : undefined,
        success: true,
        revision: options.revisionId ?? doc.currentRevisionId,
        validation: {
          valid: rebuilt.result.valid,
          shape_type: rebuilt.result.shape_type,
          solid_count: rebuilt.result.solid_count,
          volume_mm3: rebuilt.result.volume_mm3,
          surface_area_mm2: rebuilt.result.surface_area_mm2,
          bounding_box: rebuilt.result.bounding_box,
          issues: rebuilt.result.issues,
        },
      };
    });
  },
};

function stripForWorker(doc: CadDocument) {
  return {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    name: doc.name,
    units: doc.units,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    parameters: doc.parameters,
    bodies: doc.bodies,
    features: doc.features,
    log: [] as const,
    revisions: [] as const,
    currentRevisionId: doc.currentRevisionId,
    geometryRefs: doc.geometryRefs ?? [],
  };
}

export async function queryGeometry(
  doc: CadDocument,
  opts: { bodyId?: string; entity?: "edge" | "face" | "vertex"; selector?: GeometrySelector; createdBy?: string } = {},
): Promise<GeometryQueryResult> {
  return withDocumentLock(doc.id, async () => {
    const worker = getFreeCadWorker();
    const res = await worker.request<GeometryQueryResult>(
      "query",
      {
        document: stripForWorker(doc),
        arguments: {
          body_id: opts.bodyId,
          entity: opts.entity,
          selector: opts.selector,
          created_by: opts.createdBy,
          grefs: doc.geometryRefs ?? [],
        },
      },
      180_000,
    );
    if (!res.ok || !res.result) {
      throw new CadWorkerError(res.error?.code ?? "GEOMETRY_SELECTOR_NO_MATCH", res.error?.message ?? "query failed", {
        ...(res.error || {}),
      });
    }
    return res.result;
  });
}

export function previewEvaluate(doc: CadDocument) {
  return evaluateDocument(doc);
}
