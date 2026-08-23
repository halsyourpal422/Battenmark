import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import type { CadDocument, CadErrorBody, Feature, Operation, Vec3 } from "../types";
import { applyOperation } from "../operations";
import { inspectDocument } from "../inspect";
import { evaluateDocument } from "../evaluate";
import { cadError } from "../errors";
import {
  AGENTCAD_SCHEMA_VERSION,
  AGENTCAD_MCP_VERSION,
  CAD_SERVICE_VERSION,
  WORKING_PACKAGE_NAME,
  argsToOperation,
  getCatalogEntry,
  isPrivilegedTool,
  validateToolArgs,
  assertCompatibleSchema,
} from "../schema";
import { getBackendRegistry, resetBackendRegistry } from "../backend/registry";
import { requiredCapabilitiesFor } from "../backend/capabilities";
import { buildAssemblyAuthoritative, exportAssemblyAuthoritative } from "../kernel/assembly.server";
import { withProjectLock } from "./lock";
import { okResult, failResult, fromToolResult, asServiceError, type ServiceResult } from "./result";
import { serviceLog } from "./log";
import {
  createProjectRecord,
  listProjectSlugs,
  readIdempotency,
  readProject,
  requireProject,
  upsertProjectFromDocument,
  writeIdempotency,
  writeProject,
  hashArgs,
  type CadProject,
} from "./store";
import { getArtifact, requireArtifact, storeArtifact } from "./artifacts";
import { ingestImportSource } from "./ingest";
import { renderDocumentPreview, writePreviewPng } from "../preview/render";
import { revisionFilename, workspacePath } from "../kernel/workspace.server";
import { uid } from "../ids";
import { findBody } from "../document";

export interface ExecuteContext {
  transport?: string;
  client?: string;
  requestId?: string;
  projectId?: string;
  dryRun?: boolean;
  idempotencyKey?: string;
  backend?: string;
}

const FREECAD_EXPORTS = new Set(["export_step", "export_fcstd", "export_3mf", "export_stl"]);

function handles(project: CadProject) {
  return {
    project_id: project.meta.project_id,
    document_id: project.document.id,
    revision_id: project.document.currentRevisionId,
  };
}

function stripServiceArgs(args: Record<string, unknown>) {
  const rest = { ...args };
  delete rest.project_id;
  delete rest.document_id;
  delete rest.dry_run;
  delete rest.idempotency_key;
  delete rest.kernel;
  delete rest.backend;
  delete rest.slug;
  return rest;
}

export class AgentCadService {
  createProject(input: { name: string; slug?: string }): ServiceResult {
    const project = createProjectRecord(input.name, input.slug);
    return okResult("project_create", {
      ...handles(project),
      data: {
        project_id: project.meta.project_id,
        document_id: project.document.id,
        name: project.meta.name,
        slug: project.meta.slug,
      },
    });
  }

  listProjects(): ServiceResult {
    const projects = listProjectSlugs()
      .map((slug) => readProject(slug))
      .filter((p): p is CadProject => Boolean(p))
      .map((p) => ({
        project_id: p.meta.project_id,
        document_id: p.document.id,
        name: p.meta.name,
        slug: p.meta.slug,
        updatedAt: p.meta.updatedAt,
        feature_count: p.document.features.length,
        revision_id: p.document.currentRevisionId,
      }));
    return okResult("project_list", { data: { projects } });
  }

  openProject(projectId: string): ServiceResult {
    const project = requireProject(projectId);
    return okResult("project_open", {
      ...handles(project),
      data: {
        project_id: project.meta.project_id,
        document_id: project.document.id,
        name: project.meta.name,
        slug: project.meta.slug,
        feature_count: project.document.features.length,
        parameters: project.document.parameters.map((p) => p.name),
      },
    });
  }

  inspectProject(projectId: string): ServiceResult {
    const project = requireProject(projectId);
    const evaluation = evaluateDocument(project.document);
    return okResult("project_inspect", {
      ...handles(project),
      data: {
        meta: project.meta,
        document: inspectDocument(project.document, evaluation),
      },
      validation: { valid: evaluation.ok, issues: evaluation.issues },
    });
  }

  getProject(projectId: string): CadProject {
    return requireProject(projectId);
  }

