/**
 * Phase 7C.2 — Evaluation provider configuration.
 * Provider ID and model ID are separate. Secrets stay in the environment.
 */
export const SUPPORTED_PROVIDERS = ["mock", "openai-compatible"];

export function loadProviderConfig(overrides = {}) {
  const provider = overrides.provider ?? process.env.BATTENMARK_EVAL_PROVIDER ?? "mock";
  const model = overrides.model ?? process.env.BATTENMARK_EVAL_MODEL ?? "";
  const apiKeyEnv = overrides.apiKeyEnv ?? process.env.BATTENMARK_EVAL_API_KEY_ENV ?? "OPENAI_API_KEY";
  return {
    provider,
    model: model || (provider === "mock" ? "mock-model" : ""),
    baseUrl: overrides.baseUrl ?? process.env.BATTENMARK_EVAL_BASE_URL ?? "https://api.openai.com/v1",
    apiKeyEnv,
    temperature: overrides.temperature !== undefined ? Number(overrides.temperature) : Number(process.env.BATTENMARK_EVAL_TEMPERATURE ?? 0),
    maxOutputTokens: overrides.maxOutputTokens !== undefined ? Number(overrides.maxOutputTokens) : Number(process.env.BATTENMARK_EVAL_MAX_TOKENS ?? 4096),
    timeoutMs: overrides.timeoutMs !== undefined ? Number(overrides.timeoutMs) : Number(process.env.BATTENMARK_EVAL_TIMEOUT_MS ?? 30000),
  };
}

export function validateProviderConfig(config) {
  if (!SUPPORTED_PROVIDERS.includes(config.provider)) {
    throw new Error(`unknown eval provider '${config.provider}'. supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
  }
  if (config.provider !== "mock" && !config.model) {
    throw new Error("BATTENMARK_EVAL_MODEL is required for non-mock providers");
  }
  if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
    throw new Error("temperature must be 0-2");
  }
  if (!Number.isFinite(config.maxOutputTokens) || config.maxOutputTokens < 1) {
    throw new Error("maxOutputTokens must be >= 1");
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1) {
    throw new Error("timeoutMs must be >= 1");
  }
  return config;
}

export function hasProviderCredential(config, env = process.env) {
  if (config.provider === "mock") return false;
  const key = env[config.apiKeyEnv];
  return typeof key === "string" && key.length > 0;
}
