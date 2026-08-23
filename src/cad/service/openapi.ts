import { AGENTCAD_SCHEMA_VERSION, TOOL_CATALOG } from "../schema";

export function openApiDocument() {
  const opSchema = {
    type: "object",
    required: ["operation"],
    properties: {
      operation: { type: "string", description: "Canonical AgentCAD tool name" },
      arguments: { type: "object", additionalProperties: true },
      dry_run: { type: "boolean" },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "AgentCAD HTTP API",
      version: String(AGENTCAD_SCHEMA_VERSION),
      description:
        "Transport-neutral CAD service. Same operations as MCP and the CLI. Authoritative geometry is FreeCAD/OpenCascade; JSCAD is the preview kernel.",
    },
    servers: [{ url: "/api/v1", description: "Versioned AgentCAD API" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "AGENTCAD_API_TOKEN. Loopback developer mode may omit the token.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [false] },
            operation: { type: "string" },
            error: {
              type: "object",
              properties: {
                error: { type: "string" },
                message: { type: "string" },
                suggestion: { type: "string" },
              },
            },
          },
        },
        ServiceResult: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            operation: { type: "string" },
            agentcad_schema_version: { type: "integer" },
            project_id: { type: "string" },
            document_id: { type: "string" },
            revision_id: { type: "string" },
            feature_id: { type: "string" },
            data: { type: "object" },
          },
        },
        OperationRequest: opSchema,
        Tools: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
          },
          example: TOOL_CATALOG.map((t) => t.name),
        },
      },
    },
    paths: {
      "/status": {
        get: {
          summary: "Kernel and service status",
          security: [],
          responses: { "200": { description: "Status" } },
        },
      },
      "/capabilities": {
        get: {
          summary: "Backend capability report (machine-readable)",
          security: [],
          responses: { "200": { description: "Capabilities" } },
        },
      },
      "/projects": {
        get: { summary: "List projects", responses: { "200": { description: "Project list" } } },
        post: {
          summary: "Create a project",
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } },
          },
          responses: { "200": { description: "Created" } },
        },
      },
      "/projects/{project_id}": {
        get: { summary: "Open / inspect a project", responses: { "200": { description: "Project" } } },
      },
      "/projects/{project_id}/document": {
        get: { summary: "Inspect the canonical document", responses: { "200": { description: "Document" } } },
      },
      "/projects/{project_id}/operations": {
        post: {
          summary: "Execute one structured CAD operation",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/OperationRequest" } } } },
          responses: { "200": { description: "Result" } },
        },
      },
      "/projects/{project_id}/batch": {
        post: { summary: "Execute a checkpointed batch of operations", responses: { "200": { description: "Batch result" } } },
      },
      "/projects/{project_id}/rebuild": {
        post: { summary: "FreeCAD rebuild", responses: { "200": { description: "Inspect result" } } },
      },
      "/projects/{project_id}/validate": {
        post: { summary: "Validate (JSCAD or FreeCAD)", responses: { "200": { description: "Validation" } } },
      },
      "/projects/{project_id}/revisions": {
        get: { summary: "List revisions", responses: { "200": { description: "Revisions" } } },
        post: { summary: "Save a revision", responses: { "200": { description: "Revision" } } },
      },
      "/projects/{project_id}/rollback": {
        post: { summary: "Rollback to a revision", responses: { "200": { description: "Rolled back" } } },
      },
      "/projects/{project_id}/exports": {
        post: {
          summary: "Export FCStd / STEP / STL / 3MF / OBJ / JSON. Returns artifact metadata.",
          responses: { "200": { description: "Artifact metadata" } },
        },
      },
      "/projects/{project_id}/preview": {
        post: {
          summary: "Render isometric / orthographic PNG previews. Returns artifact metadata.",
          responses: { "200": { description: "Preview artifacts" } },
        },
      },
      "/projects/{project_id}/previews": {
        get: { summary: "List written preview files", responses: { "200": { description: "Preview list" } } },
      },
      "/projects/{project_id}/import": {
        post: {
          summary: "Import STEP / FCStd / mesh from a workspace path. Not parametric.",
          responses: { "200": { description: "Imported solid" } },
        },
      },
      "/artifacts/{artifact_id}": {
        get: { summary: "Download an artifact", responses: { "200": { description: "File bytes" } } },
      },
    },
  };
}