  upsertDocument(doc: CadDocument, hintName?: string): CadProject {
    return upsertProjectFromDocument(doc, hintName);
  }

  async executeTool(
    name: string,
    rawArgs: Record<string, unknown> = {},
    ctx: ExecuteContext = {},
  ): Promise<ServiceResult> {
    const requestId = ctx.requestId || uid("req");
    const t0 = Date.now();
    const finish = (result: ServiceResult) => {
      serviceLog(name, {
        request_id: requestId,
        client: ctx.client,
        transport: ctx.transport,
        project_id: result.project_id,
        document_id: result.document_id,
        revision_id: result.revision_id,
        operation: name,
        duration_ms: Date.now() - t0,
        result: result.ok ? "ok" : "error",
        error_code: result.error?.error,
      });
      return result;
    };

    try {
      if (isPrivilegedTool(name)) {
        return finish(
          failResult(name, {
            error: "PRIVILEGED_DENIED",
            message: `'${name}' is not a public CAD tool.`,
            suggestion: "Use structured CAD operations only.",
          }),
        );
      }

      if ("agentcad_schema_version" in rawArgs) {
        assertCompatibleSchema(rawArgs.agentcad_schema_version);
      }

      const entry = getCatalogEntry(name);
      if (!entry) {
        return finish(
          failResult(name, {
            error: "MALFORMED_REQUEST",
            message: `Unknown operation '${name}'.`,
          }),
        );
      }

      const args = { ...rawArgs };
      const projectId =
        (typeof args.project_id === "string" && args.project_id) ||
        ctx.projectId ||
        (typeof args.slug === "string" ? args.slug : undefined);

      const requestedBackend =
        (typeof args.backend === "string" && args.backend) ||
        (typeof ctx.backend === "string" && ctx.backend) ||
        undefined;
      if (requestedBackend) {
        await this.hydrateRegistry();
        getBackendRegistry().select(requestedBackend, requiredCapabilitiesFor(name, args));
      }

      if (name === "kernel_status") return finish(await this.kernelStatus());
      if (name === "inspect_backend_capabilities") return finish(await this.backendCapabilities());
      if (name === "project_create") {
        return finish(this.createProject({ name: String(args.name ?? "Untitled"), slug: args.slug as string | undefined }));
      }
      if (name === "project_list") return finish(this.listProjects());
      if (name === "project_open") {
        if (!projectId) {
          return finish(failResult(name, { error: "MALFORMED_REQUEST", message: "project_id is required." }));
        }
        return finish(this.openProject(projectId));
      }
      if (name === "get_artifact_metadata") {
        const id = String(args.artifact_id ?? "");
        const art = getArtifact(id);
        if (!art) {
          return finish(failResult(name, { error: "ARTIFACT_NOT_FOUND", message: `Artifact '${id}' was not found.` }));
        }
        return finish(okResult(name, { data: art.meta, project_id: art.meta.project_id }));
      }

      const missing = validateToolArgs(name, args);
      if (missing && missing !== "PRIVILEGED_DENIED") {
        return finish(failResult(name, { error: "MALFORMED_REQUEST", message: missing }));
      }

      if (entry.needsProject && !projectId) {
        return finish(
          failResult(name, {
            error: "MALFORMED_REQUEST",
            message: "project_id is required.",
            suggestion: "Call project_create first and pass the returned project_id.",
          }),
        );
      }

      const dryRun = Boolean(ctx.dryRun || args.dry_run);
      const idempotencyKey =
        ctx.idempotencyKey || (typeof args.idempotency_key === "string" ? args.idempotency_key : undefined);

      return finish(
        await withProjectLock(projectId!, async () => {
          const project = requireProject(projectId!);

          if (idempotencyKey && entry.kind === "mutate") {
            const records = readIdempotency(project.meta.slug);
            const hit = records.find((r) => r.key === idempotencyKey);
            if (hit) {
              if (hit.argsHash !== hashArgs({ name, args: stripServiceArgs(args) })) {
                return failResult(name, {
                  error: "IDEMPOTENCY_CONFLICT",
                  message: "Idempotency-Key was reused with different arguments.",
                });
              }
              return hit.result as ServiceResult;
            }
          }

          if (name === "project_inspect") return this.inspectProject(project.meta.project_id);
          if (name === "batch_operations") {
            return this.executeOperationsUnlocked(
              project,
              Array.isArray(args.operations) ? (args.operations as Array<Record<string, unknown>>) : [],
              { ...ctx, dryRun, projectId: project.meta.project_id },
            );
          }
          if (name === "rebuild") return this.rebuildUnlocked(project);
          if (name === "render_preview") {
            return this.renderPreviewUnlocked(project, {
              view: typeof args.view === "string" ? args.view : undefined,
              width: typeof args.width === "number" ? args.width : undefined,
              height: typeof args.height === "number" ? args.height : undefined,
              assemblyId: typeof args.assembly_id === "string" ? args.assembly_id : undefined,
            });
          }
          if (name === "list_previews") return this.listPreviewsUnlocked(project);
          if (name === "import_step" || name === "import_fcstd" || name === "import_file") {
            return this.importFileUnlocked(project, {
              path: typeof args.path === "string" ? args.path : undefined,
              artifact_id: typeof args.artifact_id === "string" ? args.artifact_id : undefined,
              format:
                name === "import_step" ? "step" : name === "import_fcstd" ? "fcstd" : (args.format as string | undefined),
              name: typeof args.name === "string" ? args.name : undefined,
              body_id: typeof args.body_id === "string" ? args.body_id : undefined,
            });
          }
          if (name === "rebuild_assembly") {
            return finish(
              await this.rebuildAssemblyUnlocked(project, String(args.assembly_id ?? "")),
            );
          }
          if (name === "export_assembly") {
            const fmt = args.format === "step" ? "step" : "fcstd";
            return finish(
              await this.exportAssemblyUnlocked(
                project,
                String(args.assembly_id ?? ""),
                fmt,
              ),
            );
          }
          if (name === "validate") {
            const kernel = args.kernel === "freecad" ? "freecad" : "jscad";
            return this.validateUnlocked(project, kernel);
          }
          if (
            name === "query_geometry" ||
            name === "inspect_faces" ||
            name === "inspect_edges" ||
            name === "resolve_faces" ||
            name === "resolve_edges"
          ) {
            return this.queryGeometryUnlocked(project, name, {
              bodyId: typeof args.body_id === "string" ? args.body_id : undefined,
              entity:
                args.entity === "face" || args.entity === "vertex" || args.entity === "edge"
                  ? args.entity
                  : undefined,
              selector: (args.selector ?? (name.includes("face") ? "planar" : "all_edges")) as never,
              createdBy: typeof args.created_by === "string" ? args.created_by : undefined,
              unique: name.startsWith("resolve"),
            });
          }
          if (FREECAD_EXPORTS.has(name) || name === "export_obj" || name === "export_json") {
            const format = name.replace("export_", "") as "stl" | "obj" | "json" | "step" | "fcstd" | "3mf";
            return this.exportUnlocked(project, format, {
              bodyId: typeof args.body_id === "string" ? args.body_id : undefined,
            });
          }

          const op = argsToOperation(name, args);
          const result = this.applyUnlocked(project, op, dryRun);

          if (idempotencyKey && result.ok && entry.kind === "mutate") {
            const records = readIdempotency(project.meta.slug);
            records.push({
              key: idempotencyKey,
              operation: name,
              argsHash: hashArgs({ name, args: stripServiceArgs(args) }),
              result,
              ts: Date.now(),
            });
            writeIdempotency(project.meta.slug, records);
          }
          return result;
        }),
      );
    } catch (err) {
      return finish(asServiceError(err, name));
    }
  }

