import { getAgentCadService } from "./agentcad";
import { authorizeRequest, corsHeaders } from "./auth";
import type { CadPermission } from "./config";
import { httpStatusFor, type ServiceResult } from "./result";
import { openApiDocument } from "./openapi";
import { uid } from "../ids";
import { AGENTCAD_SCHEMA_VERSION, assertCompatibleSchema } from "../schema";

function json(result: ServiceResult, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(result), {
    status: httpStatusFor(result),
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function authFor(request: Request, needed: CadPermission, headers: Record<string, string>) {
  const auth = authorizeRequest(request, needed);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({
          ok: false,
          operation: "auth",
          agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
          error: { error: auth.code, message: auth.message },
        }),
        { status: auth.code === "AUTH_REQUIRED" ? 401 : 403, headers: { "content-type": "application/json", ...headers } },
      ),
    };
  }
  return { ok: true as const, auth };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "agentcad_schema_version" in parsed) {
      assertCompatibleSchema(parsed.agentcad_schema_version);
    }
    return parsed;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "SCHEMA_MISMATCH") {
      throw err;
    }
    throw Object.assign(new Error("Malformed JSON body."), { code: "MALFORMED_REQUEST" });
  }
}

export async function handleAgentCadHttp(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url);
  let path = url.pathname;
  const idx = path.indexOf("/api/v1");
  if (idx >= 0) path = path.slice(idx + "/api/v1".length) || "/";
  if (!path.startsWith("/")) path = `/${path}`;

  const service = getAgentCadService();
  const requestId = request.headers.get("x-request-id") || uid("req");
  const idempotencyKey = request.headers.get("idempotency-key") || undefined;
  const ctx = { transport: "http" as const, client: "http", requestId, idempotencyKey };

  try {
    if (request.method === "GET" && (path === "/status" || path === "/health" || path === "/")) {
      const result = await service.kernelStatus();
      return json(result, headers);
    }
    if (request.method === "GET" && (path === "/capabilities" || path === "/backend")) {
      const result = await service.executeTool("inspect_backend_capabilities", {}, ctx);
      return json(result, headers);
    }
    if (request.method === "GET" && (path === "/openapi.json" || path === "/openapi")) {
      return new Response(JSON.stringify(openApiDocument()), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", ...headers },
      });
    }

    if (request.method === "GET" && path === "/projects") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(service.listProjects(), headers);
    }

    if (request.method === "POST" && path === "/projects") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      return json(service.createProject({ name: String(body.name ?? "Untitled"), slug: body.slug as string | undefined }), headers);
    }

    const artifactMatch = path.match(/^\/artifacts\/([^/]+)$/);
    if (artifactMatch && request.method === "GET") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      const download = url.searchParams.get("download") !== "meta";
      const art = service.getArtifactFile(decodeURIComponent(artifactMatch[1]!));
      if (!download) return json({ ok: true, operation: "get_artifact_metadata", agentcad_schema_version: AGENTCAD_SCHEMA_VERSION, data: art.meta }, headers);
      return new Response(new Uint8Array(art.bytes), {
        status: 200,
        headers: {
          ...headers,
          "content-type": art.meta.media_type,
          "content-disposition": `attachment; filename="${art.meta.filename}"`,
          "content-length": String(art.bytes.length),
        },
      });
    }

    const proj = path.match(/^\/projects\/([^/]+)(?:\/(.*))?$/);
    if (!proj) {
      return new Response(
        JSON.stringify({
          ok: false,
          operation: "http",
          agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
          error: { error: "MALFORMED_REQUEST", message: `Unknown path ${path}` },
        }),
        { status: 404, headers: { "content-type": "application/json", ...headers } },
      );
    }
    const projectId = decodeURIComponent(proj[1]!);
    const rest = proj[2] || "";

    if (request.method === "GET" && rest === "") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(service.openProject(projectId), headers);
    }
    if (request.method === "GET" && rest === "document") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(service.inspectDocument(projectId), headers);
    }
    if (request.method === "GET" && rest === "revisions") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(await service.executeTool("list_revisions", { project_id: projectId }, ctx), headers);
    }
    if (request.method === "POST" && rest === "revisions") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      return json(await service.executeTool("save_revision", { project_id: projectId, label: body.label }, ctx), headers);
    }
    if (request.method === "POST" && rest === "rollback") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      return json(
        await service.executeTool("rollback_revision", { project_id: projectId, revision_id: body.revision_id ?? body.revision }, ctx),
        headers,
      );
    }
    if (request.method === "POST" && rest === "operations") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      const operation = String(body.operation ?? body.op ?? "");
      const args = (body.arguments as Record<string, unknown>) || { ...body };
      delete args.operation;
      delete args.op;
      delete args.arguments;
      if (typeof body.backend === "string") args.backend = body.backend;
      return json(
        await service.executeTool(operation, { ...args, project_id: projectId, dry_run: body.dry_run }, { ...ctx, dryRun: Boolean(body.dry_run) }),
        headers,
      );
    }
    if (request.method === "POST" && rest === "batch") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      const operations = (body.operations as Array<Record<string, unknown>>) || [];
      return json(await service.executeOperations(projectId, operations, { ...ctx, dryRun: Boolean(body.dry_run) }), headers);
    }
    if (request.method === "POST" && rest === "rebuild") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(await service.rebuild(projectId), headers);
    }
    if (request.method === "POST" && rest === "validate") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      const body = (await readJson(request).catch(() => ({}))) as Record<string, unknown>;
      const kernel = body.kernel === "freecad" ? "freecad" : "jscad";
      return json(await service.validateDocument(projectId, kernel), headers);
    }
    if (request.method === "POST" && rest === "exports") {
      const a = authFor(request, "cad:export", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      const format = String(body.format ?? "step") as "stl" | "obj" | "json" | "step" | "fcstd" | "3mf";
      return json(await service.exportArtifact(projectId, format, { bodyId: body.body_id as string | undefined }), headers);
    }
    if (request.method === "POST" && rest === "preview") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      const body = (await readJson(request).catch(() => ({}))) as Record<string, unknown>;
      return json(
        await service.renderPreview(projectId, {
          view: typeof body.view === "string" ? body.view : undefined,
          width: typeof body.width === "number" ? body.width : undefined,
          height: typeof body.height === "number" ? body.height : undefined,
        }),
        headers,
      );
    }
    if (request.method === "GET" && rest === "previews") {
      const a = authFor(request, "cad:read", headers);
      if (!a.ok) return a.response;
      return json(await service.executeTool("list_previews", { project_id: projectId }, ctx), headers);
    }
    if (request.method === "POST" && rest === "import") {
      const a = authFor(request, "cad:write", headers);
      if (!a.ok) return a.response;
      const body = await readJson(request);
      return json(
        await service.executeTool("import_file", { project_id: projectId, ...body }, ctx),
        headers,
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        operation: "http",
        agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
        error: { error: "MALFORMED_REQUEST", message: `Unknown path ${path}` },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      },
    );
  } catch (err) {
    const body =
      err && typeof err === "object" && "body" in err
        ? (err as { body: { error: string; message: string } }).body
        : null;
    const code =
      body?.error ||
      (err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "MALFORMED_REQUEST");
    const message = err instanceof Error ? err.message : String(err);
    const status = code === "PROJECT_NOT_FOUND" ? 404 : code === "SCHEMA_MISMATCH" ? 409 : 400;
    return new Response(
      JSON.stringify({
        ok: false,
        operation: "http",
        agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
        error: body ?? { error: code, message },
      }),
      { status, headers: { "content-type": "application/json", ...headers } },
    );
  }
}
