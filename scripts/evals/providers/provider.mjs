/**
 * Phase 7C.2 — Minimal evaluation-only model/provider seam.
 * Must never be imported from src/cad/**.
 */
import { registerProvider, getProvider, listProviders } from "./registry.mjs";
import { loadProviderConfig, validateProviderConfig } from "./provider-config.mjs";

export class EvalProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "EvalProviderError";
  }
}

export function normalizeRequest({ model, messages, tools, temperature, maxOutputTokens }) {
  if (!model) throw new EvalProviderError("MODEL_REQUIRED", "model is required");
  return {
    model,
    messages: (messages || []).map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    tools: tools
      ? tools.map((t) => ({
          name: t.name || t.function?.name,
          description: t.description || t.function?.description || "",
          parameters: t.parameters || t.function?.parameters || { type: "object", properties: {} },
        }))
      : [],
    temperature: temperature ?? 0,
    maxOutputTokens: maxOutputTokens ?? 4096,
  };
}

export function normalizeResult({
  providerId,
  model,
  output,
  toolCalls,
  usage,
  providerMetadata,
  finishReason,
}) {
  return {
    output: String(output ?? ""),
    toolCalls: Array.isArray(toolCalls)
      ? toolCalls.map((tc) => ({
          id: tc.id ? String(tc.id) : undefined,
          name: tc.name,
          args: tc.args && typeof tc.args === "object" ? tc.args : {},
        }))
      : [],
    usage: usage
      ? {
          promptTokens: usage.promptTokens ?? usage.prompt_tokens ?? null,
          completionTokens: usage.completionTokens ?? usage.completion_tokens ?? null,
        }
      : undefined,
    finishReason: finishReason ?? null,
    providerMetadata: providerMetadata ?? { providerId, model },
  };
}

export function parseToolCallArguments(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    throw new EvalProviderError("MALFORMED_TOOL_ARGS", "tool call arguments must be a JSON object");
  } catch (err) {
    if (err instanceof EvalProviderError) throw err;
    throw new EvalProviderError("MALFORMED_TOOL_ARGS", "tool call arguments are not valid JSON");
  }
}

export function resolveProvider(overrides = {}) {
  const cfg = validateProviderConfig(loadProviderConfig(overrides));
  return getProvider(cfg.provider);
}

export function resolveRunContext(overrides = {}) {
  const cfg = validateProviderConfig(loadProviderConfig(overrides));
  return { config: cfg, provider: getProvider(cfg.provider) };
}

export { registerProvider, getProvider, listProviders };

import "./mock.mjs";
import "./openai-compatible.mjs";