  applyUnlocked(project: CadProject, op: Operation, dryRun = false): ServiceResult {
    const applied = applyOperation(project.document, op);
    if (dryRun) {
      const evaluation = evaluateDocument(applied.document);
      const wrapped = fromToolResult(applied.result, handles(project));
      wrapped.dry_run = true;
      wrapped.validation = { valid: evaluation.ok, issues: evaluation.issues };
      wrapped.data = {
        ...(typeof wrapped.data === "object" && wrapped.data ? wrapped.data : {}),
        note: "Dry run: structure was evaluated; the project was not persisted.",
      };
      return wrapped;
    }
    const entry = getCatalogEntry(op.op);
    const mutating = entry ? entry.kind === "mutate" : ![
      "inspect_document",
      "inspect_body",
      "inspect_feature",
      "validate",
      "list_revisions",
      "recompute",
      "export_stl",
      "export_obj",
      "export_json",
      "kernel_status",
      "inspect_backend_capabilities",
    ].includes(op.op);
    if (applied.result.ok && mutating) {
      project.document = applied.document;
      writeProject(project);
    }
    return fromToolResult(applied.result, handles(project));
  }

  async executeOperation(projectId: string, op: Operation, ctx: ExecuteContext = {}): Promise<ServiceResult> {
    return withProjectLock(projectId, async () => {
      const project = requireProject(projectId);
      return this.applyUnlocked(project, op, Boolean(ctx.dryRun));
    });
  }

