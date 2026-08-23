import { inspectDocument } from "../inspect";
import { evaluateDocument } from "../evaluate";
import { meshesToObj, meshesToStl } from "../export-mesh";
import type { CadDocument } from "../types";
import type { CadKernel, ExportOptions, KernelExport, KernelStatus } from "./types";

export const jscadKernel: CadKernel = {
  id: "jscad",
  name: "JSCAD (preview)",

  async available(): Promise<KernelStatus> {
    return {
      id: "jscad",
      name: this.name,
      available: true,
      version: "@jscad/modeling",
      headless: true,
      detail: "In-process CSG preview kernel. Not the authoritative B-rep engine.",
    };
  },

  async evaluate(doc: CadDocument) {
    return evaluateDocument(doc);
  },

  async inspect(doc: CadDocument) {
    const evaluation = evaluateDocument(doc);
    return inspectDocument(doc, evaluation) as unknown as import("./protocol").InspectResult;
  },

  async validate(doc: CadDocument) {
    const evaluation = evaluateDocument(doc);
    return {
      ok: evaluation.ok,
      valid: evaluation.ok,
      shape_type: evaluation.bodies.some((b) => b.mesh) ? "Solid" : "Empty",
      solid_count: evaluation.bodies.filter((b) => b.visible && !b.consumed && b.mesh).length,
      volume_mm3: evaluation.volumeMm3,
      surface_area_mm2: 0,
      bounding_box: evaluation.bbox,
      issues: evaluation.issues.map((i) => ({
        severity: i.severity,
        code: i.code,
        message: i.message,
        feature: i.featureId,
        body: i.bodyId,
        suggestion: i.suggestion,
      })),
    };
  },

  async exportModel(doc: CadDocument, options: ExportOptions): Promise<KernelExport> {
    if (options.format === "step" || options.format === "fcstd" || options.format === "3mf") {
      throw Object.assign(new Error(`JSCAD cannot export ${options.format}. Use the FreeCAD kernel.`), {
        code: "KERNEL_UNAVAILABLE",
      });
    }
    const evaluation = evaluateDocument(doc);
    const meshes = evaluation.bodies
      .filter((b) => b.mesh && b.visible && !b.consumed && (!options.bodyId || b.bodyId === options.bodyId || b.name === options.bodyId))
      .map((b) => b.mesh!);
    const slug = (doc.name || "model").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "model";
    if (options.format === "json") {
      const text = JSON.stringify(
        { name: doc.name, units: doc.units, parameters: doc.parameters, bodies: doc.bodies, features: doc.features },
        null,
        2,
      );
      return {
        format: "json",
        path: `${slug}.agentcad.json`,
        filename: `${slug}.agentcad.json`,
        bytes: text.length,
        objects: [],
        text,
        success: true,
      };
    }
    if (meshes.length === 0) {
      throw Object.assign(new Error("Nothing to export — no visible solid geometry."), { code: "INVALID_SOLID" });
    }
    const text = options.format === "obj" ? meshesToObj(meshes, doc.name) : meshesToStl(meshes, doc.name);
    const filename = `${slug}.${options.format}`;
    return {
      format: options.format,
      path: filename,
      filename,
      bytes: text.length,
      objects: meshes.map((m) => m.bodyName),
      text,
      success: true,
    };
  },
};
