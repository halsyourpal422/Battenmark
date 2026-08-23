import { parseCli } from "../cli";
import { getAgentCadService } from "../service/agentcad";
import { loadConfig } from "../service/config";
import type { ServiceResult } from "../service/result";
import { createServer } from "node:http";
import { handleAgentCadHttp } from "../service/http";
import { handleMcpFetch } from "../mcp/http";

function flagMap(tokens: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = tokens[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function positional(tokens: string[], flags: Record<string, string | boolean>) {
  const consumed = new Set(Object.values(flags).filter((v) => typeof v === "string") as string[]);
  return tokens.filter((t) => !t.startsWith("--") && !consumed.has(t));
}

function printResult(result: ServiceResult, asJson: boolean) {
  if (asJson) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else if (result.ok) {
    process.stdout.write(JSON.stringify(result.data ?? { ok: true }, null, 2) + "\n");
  } else {
    process.stderr.write(`${result.error?.error ?? "ERROR"}: ${result.error?.message ?? "failed"}\n`);
  }
  return result.ok ? 0 : 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const tokens = argv.filter((a) => a !== "--json");
  const flags = flagMap(tokens);
  const pos = positional(tokens, flags);
  const cmd = (pos[0] ?? "help").toLowerCase();
  const service = getAgentCadService();
  const project =
    (typeof flags.project === "string" && flags.project) ||
    (typeof flags.project_id === "string" && flags.project_id) ||
    undefined;
  const backendFlag = typeof flags.backend === "string" ? flags.backend : undefined;

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    process.stdout.write(`AgentCAD CLI

Usage:
  agentcad status [--json]
  agentcad capabilities [--json]
  agentcad project create <name> [--json]
  agentcad project list [--json]
  agentcad project inspect <id> [--json]
  agentcad box --project <id> --length 80 --width 50 --height 12 [--backend freecad] [--json]
  agentcad param set --project <id> <name> <value> [--json]
  agentcad rebuild --project <id> [--json]
  agentcad validate --project <id> [--kernel freecad] [--json]
  agentcad inspect --project <id> [--json]
  agentcad export --project <id> --format step [--json]
  agentcad preview --project <id> [--view isometric|front|top|right|all] [--json]
  agentcad import --project <id> --file <path> [--json]
  agentcad revisions --project <id> [--json]
  agentcad rollback --project <id> <revision_id> [--json]
  agentcad query --project <id> --entity edge --selector top_perimeter [--json]
  agentcad deps --project <id> --name wall [--json]
  agentcad serve [--host 127.0.0.1] [--port 8787]

All mutating geometry commands require --project. Diagnostics go to stderr; JSON to stdout.
`);
    process.exit(0);
  }

  if (cmd === "mcp") {
    await import("../mcp/stdio");
    return;
  }

  if (cmd === "serve") {
    const config = loadConfig();
    const host = (typeof flags.host === "string" && flags.host) || config.host;
    const port = Number(flags.port || config.port);
    if (host === "0.0.0.0" && process.env.AGENTCAD_BIND !== "0.0.0.0") {
      process.stderr.write("Refusing to bind 0.0.0.0. Set AGENTCAD_BIND=0.0.0.0 to expose the CAD API.\n");
      process.exit(2);
    }
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const url = `http://${req.headers.host || `${host}:${port}`}${req.url || "/"}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
        else headers.set(k, v);
      }
      const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : Buffer.concat(chunks) });
      const path = new URL(url).pathname;
      const response = path === "/mcp" || path.startsWith("/mcp/") ? await handleMcpFetch(request) : await handleAgentCadHttp(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    });
    server.listen(port, host, () => {
      process.stderr.write(`AgentCAD HTTP+MCP listening on ${host}:${port}\n`);
    });
    return;
  }

  if (cmd === "status") {
    process.exit(printResult(await service.kernelStatus(), asJson));
  }

  if (cmd === "capabilities" || cmd === "caps") {
    process.exit(printResult(await service.executeTool("inspect_backend_capabilities", {}, { transport: "cli" }), asJson));
  }

  if (cmd === "project") {
    const sub = (pos[1] ?? "list").toLowerCase();
    if (sub === "create") {
      const name = pos[2] || (typeof flags.name === "string" ? flags.name : "Untitled");
      process.exit(printResult(service.createProject({ name, slug: typeof flags.slug === "string" ? flags.slug : undefined }), asJson));
    }
    if (sub === "list") {
      process.exit(printResult(service.listProjects(), asJson));
    }
    if (sub === "inspect" || sub === "open") {
      const id = pos[2] || project;
      if (!id) {
        process.stderr.write("project id required\n");
        process.exit(2);
      }
      process.exit(printResult(sub === "open" ? service.openProject(id) : service.inspectProject(id), asJson));
    }
    process.stderr.write(`Unknown project subcommand '${sub}'\n`);
    process.exit(2);
  }

  const needProject = () => {
    if (!project) {
      process.stderr.write("Missing --project <project_id>\n");
      process.exit(2);
    }
    return project;
  };

  if (cmd === "inspect") {
    process.exit(printResult(service.inspectDocument(needProject()), asJson));
  }
  if (cmd === "validate") {
    const kernel = flags.kernel === "freecad" ? "freecad" : "jscad";
    process.exit(printResult(await service.validateDocument(needProject(), kernel), asJson));
  }
  if (cmd === "rebuild") {
    process.exit(printResult(await service.rebuild(needProject()), asJson));
  }
  if (cmd === "revisions") {
    process.exit(printResult(await service.executeTool("list_revisions", { project_id: needProject() }, { transport: "cli" }), asJson));
  }
  if (cmd === "rollback") {
    const rev = pos[1];
    if (!rev) {
      process.stderr.write("revision id required\n");
      process.exit(2);
    }
    process.exit(
      printResult(await service.executeTool("rollback_revision", { project_id: needProject(), revision_id: rev }, { transport: "cli" }), asJson),
    );
  }
  if (cmd === "export") {
    const format = String(flags.format || pos[1] || "step") as "stl" | "obj" | "json" | "step" | "fcstd" | "3mf";
    process.exit(printResult(await service.exportArtifact(needProject(), format), asJson));
  }
  if (cmd === "preview") {
    const view = typeof flags.view === "string" ? flags.view : "isometric";
    process.exit(printResult(await service.renderPreview(needProject(), { view }), asJson));
  }
  if (cmd === "import") {
    const file = typeof flags.file === "string" ? flags.file : pos[1];
    if (!file) {
      process.stderr.write("usage: agentcad import --project <id> --file <path>\n");
      process.exit(2);
    }
    const format = typeof flags.format === "string" ? flags.format : undefined;
    process.exit(
      printResult(
        await service.executeTool("import_file", { project_id: needProject(), path: file, format }, { transport: "cli" }),
        asJson,
      ),
    );
  }
  if (cmd === "query") {
    const entity = flags.entity === "face" ? "face" : "edge";
    const selector = typeof flags.selector === "string" ? flags.selector : entity === "face" ? "planar" : "all_edges";
    process.exit(
      printResult(
        await service.executeTool(
          "query_geometry",
          { project_id: needProject(), entity, selector, body_id: typeof flags.body === "string" ? flags.body : undefined },
          { transport: "cli" },
        ),
        asJson,
      ),
    );
  }
  if (cmd === "deps" || cmd === "dependencies") {
    const name = typeof flags.name === "string" ? flags.name : pos[1];
    if (!name) {
      process.stderr.write("usage: agentcad deps --project <id> --name wall\n");
      process.exit(2);
    }
    process.exit(
      printResult(await service.executeTool("inspect_dependencies", { project_id: needProject(), name }, { transport: "cli" }), asJson),
    );
  }
  if (cmd === "param") {
    const sub = (pos[1] ?? "set").toLowerCase();
    if (sub === "set") {
      const name = pos[2];
      const value = Number(pos[3]);
      if (!name || !Number.isFinite(value)) {
        process.stderr.write("usage: agentcad param set --project <id> <name> <value>\n");
        process.exit(2);
      }
      process.exit(
        printResult(await service.executeTool("set_parameter", { project_id: needProject(), name, value }, { transport: "cli" }), asJson),
      );
    }
    if (sub === "define") {
      const name = pos[2];
      const value = Number(pos[3]);
      process.exit(
        printResult(await service.executeTool("define_parameter", { project_id: needProject(), name, value }, { transport: "cli" }), asJson),
      );
    }
  }

  try {
    const line = tokens
      .filter((t) => t !== "--project" && t !== project && t !== "--backend" && t !== backendFlag)
      .join(" ");
    const op = parseCli(line);
    process.exit(
      printResult(
        await service.executeTool(
          op.op,
          { ...(op as unknown as Record<string, unknown>), project_id: needProject(), backend: backendFlag },
          { transport: "cli", backend: backendFlag },
        ),
        asJson,
      ),
    );
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n");
    process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.stack || err.message : String(err)) + "\n");
  process.exit(1);
});