  async executeOperationsUnlocked(
    project: CadProject,
    ops: Array<Record<string, unknown> | Operation>,
    ctx: ExecuteContext = {},
  ): Promise<ServiceResult> {
    const checkpoint = applyOperation(project.document, { op: "save_revision", label: "batch-start" });
    if (!ctx.dryRun) {
      project.document = checkpoint.document;
      writeProject(project);
    }
    const results: ServiceResult[] = [];
    if (ctx.dryRun) {
      let current = project.document;
      for (const raw of ops) {
        const rec = raw as Record<string, unknown>;
        const name = String(rec.op ?? rec.operation ?? "");
        const applied = applyOperation(current, argsToOperation(name, rec));
        current = applied.document;
        const step = fromToolResult(applied.result, handles(project));
        step.dry_run = true;
        results.push(step);
        if (!applied.result.ok) break;
      }
      return okResult("batch_operations", {
        ...handles(project),
        dry_run: true,
        data: { results, note: "Dry run: batch was not persisted." },
      });
    }
    for (const raw of ops) {
      const rec = raw as Record<string, unknown>;
      const name = String(rec.op ?? rec.operation ?? "");
      const latest = requireProject(project.meta.project_id);
      const op = argsToOperation(name, rec);
      const step = this.applyUnlocked(latest, op, false);
      results.push(step);
      if (!step.ok) {
        const rolled = applyOperation(requireProject(project.meta.project_id).document, {
          op: "rollback_revision",
          revision_id: checkpoint.document.currentRevisionId || "",
        });
        const after = requireProject(project.meta.project_id);
        after.document = rolled.document;
        writeProject(after);
        return failResult("batch_operations", step.error ?? { error: "INVALID_REFERENCE", message: "batch failed" }, {
          ...handles(after),
          data: { results, rolled_back: true },
        });
      }
    }
    const latest = requireProject(project.meta.project_id);
    return okResult("batch_operations", {
      ...handles(latest),
      data: { results, count: results.length },
    });
  }

  async executeOperations(
    projectId: string,
    ops: Array<Record<string, unknown> | Operation>,
    ctx: ExecuteContext = {},
  ): Promise<ServiceResult> {
    return withProjectLock(projectId, async () => {
      const project = requireProject(projectId);
      return this.executeOperationsUnlocked(project, ops, ctx);
    });
  }

  inspectDocument(projectId: string): ServiceResult {
    const project = requireProject(projectId);
    const evaluation = evaluateDocument(project.document);
    return okResult("inspect_document", {
      ...handles(project),
      data: inspectDocument(project.document, evaluation),
      validation: { valid: evaluation.ok, issues: evaluation.issues },
    });
  }

  async validateUnlocked(project: CadProject, kernel: "jscad" | "freecad" = "jscad"): Promise<ServiceResult> {
    if (kernel === "freecad") {
      try {
        const { freeCadKernel } = await import("../kernel/freecad.server");
        const v = await freeCadKernel.validate(project.document);
        return okResult("validate", {
          ...handles(project),
          data: v,
          validation: { valid: v.valid, issues: v.issues },
        });
      } catch (err) {
        return asServiceError(err, "validate");
      }
    }
    const evaluation = evaluateDocument(project.document);
    const payload = {
      ok: evaluation.ok,
      valid: evaluation.ok,
      issues: evaluation.issues,
      volume_mm3: evaluation.volumeMm3,
      solid_count: evaluation.bodies.filter((b) => b.visible && !b.consumed).length,
      bodies: evaluation.bodies.map((b) => ({
        id: b.bodyId,
        name: b.name,
        valid: b.valid,
        volume_mm3: b.volumeMm3,
        bbox: b.bbox,
      })),
    };
    if (!evaluation.ok) {
      const first = evaluation.issues.find((i) => i.severity === "error");
      return failResult("validate", {
        error: (first?.code as CadErrorBody["error"]) || "INVALID_SOLID",
        message: first?.message ?? "Validation failed.",
        suggestion: first?.suggestion,
        feature: first?.featureId,
        body: first?.bodyId,
      }, {
        ...handles(project),
        data: payload,
        validation: { valid: false, issues: evaluation.issues },
      });
    }
    return okResult("validate", {
      ...handles(project),
      data: payload,
      validation: { valid: true, issues: evaluation.issues },
    });
  }

