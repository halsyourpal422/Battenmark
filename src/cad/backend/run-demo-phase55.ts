import { emptyDocument } from "../document";
import { applyAll, applyOperation } from "../operations";
import { AGENTCAD_MCP_VERSION, AGENTCAD_SCHEMA_VERSION, CAD_SERVICE_VERSION, WORKING_PACKAGE_NAME } from "../version";
import { capabilityReportFromStatus, requiredCapabilitiesFor } from "./capabilities";
import { discoverFreeCad, freeCadSearchPlan } from "../kernel/discover.server";
import { getAgentCadService } from "../service/agentcad";
import { getFreeCadWorker } from "../kernel/client.server";

async function main() {
  console.log("=== Phase 5.5 demo ===\n");
  console.log(`working identifier: ${WORKING_PACKAGE_NAME} (not a public brand)`);
  console.log(`schema ${AGENTCAD_SCHEMA_VERSION}  mcp ${AGENTCAD_MCP_VERSION}  service ${CAD_SERVICE_VERSION}`);

  console.log("\nA — inspect_backend_capabilities (no FreeCAD type in the request)");
  const service = getAgentCadService();
  const caps = await service.executeTool("inspect_backend_capabilities", {});
  const data = caps.data as {
    default_backend: string;
    authoritative_geometry: string;
    backends: Array<{ id: string; available: boolean; capabilities: Record<string, boolean>; notes: string[] }>;
  };
  const fc = data.backends.find((b) => b.id === "freecad")!;
  console.log(`  default=${data.default_backend} authoritative=${data.authoritative_geometry}`);
  console.log(
    `  hole.through=${fc.capabilities["feature.hole.through"]}  pattern.circular=${fc.capabilities["pattern.circular"]}  assembly=${fc.capabilities.assembly}  helical=${fc.capabilities["feature.hole.helical_thread"]}`,
  );

  console.log("\nB — canonical create_hole (caller never says PartDesign::Hole)");
  const created = service.createProject({ name: "phase55-hole" });
  await service.executeTool("create_box", {
    project_id: created.project_id,
    length_mm: 80,
    width_mm: 50,
    height_mm: 12,
    name: "Plate",
  });
  const hole = await service.executeTool("create_hole", {
    project_id: created.project_id,
    body_id: "Body",
    face: "top_face",
    diameter_mm: 5,
    type: "through",
    from_left_mm: 10,
    from_front_mm: 10,
    name: "M5",
  });
  console.log(`  op=create_hole required=${requiredCapabilitiesFor("create_hole", { type: "through" }).join(",")}`);
  console.log(`  ok=${hole.ok} feature_id=${hole.feature_id}`);
  console.log("  Canonical operation → capability resolution → FreeCAD backend → PartDesign::Hole (adapter-private)");

  console.log("\nC — circular pattern fails explicitly");
  const { document } = applyAll(emptyDocument("circ"), [
    { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 },
    { op: "create_hole", body_id: "Body", diameter_mm: 4, x_mm: 10, y_mm: 10, name: "H" },
  ]);
  const { result: circ } = applyOperation(document, { op: "create_pattern", feature_id: "H", count: 6, kind: "circular" });
  console.log(`  ${circ.error?.error ?? "UNEXPECTED_OK"}`);

  console.log("\nD — macOS discovery plan (this sandbox is Linux; plan is still generated)");
  const live = discoverFreeCad();
  console.log(`  live: platform=${live.platform} arch=${live.arch} mode=${live.mode} exe=${live.executable}`);
  const macPlan = freeCadSearchPlan({
    platform: "darwin",
    homedir: "/Users/dev",
    env: {},
  });
  console.log(`  darwin candidates (first 4):`);
  for (const p of macPlan.macosBundles.slice(0, 4)) console.log(`    ${p}`);

  console.log("\nE — capability report from status");
  const report = capabilityReportFromStatus({
    freecad: {
      available: live.available,
      version: live.version,
      executable: live.executable,
      platform: live.platform,
      arch: live.arch,
      discovery_mode: live.mode,
    },
  });
  console.log(`  default_backend=${report.default_backend} schema=${caps.agentcad_schema_version}`);

  try {
    getFreeCadWorker().kill("SIGKILL");
  } catch {
    /* ignore */
  }
  console.log("\nPhase 5.5 demo complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
