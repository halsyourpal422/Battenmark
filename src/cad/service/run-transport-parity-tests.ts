import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentCadMcpServer } from "../mcp/create-server";
import { resetAgentCadService } from "./agentcad";
import { handleAgentCadHttp } from "./http";
import { getFreeCadWorker } from "../kernel/client.server";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function cli(args: string[], workspace: string) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.json", "src/cad/cli/main.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AGENTCAD_WORKSPACE: workspace },
  });
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-parity-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  delete process.env.AGENTCAD_REQUIRE_AUTH;
  const service = resetAgentCadService();

  const direct = service.createProject({ name: "parity-direct" });
  await service.executeTool("create_box", {
    project_id: direct.project_id,
    length_mm: 80,
    width_mm: 50,
    height_mm: 12,
    name: "Base",
  });
  const directV = await service.validateDocument(direct.project_id!);
  const directVol = (directV.data as { volume_mm3: number }).volume_mm3;

  const createdCli = cli(["project", "create", "parity-cli", "--json"], workspace);
  const cliProj = JSON.parse(createdCli.stdout) as { project_id: string };
  const boxCli = cli(
    ["box", "--project", cliProj.project_id, "--length", "80", "--width", "50", "--height", "12", "--name", "Base", "--json"],
    workspace,
  );
  assert(boxCli.status === 0, boxCli.stderr + boxCli.stdout);
  const valCli = cli(["validate", "--project", cliProj.project_id, "--json"], workspace);
  const cliVol = (JSON.parse(valCli.stdout).data as { volume_mm3: number }).volume_mm3;

  const httpCreate = await handleAgentCadHttp(
    new Request("http://127.0.0.1/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "parity-http" }),
    }),
  );
  const httpProj = (await httpCreate.json()) as { project_id: string };
  await handleAgentCadHttp(
    new Request(`http://127.0.0.1/api/v1/projects/${httpProj.project_id}/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "create_box",
        arguments: { length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" },
      }),
    }),
  );
  const httpVal = await handleAgentCadHttp(
    new Request(`http://127.0.0.1/api/v1/projects/${httpProj.project_id}/validate`, { method: "POST", body: "{}" }),
  );
  const httpVol = ((await httpVal.json()) as { data: { volume_mm3: number } }).data.volume_mm3;

  const mcpServer = createAgentCadMcpServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parity", version: "1" });
  await mcpServer.connect(st);
  await client.connect(ct);
  const mcpCreated = await client.callTool({ name: "project_create", arguments: { name: "parity-mcp" } });
  const mcpProj = JSON.parse((mcpCreated.content as { text: string }[])[0]!.text) as { project_id: string };
  await client.callTool({
    name: "create_box",
    arguments: { project_id: mcpProj.project_id, length_mm: 80, width_mm: 50, height_mm: 12, name: "Base" },
  });
  const mcpVal = await client.callTool({ name: "validate", arguments: { project_id: mcpProj.project_id } });
  const mcpVol = (JSON.parse((mcpVal.content as { text: string }[])[0]!.text) as { data: { volume_mm3: number } }).data
    .volume_mm3;
  await client.close().catch(() => undefined);
  await mcpServer.close().catch(() => undefined);

  assert(Math.abs(directVol - 48000) < 2, `direct ${directVol}`);
  assert(Math.abs(cliVol - 48000) < 2, `cli ${cliVol}`);
  assert(Math.abs(httpVol - 48000) < 2, `http ${httpVol}`);
  assert(Math.abs(mcpVol - 48000) < 2, `mcp ${mcpVol}`);
  console.log(`PASS  parity  direct=${directVol} cli=${cliVol} http=${httpVol} mcp=${mcpVol}`);

  const continued = service.createProject({ name: "cross" });
  await service.executeTool("create_box", {
    project_id: continued.project_id,
    length_mm: 100,
    width_mm: 60,
    height_mm: 5,
  });
  const viaCli = cli(["inspect", "--project", continued.project_id!, "--json"], workspace);
  assert(JSON.parse(viaCli.stdout).ok, viaCli.stdout);
  await handleAgentCadHttp(
    new Request(`http://127.0.0.1/api/v1/projects/${continued.project_id}/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "set_feature_param", arguments: { feature_id: "Box", param: "length", value: 120 } }),
    }),
  );
  const after = service.inspectDocument(continued.project_id!);
  const bbox = (after.data as { validation: { volume_mm3: number } }).validation.volume_mm3;
  assert(Math.abs(bbox - 36000) < 5, `cross-transport volume ${bbox}`);
  console.log("PASS  cross-transport  MCP/service → CLI inspect → HTTP param → inspect");

  // Explicit worker teardown: detached child pipes otherwise hold the event loop.
  const worker = getFreeCadWorker();
  try {
    await worker.request("shutdown", {}, 5_000);
  } catch {
    /* worker never started */
  }
  worker.kill("SIGKILL");

  rmSync(workspace, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