  async validateDocument(projectId: string, kernel: "jscad" | "freecad" = "jscad"): Promise<ServiceResult> {
    return withProjectLock(projectId, async () => this.validateUnlocked(requireProject(projectId), kernel));
  }

  async queryGeometryUnlocked(
    project: CadProject,
    operation: string,
    opts: {
      bodyId?: string;
      entity?: "edge" | "face" | "vertex";
      selector?: unknown;
      createdBy?: string;
      unique?: boolean;
    },
  ): Promise<ServiceResult> {
    const entity = opts.entity ?? (operation.includes("face") ? "face" : "edge");
    try {
      const { queryGeometry } = await import("../kernel/freecad.server");
      const data = await queryGeometry(project.document, {
        bodyId: opts.bodyId,
        entity,
        selector: opts.selector as never,
        createdBy: opts.createdBy,
      });
      if (opts.unique && data.match_count !== 1) {
        const code = data.match_count === 0 ? "GEOMETRY_SELECTOR_NO_MATCH" : "GEOMETRY_SELECTOR_MULTIPLE_MATCHES";
        return failResult(operation, {
          error: code,
          message:
            data.match_count === 0
              ? "Selector resolved to no geometry."
              : `Selector resolved to ${data.match_count} entities but the operation requires 1.`,
          match_count: data.match_count,
        }, { ...handles(project), data });
      }
      return okResult(operation, { ...handles(project), data });
    } catch (err) {
      const fallback = applyOperation(project.document, {
        op: operation as "query_geometry",
        body_id: opts.bodyId,
        entity,
        selector: opts.selector as never,
        created_by: opts.createdBy,
      } as Operation);
      if (fallback.result.ok) {
        const data = fallback.result.data as { note?: string };
        if (data && typeof data === "object") {
          (data as { note?: string }).note =
            `${(data as { note?: string }).note ?? "JSCAD envelope query"} FreeCAD query failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        return fromToolResult(fallback.result, handles(project));
      }
      return asServiceError(err, operation);
    }
  }

  async rebuildUnlocked(project: CadProject): Promise<ServiceResult> {
    try {
      const { freeCadKernel } = await import("../kernel/freecad.server");
      const inspected = await freeCadKernel.inspect(project.document);
      project.meta.kernel = "freecad";
      const revId = project.document.currentRevisionId;
      if (revId) {
        try {
          const src = workspacePath(project.meta.slug, "source", `${project.meta.slug}.FCStd`);
          const snap = workspacePath(
            project.meta.slug,
            "revisions",
            revisionFilename(project.document.revisions.length),
          );
          if (existsSync(src)) copyFileSync(src, snap);
        } catch {
          /* best-effort snapshot */
        }
      }
      writeProject(project);
      return okResult("rebuild", {
        ...handles(project),
        data: {
          valid: inspected.valid,
          shape_type: inspected.shape_type,
          volume_mm3: inspected.volume_mm3,
          surface_area_mm2: inspected.surface_area_mm2,
          solid_count: inspected.solid_count,
          bounding_box: inspected.bounding_box,
          issues: inspected.issues,
        },
        validation: { valid: inspected.valid, issues: inspected.issues },
      });
    } catch (err) {
      return asServiceError(err, "rebuild");
    }
  }

  async rebuild(projectId: string): Promise<ServiceResult> {
    return withProjectLock(projectId, async () => this.rebuildUnlocked(requireProject(projectId)));
  }

  async exportUnlocked(
    project: CadProject,
    format: "stl" | "obj" | "json" | "step" | "fcstd" | "3mf",
    opts: { bodyId?: string } = {},
  ): Promise<ServiceResult> {
    try {
      if (format === "json" || format === "obj") {
        const applied = applyOperation(project.document, {
          op: format === "json" ? "export_json" : "export_obj",
          body_id: opts.bodyId,
        } as Operation);
        const data = applied.result.data as { ascii?: string; format?: string; document?: unknown } | undefined;
        const payload =
          format === "json"
            ? JSON.stringify(data?.document ?? { name: project.document.name }, null, 2)
            : (data?.ascii ?? "");
        const filename = `${project.meta.slug}.${format === "json" ? "json" : "obj"}`;
        const meta = storeArtifact({
          slug: project.meta.slug,
          projectId: project.meta.project_id,
          format,
          filename,
          bytes: payload,
          revisionId: project.document.currentRevisionId,
        });
        return okResult(`export_${format}`, {
          ...handles(project),
          data: { ...meta, ok: true },
        });
      }

      const { freeCadKernel } = await import("../kernel/freecad.server");
      const { CadWorkerError } = await import("../kernel/client.server");
      try {
        const exported = await freeCadKernel.exportModel(project.document, {
          format,
          bodyId: opts.bodyId,
          projectSlug: project.meta.slug,
          revisionId: project.document.currentRevisionId ?? undefined,
        });
        const buf = exported.base64
          ? Buffer.from(exported.base64, "base64")
          : existsSync(exported.path)
            ? readFileSync(exported.path)
            : Buffer.from(exported.text ?? "");
        const meta = storeArtifact({
          slug: project.meta.slug,
          projectId: project.meta.project_id,
          format: exported.format,
          filename: exported.filename,
          bytes: buf,
          revisionId: project.document.currentRevisionId,
        });
        project.meta.kernel = "freecad";
        writeProject(project);
        return okResult(`export_${format}`, {
          ...handles(project),
          data: {
            ok: true,
            format: meta.format,
            artifact_id: meta.artifact_id,
            filename: meta.filename,
            bytes: meta.bytes,
            revision_id: meta.revision_id,
            validation: exported.validation ?? null,
          },
        });
      } catch (err) {
        if (format === "stl") {
          const applied = applyOperation(project.document, { op: "export_stl", body_id: opts.bodyId });
          if (!applied.result.ok) return fromToolResult(applied.result, handles(project));
          const ascii = (applied.result.data as { ascii?: string })?.ascii ?? "";
          const meta = storeArtifact({
            slug: project.meta.slug,
            projectId: project.meta.project_id,
            format: "stl",
            filename: `${project.meta.slug}.stl`,
            bytes: ascii,
            revisionId: project.document.currentRevisionId,
          });
          return okResult("export_stl", {
            ...handles(project),
            data: { ...meta, note: "JSCAD preview mesh. FreeCAD STL unavailable.", kernel: "jscad" },
            warnings: [err instanceof Error ? err.message : String(err)],
          });
        }
        if (err instanceof CadWorkerError) {
          return failResult(`export_${format}`, { error: err.code as never, message: err.message });
        }
        throw err;
      }
    } catch (err) {
      return asServiceError(err, `export_${format}`);
    }
  }

  async exportArtifact(
    projectId: string,
    format: "stl" | "obj" | "json" | "step" | "fcstd" | "3mf",
    opts: { bodyId?: string } = {},
  ): Promise<ServiceResult> {
    return withProjectLock(projectId, async () => this.exportUnlocked(requireProject(projectId), format, opts));
  }

  async hydrateRegistry(): Promise<void> {
    const registry = getBackendRegistry();
    const fc = registry.get("freecad");
    if (fc && fc.discovery_mode === undefined) {
      try {
        const { discoverFreeCad } = await import("../kernel/discover.server");
        const disc = discoverFreeCad();
        registry.update("freecad", {
          available: disc.available,
          version: disc.version,
          executable: disc.executable,
          platform: disc.platform,
          arch: disc.arch,
          discovery_mode: disc.mode,
          detail: disc.detail,
        });
      } catch (err) {
        registry.update("freecad", {
          available: false,
          detail: err instanceof Error ? err.message : String(err),
          discovery_mode: "missing",
        });
      }
    }
    const js = registry.get("jscad");
    if (js && js.available === false) {
      js.available = true;
    }
  }

  async rebuildAssemblyUnlocked(project: CadProject, assemblyId: string): Promise<ServiceResult> {
    const inspection = await buildAssemblyAuthoritative(project.document, assemblyId);
    return okResult("rebuild_assembly", { ...handles(project), data: inspection });
  }

  async exportAssemblyUnlocked(project: CadProject, assemblyId: string, format: "fcstd" | "step"): Promise<ServiceResult> {
    const exported = await exportAssemblyAuthoritative(project.document, assemblyId, format);
    const data = exported as Record<string, unknown>;
    const inner = (data["result"] ?? data) as Record<string, unknown>;
    return okResult("export_assembly", {
      ...handles(project),
      data: {
        format: inner["format"],
        path: inner["path"],
        bytes: inner["bytes"],
        objects: inner["objects"],
        inspection: inner["inspection"],
        note:
          format === "step"
            ? "Placed solids with instance labels; structured product hierarchy depends on OCC XCAF behaviour."
            : "Native App::Part hierarchy with per-instance placements.",
      },
      project_id: project.meta.project_id,
    });
  }

  async kernelStatus(): Promise<ServiceResult> {
    const { jscadKernel } = await import("../kernel/jscad");
    const preview = await jscadKernel.available();
    let authoritative;
    let workerPid: number | null = null;
    let platform: string | undefined;
    let arch: string | undefined;
    let discoveryMode: string | undefined;
    let executable: string | null | undefined;
    try {
      const { discoverFreeCad } = await import("../kernel/discover.server");
      const disc = discoverFreeCad();
      platform = disc.platform;
      arch = disc.arch;
      discoveryMode = disc.mode;
      executable = disc.executable;
      const { freeCadKernel } = await import("../kernel/freecad.server");
      const { getFreeCadWorker } = await import("../kernel/client.server");
      authoritative = await freeCadKernel.available();
      workerPid = getFreeCadWorker().getPid();
      if (!authoritative.executable) authoritative.executable = disc.executable ?? undefined;
    } catch (err) {
      authoritative = {
        id: "freecad",
        name: "FreeCAD / OpenCascade",
        available: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    const registry = getBackendRegistry();
    try {
      registry.update("jscad", {
        available: preview.available,
        version: preview.version ?? "2",
        detail: preview.detail,
      });
    } catch {
      /* jscad always registered in production registry */
    }
    try {
      registry.update("freecad", {
        available: Boolean(authoritative.available),
        version: authoritative.version ?? null,
        executable: authoritative.executable ?? executable ?? null,
        platform,
        arch,
        discovery_mode: discoveryMode,
        detail: authoritative.detail,
      });
    } catch {
      /* registry may have been replaced in tests without freecad */
    }
    const capabilities = registry.report();
    return okResult("kernel_status", {
      data: {
        preview,
        authoritative,
        worker_pid: workerPid,
        agentcad_schema_version: AGENTCAD_SCHEMA_VERSION,
        mcp_version: AGENTCAD_MCP_VERSION,
        service_version: CAD_SERVICE_VERSION,
        working_package: WORKING_PACKAGE_NAME,
        default_backend: capabilities.default_backend,
        capabilities,
      },
    });
  }

  async backendCapabilities(): Promise<ServiceResult> {
    const status = await this.kernelStatus();
    const data = (status.data || {}) as { capabilities?: unknown };
    return okResult("inspect_backend_capabilities", { data: data.capabilities });
  }

  renderPreviewUnlocked(
    project: CadProject,
    opts: { view?: string; width?: number; height?: number; assemblyId?: string } = {},
  ): ServiceResult {
    try {
      const rendered = renderDocumentPreview(project.document, opts.view ?? "isometric", {
        width: opts.width,
        height: opts.height,
      }, { assemblyId: opts.assemblyId });
      const views = rendered.map((item) => {
        const filename = `${item.view}.png`;
        const previewPath = workspacePath(project.meta.slug, "previews", filename);
        writePreviewPng(previewPath, item.png);
        const meta = storeArtifact({
          slug: project.meta.slug,
          projectId: project.meta.project_id,
          format: "png",
          filename: `${project.meta.slug}-${filename}`,
          bytes: item.png,
          revisionId: project.document.currentRevisionId,
        });
        return {
          view: item.view,
          artifact_id: meta.artifact_id,
          filename: meta.filename,
          bytes: item.bytes,
          width: item.width,
          height: item.height,
          triangle_count: item.triangleCount,
          media_type: "image/png",
        };
      });
      return okResult("render_preview", {
        ...handles(project),
        data: {
          views,
          primary: views[0],
        },
      });
    } catch (err) {
      return asServiceError(err, "render_preview");
    }
  }

  async renderPreview(projectId: string, opts: { view?: string; width?: number; height?: number } = {}) {
    return withProjectLock(projectId, async () => this.renderPreviewUnlocked(requireProject(projectId), opts));
  }

  listPreviewsUnlocked(project: CadProject): ServiceResult {
    const dir = workspacePath(project.meta.slug, "previews");
    const files = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".png"))
      : [];
    return okResult("list_previews", {
      ...handles(project),
      data: {
        files: files.map((filename) => ({ filename, view: filename.replace(/\.png$/, "") })),
      },
    });
  }

  async importFileUnlocked(
    project: CadProject,
    args: { path?: string; artifact_id?: string; format?: string; name?: string; body_id?: string },
  ): Promise<ServiceResult> {
    try {
      const ingested = ingestImportSource(project.meta.slug, args);
      const { getFreeCadWorker } = await import("../kernel/client.server");
      const worker = getFreeCadWorker();
      const res = await worker.request("import", { path: ingested.absPath, format: ingested.format, arguments: { path: ingested.absPath, format: ingested.format } }, 90_000);
      if (!res.ok) {
        return failResult("import_file", {
          error: (res.error?.code as CadErrorBody["error"]) || "IMPORT_FAILED",
          message: res.error?.message ?? "Import failed.",
        });
      }
      const payload = (res.result || {}) as {
        inspect?: {
          volume_mm3?: number;
          solid_count?: number;
          bounding_box?: { min: Vec3; max: Vec3 };
          valid?: boolean;
          tessellation?: number[];
          source_format?: string;
          issues?: { severity: string; code: string; message: string }[];
        };
      };
      const inspected = payload.inspect || (res.result as typeof payload.inspect) || {};
      const bbox = inspected.bounding_box ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
      let bodyId = args.body_id && findBody(project.document, args.body_id)?.id;
      if (!bodyId) {
        const bodyOp = applyOperation(project.document, {
          op: "create_body",
          name: args.name || ingested.filename.replace(/\.[^.]+$/, "") || "Imported",
        });
        project.document = bodyOp.document;
        bodyId = (bodyOp.result.data as { id?: string })?.id as string;
      }
      const feature: Feature = {
        kind: "imported_solid",
        id: uid("feat"),
        name: args.name || ingested.filename.replace(/\.[^.]+$/, "") || "Imported",
        bodyId,
        suppressed: false,
        sourceFormat: ingested.format,
        sourceName: ingested.filename,
        sourcePath: ingested.absPath,
        volumeMm3: inspected.volume_mm3 ?? 0,
        bbox,
        solidCount: inspected.solid_count ?? 1,
        parametric: false,
        tessellation: Array.isArray(inspected.tessellation) ? inspected.tessellation : undefined,
      };
      project.document.features.push(feature);
      writeProject(project);
      return okResult(args.format === "fcstd" ? "import_fcstd" : ingested.format === "step" ? "import_step" : "import_file", {
        ...handles(project),
        feature_id: feature.id,
        data: {
          body_id: bodyId,
          feature_id: feature.id,
          source_format: ingested.format,
          source_name: ingested.filename,
          volume_mm3: feature.volumeMm3,
          solid_count: feature.solidCount,
          bounding_box: bbox,
          valid: inspected.valid ?? true,
          parametric: false,
          issues: inspected.issues ?? [],
        },
        warnings: ["Imported geometry is B-rep, not a parametric AgentCAD feature tree."],
      });
    } catch (err) {
      return asServiceError(err, "import_file");
    }
  }

  getArtifactFile(artifactId: string) {
    return requireArtifact(artifactId);
  }
}

let singleton: AgentCadService | null = null;

export function getAgentCadService(): AgentCadService {
  if (!singleton) singleton = new AgentCadService();
  return singleton;
}

export function resetAgentCadService() {
  resetBackendRegistry();
  singleton = new AgentCadService();
  return singleton;
}

export { cadError };
