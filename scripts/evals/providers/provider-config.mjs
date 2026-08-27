/**
 * Phase 7C.2 — Evaluation provider configuration.
 * All secrets must come from environment; never committed to source.
 */
export const providerConfigSchema = {
  type: "object",
  properties: {
    provider: { type: "string", enum: ["mock", "openai-compatible"], default: "mock" },
    model: { type: "string", minLength: 1 },
    baseUrl: { type: "string", format: "uri" },
    apiKeyEnv: { type: "string", default: "OPENAI_API_KEY" },
    temperature: { type: "number", minimum: 0, maximum: 2, default: 0 },
    maxOutputTokens: { type: "integer", minimum: 1, maximum: 128000, default: 4096 },
    timeoutMs: { type: "integer", minimum: 1000, default: 30000 },
  },
  required: ["model"],
  additionalProperties: false,
};

export function loadProviderConfig(overrides = {}) {
  return {
    provider: process.env.BATTENMARK_EVAL_PROVIDER || "mock",
    model: process.env.BATTENMARK_EVAL_MODEL || "gpt-4",
    baseUrl: process.env.BATTENMARK_EVAL_BASE_URL || "https://api.openai.com/v1",
    apiKeyEnv: process.env.OPENAI_API_KEY_ENV || "OPENAI_API_KEY",
    temperature: Number(process.env.BATTENMARK_EVAL_TEMPERATURE || 0),
    maxOutputTokens: Number(process.env.BATTENMARK_EVAL_MAX_TOKENS || 4096),
    timeoutMs: Number(process.env.BATTENMARK_EVAL_TIMEOUT_MS || 30000),
    ...overrides,
  };
}

export function validateProviderConfig(config) {
  if (!config.model) throw new Error("model is required");
  if (config.provider !== "mock" && !config.apiKeyEnv) {
    throw new Error("apiKeyEnv is required for non-mock providers");
  }
  if (config.temperature < 0 || config.temperature > 2) {
    throw new Error("temperature must be 0-2");
  }
  return true;
}
