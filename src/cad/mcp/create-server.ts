import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENTCAD_MCP_VERSION, TOOL_CATALOG, toolAnnotations, type CatalogEntry } from "../schema";
import { getAgentCadService } from "../service/agentcad";

function zodForProp(spec: Record<string, unknown> | undefined): z.ZodTypeAny {
  if (!spec) return z.unknown();
  if (Array.isArray(spec.anyOf)) return z.union([z.number(), z.string()]);
  switch (spec.type) {
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.record(z.string(), z.unknown()));
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.string();
  }
}

function shapeFor(entry: CatalogEntry) {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(entry.required);
  if (entry.needsProject) required.add("project_id");
  for (const [key, spec] of Object.entries(entry.properties)) {
    let t = zodForProp(spec as Record<string, unknown>);
    if (!required.has(key)) t = t.optional();
    shape[key] = t;
  }
  return shape;
}

export function createAgentCadMcpServer() {
  const server = new McpServer(
    { name: "agentcad", version: AGENTCAD_MCP_VERSION },
    { capabilities: { tools: { listChanged: false } } },
  );
  const service = getAgentCadService();

  for (const entry of TOOL_CATALOG) {
    const annotations = toolAnnotations(entry);
    server.registerTool(
      entry.name,
      {
        title: entry.name,
        description: entry.description,
        inputSchema: shapeFor(entry),
        annotations,
      },
      async (args) => {
        const result = await service.executeTool(entry.name, (args ?? {}) as Record<string, unknown>, {
          transport: "mcp",
          client: "mcp",
        });
        const text = JSON.stringify(result);
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text" as const, text },
        ];
        if (entry.name === "render_preview" && result.ok) {
          const views = ((result.data as { views?: Array<{ artifact_id: string }> } | undefined)?.views) || [];
          for (const view of views.slice(0, 4)) {
            try {
              const art = service.getArtifactFile(view.artifact_id);
              content.push({ type: "image", data: art.bytes.toString("base64"), mimeType: "image/png" });
            } catch {
              /* metadata-only fallback */
            }
          }
        }
        return {
          content,
          structuredContent: result as unknown as Record<string, unknown>,
          isError: !result.ok,
        };
      },
    );
  }

  return server;
}
