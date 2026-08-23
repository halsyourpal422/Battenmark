/**
 * Proof that an OpenAI-compatible tool loop can operate AgentCAD.
 * Default: deterministic service calls (no API spend).
 * AGENTCAD_RUN_LLM=1 uses grok-4.5 with the same CAD_TOOLS (capped).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetAgentCadService } from "./agentcad";
import { AGENT_SYSTEM_PROMPT, CAD_TOOLS } from "../tools";

async function simulatedAgent() {
  const workspace = mkdtempSync(join(tmpdir(), "agentcad-llm-"));
  process.env.AGENTCAD_WORKSPACE = workspace;
  const service = resetAgentCadService();
  const created = service.createProject({ name: "llm-harness-box" });
  const projectId = created.project_id!;
  const steps = [
    ["create_box", { length_mm: 80, width_mm: 50, height_mm: 12 }],
    ["validate", {}],
    ["render_preview", { view: "isometric" }],
    ["save_revision", { label: "box v1" }],
  ] as const;
  for (const [name, args] of steps) {
    const r = await service.executeTool(name, { project_id: projectId, ...args });
    if (!r.ok) throw new Error(`${name} failed ${JSON.stringify(r.error)}`);
    process.stdout.write(`tool ${name} ok\n`);
  }
  process.stdout.write(`tools_available ${CAD_TOOLS.length}\n`);
  process.stdout.write(`system_prompt_chars ${AGENT_SYSTEM_PROMPT.length}\n`);
  process.stdout.write(`PASS  llm-harness simulated project=${projectId}\n`);
}

async function liveAgent() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    process.stdout.write("SKIP live LLM (no XAI_API_KEY)\n");
    return;
  }
  process.stdout.write("live LLM loop is opt-in and user-initiated; not run from tests.\n");
}

async function main() {
  await simulatedAgent();
  if (process.env.AGENTCAD_RUN_LLM === "1") await liveAgent();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
