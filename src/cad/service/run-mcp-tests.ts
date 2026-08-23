import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentCadMcpServer } from "../mcp/create-server";
import { resetAgentCadService } from "./agentcad";
import { handleMcpFetch } from "../mcp/http";
import { TOOL_CATALOG } from "../schema";
import { getFreeCadWorker } from "../kernel/client.server";

function parseTool(result: unknown): Record<string, unknown> {
  const text = (result as { content?: { text?: string }[] }).content?.[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const server = createAgentCadMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "agentcad-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-mcp-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  delete process.env.AGENTCAD_REQUIRE_AUTH;
  resetAgentCadService();

  await withClient(async (client) => {
    const listed = await client.listTools();
    assert(listed.tools.length >= 20, `tool count ${listed.tools.length}`);
    const names = listed.tools.map((t) => t.name);
    assert(names.includes("project_create") && names.includes("create_box"), "core tools missing");
    assert(!names.includes("eval_python"), "privileged tool leaked");
    const annotations = listed.tools.find((t) => t.name === "inspect_document")?.annotations;
    assert(annotations?.readOnlyHint === true, "inspect should be read-only");
    const mutate = listed.tools.find((t) => t.name === "create_box")?.annotations;
    assert(mutate?.readOnlyHint === false, "create_box must not be read-only");

    const created = await client.callTool({ name: "project_create", arguments: { name: "mcp-plate" } });
    const createdText = (created.content as { type: string; text: string }[])[0]?.text;
    const createdJson = JSON.parse(createdText || "{}") as { ok: boolean; project_id: string };
    assert(createdJson.ok && createdJson.project_id, createdText);

    const box = await client.callTool({
      name: "create_box",
      arguments: {
        project_id: createdJson.project_id,
        length_mm: 80,
        width_mm: 50,
        height_mm: 12,
      },
    });
    const boxJson = JSON.parse((box.content as { type: string; text: string }[])[0]?.text || "{}");
    assert(boxJson.ok, JSON.stringify(boxJson));

    const inspected = await client.callTool({
      name: "inspect_document",
      arguments: { project_id: createdJson.project_id },
    });
    const ins = JSON.parse((inspected.content as { type: string; text: string }[])[0]?.text || "{}");
    assert(ins.ok && ins.data.feature_count === 1, JSON.stringify(ins));

    const filletProj = parseTool(
      await client.callTool({ name: "project_create", arguments: { name: "bad-fillet" } }),
    );
    await client.callTool({
      name: "create_box",
      arguments: { project_id: filletProj.project_id, length_mm: 10, width_mm: 10, height_mm: 10 },
    });
    await client.callTool({
      name: "fillet",
      arguments: { project_id: filletProj.project_id, body_id: "Body", radius_mm: 8 },
    });
    const bad = parseTool(
      await client.callTool({ name: "validate", arguments: { project_id: filletProj.project_id } }),
    );
    const issues = (bad.data as { issues?: { code: string }[] })?.issues ?? [];
    const hit = issues.find((i) => i.code === "FILLET_RADIUS_TOO_LARGE" || i.code === "FILLET_FAILED");
    assert(hit || (bad.validation as { valid?: boolean } | undefined)?.valid === false, `expected fillet error ${JSON.stringify(bad)}`);
    console.log(`PASS  mcp-memory  tools=${listed.tools.length} project=${createdJson.project_id} fillet=${hit?.code ?? "invalid"}`);
  });

  const init = await handleMcpFetch(
    new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "http-test", version: "1" },
        },
      }),
    }),
  );
  assert(init.status === 200, `mcp http init ${init.status}`);
  const initBody = (await init.json()) as { result?: { protocolVersion?: string; serverInfo?: { name: string } } };
  assert(initBody.result?.serverInfo?.name === "agentcad", JSON.stringify(initBody));
  console.log(`PASS  mcp-http  protocol=${initBody.result?.protocolVersion}`);

  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const stdioTransport = new StdioClientTransport({
    command: process.execPath,
    args: ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.json", "src/cad/mcp/stdio.ts"],
    env: Object.fromEntries(Object.entries({ ...process.env, AGENTCAD_WORKSPACE: workspace }).filter((e): e is [string, string] => typeof e[1] === "string")),
    stderr: "pipe",
  });
  const stdioClient = new Client({ name: "stdio-test", version: "1" });
  await stdioClient.connect(stdioTransport);
  const stdioTools = await stdioClient.listTools();
  assert(stdioTools.tools.length === TOOL_CATALOG.length, `stdio tools ${stdioTools.tools.length} vs ${TOOL_CATALOG.length}`);
  const stdioCreated = await stdioClient.callTool({ name: "project_create", arguments: { name: "stdio-box" } });
  const stdioJson = JSON.parse((stdioCreated.content as { text: string }[])[0]!.text);
  assert(stdioJson.ok, JSON.stringify(stdioJson));
  await stdioClient.close();
  console.log(`PASS  mcp-stdio  tools=${stdioTools.tools.length} project=${stdioJson.project_id}`);

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
