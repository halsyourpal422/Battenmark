/**
 * Phase 7C.2 — Minimal evaluation-only model/provider seam.
 *
 * Architecture:
 *   EvaluationScenario → AgentAdapter → EvalProvider → configured endpoint → external agent/MCP → Battenmark
 *
 * This is evaluation-only infrastructure. It does NOT become a production
 * agent runtime and does NOT touch the CAD backend registry.
 */

import { registerProvider, getProvider, listProviders } from "./registry.mjs";

/**
 * @typedef {{ model: string, messages: Array<{role: string, content: string}>,
 *             tools?: Array<{name: string, description: string, parameters: object}>,
 *             temperature?: number, maxOutputTokens?: number }} EvalModelRequest
 *
 * @typedef {{ output: string, toolCalls: Array<{name: string, args: object}>,
 *             usage?: {promptTokens: number, completionTokens: number},
 *             providerMetadata?: { providerId: string, model: string } }} EvalModelResult
 *
 * @typedef {{ id: string, run(request: EvalModelRequest): Promise<EvalModelResult> }} EvalProvider
 */

/**
 * Build the normalized request envelope a provider receives.
 * Strips anything a provider must not see (e.g., raw API keys).
 * @param {object} params
 * @returns {EvalModelRequest}
 */
export function normalizeRequest({ model, messages, tools, temperature, maxOutputTokens }) {
  if (!model) throw new EvalProviderError("MODEL_REQUIRED", "model is required");
  return {
    model,
    messages: messages.map((m) => ({ role: m.role, content: String(m.content) })),
    tools: tools ? tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters ?? {} })) : [],
    temperature: temperature ?? 0,
    maxOutputTokens: maxOutputTokens ?? 4096,
  };
}

/**
 * Normalize a provider response into the canonical EvalModelResult shape.
 * @param {object} params
 * @returns {EvalModelResult}
 */
export function normalizeResult({ providerId, model, output, toolCalls, usage, providerMetadata }) {
  return {
    output: String(output ?? ""),
    toolCalls: Array.isArray(toolCalls) ? toolCalls.map((tc) => ({ name: tc.name, args: tc.args ?? {} })) : [],
    usage: usage ?? undefined,
    providerMetadata: providerMetadata ?? { providerId, model },
  };
}

/**
 * Resolve the provider configured for a run.
 * Reads BATTENMARK_EVAL_MODEL (id) and falls back to a built-in mock
 * when no model is configured. Returns the provider that will be used.
 * @returns {EvalProvider}
 */
export function resolveProvider() {
  const id = process.env.BATTENMARK_EVAL_MODEL;
  if (!id) {
    return getProvider("mock");
  }
  return getProvider(id);
}

/**
 * Lightweight error class for provider-domain errors.
 */
export class EvalProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "EvalProviderError";
  }
}

// Re-export registry functions for convenience
export { registerProvider, getProvider, listProviders };

// Register built-in providers (side-effect imports)
import "./mock.mjs";
import "./openai-compatible.mjs";
