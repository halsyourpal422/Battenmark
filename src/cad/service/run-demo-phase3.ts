/**
 * Phase 3 demos: mounting plate via the canonical service (MCP-equivalent calls),
 * then CLI-style and HTTP-style operations against the same workspace.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentCadMcpServer } from "../mcp/create-server";
import { resetAgentCadService } from "./agentcad";
import { handleAgentCadHttp } from "./http";

function parse(result: unknown): Record<string, unknown> {
  const r = result as { content?: { text?: string }[] };
  const text = r.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

async function main() {
  const workspace = process.env.AGENTCAD_WORKSPACE || mkdtempSync(join(tmpdir(), "agentcad-demo3-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  const service = resetAgentCadService();

  const server = createAgentCadMcpServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "phase3-demo", version: "1" });
  await server.connect(st);
  await client.connect(ct);

  const created = parse(await client.callTool({ name: "project_create", arguments: { name: "mounting-plate" } }));
  const projectId = created.project_id as string;
  const calls: Array<[string, Record<string, unknown>]> = [
    ["define_parameter", { name: "length", value: 100 }],
    ["define_parameter", { name: "width", value: 60 }],
    ["define_parameter", { name: "thickness", value: 5 }],
    ["define_parameter", { name: "hole_d", value: 4 }],
    ["define_parameter", { name: "inset", value: 10 }],
    ["create_body", { name: "Plate" }],
    ["create_box", { body_id: "Plate", name: "Blank", length_mm: "length", width_mm: "width", height_mm: "thickness" }],
    ["create_hole", { body_id: "Plate", face: "top_face", x_mm: "inset", y_mm: "inset", diameter_mm: "hole_d", through: true, name: "H1" }],
    ["create_hole", { body_id: "Plate", face: "top_face", x_mm: "length - inset", y_mm: "inset", diameter_mm: "hole_d", through: true, name: "H2" }],
    ["create_hole", { body_id: "Plate", face: "top_face", x_mm: "inset", y_mm: "width - inset", diameter_mm: "hole_d", through: true, name: "H3" }],
    ["create_hole", { body_id: "Plate", face: "top_face", x_mm: "length - inset", y_mm: "width - inset", diameter_mm: "hole_d", through: true, name: "H4" }],
    ["fillet", { body_id: "Plate", radius_mm: 2, name: "EdgeFillet" }],
    ["validate", {}],
    ["save_revision", { label: "plate v1" }],
  ];
  for (const [name, args] of calls) {
    const r = parse(await client.callTool({ name, arguments: { project_id: projectId, ...args } }));
    if (!r.ok) {
      console.error("FAIL", name, r);
      process.exit(1);
    }
    process.stdout.write(`mcp ${name} ok\n`);
  }

  const rebuilt = await service.rebuild(projectId);
  process.stdout.write(`rebuild ${rebuilt.ok ? "ok" : rebuilt.error?.error} ${JSON.stringify(rebuilt.data)?.slice(0, 120)}\n`);
  for (const format of ["fcstd", "step", "stl", "3mf"] as const) {
    const exp = await service.exportArtifact(projectId, format);
    process.stdout.write(`export ${format} ${exp.ok ? (exp.data as { artifact_id: string }).artifact_id : exp.error?.error}\n`);
  }

  await client.callTool({
    name: "set_parameter",
    arguments: { project_id: projectId, name: "length", value: 120 },
  });
  const after = await service.validateDocument(projectId);
  process.stdout.write(`length=120 validate volume=${(after.data as { volume_mm3?: number }).volume_mm3}\n`);

  const httpInspect = await handleAgentCadHttp(new Request(`http://127.0.0.1/api/v1/projects/${projectId}/document`));
  const body = (await httpInspect.json()) as { ok: boolean };
  process.stdout.write(`http inspect ${body.ok}\n`);

  await client.close().catch(() => undefined);
  await server.close().catch(() => undefined);
  process.stdout.write(`\nPhase 3 demo project_id=${projectId} workspace=${workspace}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
