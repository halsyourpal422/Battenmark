#!/usr/bin/env node
/**
 * Phase 7A — Battenmark MCP interoperability CONTROL harness.
 *
 * Drives the stock Battenmark MCP stdio server with a standards-compliant
 * MCP client (official SDK) through a deterministic CAD chain, asserting:
 *   connect → discover → create → constrain → inspect (DOF golden) → export
 * plus structured-error recovery and reconnect-after-restart.
 *
 * Modes: this file IS the control mode. Donor modes live beside it
 * (hermes.mjs / agent-zero.mjs) and must never be required by CI.
 *
 * Usage: node scripts/interop/control.mjs [--runs 2]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER_ARGS = ["src/cad/mcp/stdio.ts"];
const RUNS = Number(process.argv.includes("--runs") ? process.argv[process.argv.indexOf("--runs") + 1] : 2);

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${name.padEnd(34)} ${detail}`);
}
const sortedEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function connect() {
  const transport = new StdioClientTransport({ command: path.join(ROOT, "node_modules", ".bin", "tsx"), args: SERVER_ARGS, cwd: ROOT });
  const client = new Client({ name: "interop-control", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) {
    const text = res.content?.map((c) => c.text ?? "").join("") ?? "";
    return { ok: false, text, structured: res.structuredContent ?? null };
  }
  let data = {};
  try { data = JSON.parse(res.content?.[0]?.text ?? "{}"); } catch { data = {}; }
  return { ok: true, data: data.data ?? data, raw: data };
}

async function runOnce(runId) {
  const stamp = `${runId}-${Date.now().toString(36)}`;
  const { client, transport } = await connect();

  const init = await client.getServerVersion();
  check(`${stamp} initialize`, Boolean(init?.name), `server=${init?.name} v${init?.version}`);
  const tools = await client.listTools();
  const toolCount = tools.tools.length;
  const names = new Set(tools.tools.map((t) => t.name));
  check(`${stamp} discover`, toolCount >= 75 && names.has("inspect_assembly"), `tools=${toolCount}`);
  const mate = tools.tools.find((t) => t.name === "mate_faces");
  const mateReq = JSON.stringify(mate?.inputSchema?.required ?? []);
  check(`${stamp} schema-required-fields`, mateReq === JSON.stringify(["project_id", "assembly_id", "a_instance", "a_face", "b_instance", "b_face"]), `required=${mateReq}`);

  const proj = await call(client, "project_create", { name: `interop-control-${stamp}` });
  const pid = String(proj.data?.project_id ?? proj.project_id ?? "");
  if (!pid) throw new Error(`project_create returned no id: ${JSON.stringify(proj).slice(0, 120)}`);
  await call(client, "create_box", { project_id: pid, length_mm: 60, width_mm: 40, height_mm: 10, name: "Anchor" });
  await call(client, "create_body", { project_id: pid, name: "MoverBody" });
  await call(client, "create_box", { project_id: pid, body_id: "MoverBody", length_mm: 30, width_mm: 30, height_mm: 12, name: "Mover" });

  await call(client, "create_assembly", { project_id: pid, name: "ctl_asm" });
  await call(client, "define_component", { project_id: pid, assembly_id: "ctl_asm", component_id: "a", include: { body_ids: ["Body"] } });
  await call(client, "define_component", { project_id: pid, assembly_id: "ctl_asm", component_id: "b", include: { body_ids: ["MoverBody"] } });
  await call(client, "create_instance", { project_id: pid, assembly_id: "ctl_asm", component_id: "a", instance_id: "a1" });
  await call(client, "fix_instance", { project_id: pid, assembly_id: "ctl_asm", instance_id: "a1" });
  await call(client, "create_instance", { project_id: pid, assembly_id: "ctl_asm", component_id: "b", instance_id: "b1" });

  const mateRes = await call(client, "mate_faces", { project_id: pid, assembly_id: "ctl_asm", a_instance: "a1", a_face: "top_face", b_instance: "b1", b_face: "bottom_face" });
  check(`${stamp} constrain`, mateRes.ok, "mate_faces top↔bottom applied");

  const insp = await call(client, "inspect_assembly", { project_id: pid, assembly_id: "ctl_asm" });
  const b1 = (insp.data?.instances ?? []).find((i) => i.id === "b1") ?? {};
  check(`${stamp} inspect-dof`, Number(b1.remaining_dof) === 3 && sortedEq(b1.free_translation ?? [], ["x", "y"]) && sortedEq(b1.free_rotation ?? [], ["about_z"]),
    `planar golden via MCP: dof=${b1.remaining_dof} freeT=[${(b1.free_translation ?? []).join(",")}] freeR=[${(b1.free_rotation ?? []).join(",")}]`);

  const neg = await client.callTool({ name: "set_distance", arguments: { project_id: pid, assembly_id: "ctl_asm", a_instance: "a1", a_ref: "right_face", b_instance: "nope", b_ref: "left_face", distance_mm: 5 } });
  check(`${stamp} structured-error`, neg.isError === true, `invalid instance ref rejected: ${(neg.content?.[0]?.text ?? "").slice(0, 90)}`);
  const afterNeg = await call(client, "inspect_assembly", { project_id: pid, assembly_id: "ctl_asm" });
  check(`${stamp} error-recovery`, afterNeg.ok === true, "session alive after structured error");

  const exp = await call(client, "export_fcstd", { project_id: pid });
  const artId = exp.data?.artifact_id;
  check(`${stamp} export`, Boolean(artId), `artifact=${String(artId).slice(0, 18)}…`);
  const meta = await call(client, "get_artifact_metadata", { artifact_id: artId });
  const size = Number(meta.data?.bytes ?? meta.bytes ?? -1);
  check(`${stamp} artifact-nonempty`, size > 0, `fcstd bytes=${size}`);

  await client.close();
  await transport.close();
  return { stamp, toolCount };
}

console.log(`# Phase 7A control harness — ${RUNS} run(s), restart between runs`);
const seenCounts = [];
for (let i = 1; i <= RUNS; i += 1) {
  const r = await runOnce(`r${i}`);
  seenCounts.push(r.toolCount);
}
check("restart-reconnect-determinism", new Set(seenCounts).size === 1,
  `fresh server per run; tool counts identical across runs: [${seenCounts.join(",")}]`);
console.log(failures === 0 ? `\nCONTROL INTEROP: ALL PASS` : `\nCONTROL INTEROP: ${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
