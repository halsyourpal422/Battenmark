import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgentCadMcpServer } from "./create-server";

async function main() {
  const server = createAgentCadMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("agentcad-mcp stdio ready\n");
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.stack || err.message : String(err)) + "\n");
  process.exit(1);
});
