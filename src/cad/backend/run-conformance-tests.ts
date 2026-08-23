import { existsSync } from "node:fs";
import { freeCadKernel } from "../kernel/freecad.server";
import { getFreeCadWorker } from "../kernel/client.server";
import { runConformance, type ConformanceBackend } from "./conformance";
import { capabilityReportFromStatus, freecadCapabilities } from "./capabilities";

async function main() {
  const worker = getFreeCadWorker();
  const status = await freeCadKernel.available();
  if (!status.available) {
    console.error(`FreeCAD unavailable: ${status.detail}`);
    process.exit(1);
  }

  const caps = freecadCapabilities({
    available: true,
    version: status.version,
    executable: status.executable,
  });
  const report = capabilityReportFromStatus({
    freecad: { available: true, version: status.version, executable: status.executable },
  });
  console.log(
    `conformance backend=${report.default_backend} version=${status.version} circular=${caps.capabilities["pattern.circular"]} assembly=${caps.capabilities.assembly}`,
  );

  const backend: ConformanceBackend = {
    id: "freecad",
    async inspect(doc) {
      const ins = await freeCadKernel.inspect(doc);
      return {
        valid: ins.valid,
        volume_mm3: ins.volume_mm3,
        solid_count: ins.solid_count,
        bounding_box: ins.bounding_box,
        issues: ins.issues,
        shape_type: ins.shape_type,
      };
    },
    async exportModel(doc, format) {
      const out = await freeCadKernel.exportModel(doc, { format, projectSlug: "conformance" });
      return { success: out.success && existsSync(out.path), path: out.path, bytes: out.bytes };
    },
    async importStep(path) {
      const worker = getFreeCadWorker();
      const res = await worker.request(
        "import",
        { path, format: "step", arguments: { path, format: "step" } },
        90_000,
      );
      const payload = (res.result || {}) as {
        inspect?: { valid?: boolean; volume_mm3?: number };
      };
      return {
        valid: Boolean(res.ok && payload.inspect?.valid),
        volume_mm3: Number(payload.inspect?.volume_mm3 ?? 0),
        parametric: false,
      };
    },
  };

  const results = await runConformance(backend);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} conformance cases passed (backend=${backend.id})`);
  try {
    await worker.request("shutdown", {}, 5_000);
  } catch {
    /* ignore */
  }
  worker.kill("SIGKILL");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
