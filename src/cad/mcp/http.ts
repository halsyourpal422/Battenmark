import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAgentCadMcpServer } from "./create-server";
import { authorizeRequest, corsHeaders } from "../service/auth";

export async function handleMcpFetch(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const auth = authorizeRequest(request, "cad:read");
  if (!auth.ok) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: auth.code === "AUTH_REQUIRED" ? -32001 : -32003, message: auth.message },
        id: null,
      }),
      { status: auth.code === "AUTH_REQUIRED" ? 401 : 403, headers: { "content-type": "application/json", ...headers } },
    );
  }

  if (request.method === "GET" || request.method === "DELETE") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed. Stateless Streamable HTTP accepts POST." },
        id: null,
      }),
      { status: 405, headers: { "content-type": "application/json", ...headers } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createAgentCadMcpServer();
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) {
    if (!merged.has(k)) merged.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers: merged });
}
