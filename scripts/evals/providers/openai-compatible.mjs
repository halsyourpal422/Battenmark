/**
 * Phase 7C.2 — OpenAI-compatible EvalProvider.
 * Credentials stay in env and must never leak into traces or errors.
 */
import { EvalProviderError, normalizeRequest, normalizeResult, parseToolCallArguments, registerProvider } from "./provider.mjs";
import { loadProviderConfig, validateProviderConfig } from "./provider-config.mjs";

function redactSecret(text, secret) {
  const value = String(text ?? "");
  if (!secret) return value;
  return value.split(secret).join("[REDACTED]");
}

export function createOpenAICompatibleProvider({ fetchImpl, config: configOverrides } = {}) {
  return {
    id: "openai-compatible",
    async run(request, runtime = {}) {
      const cfg = validateProviderConfig(loadProviderConfig({ ...configOverrides, ...runtime.config }));
      const fetchFn = runtime.fetchImpl || fetchImpl || globalThis.fetch;
      const normalized = normalizeRequest({
        ...request,
        model: request.model || cfg.model,
        temperature: request.temperature ?? cfg.temperature,
        maxOutputTokens: request.maxOutputTokens ?? cfg.maxOutputTokens,
      });
      const apiKey = process.env[cfg.apiKeyEnv];
      if (!apiKey) {
        throw new EvalProviderError("CREDENTIAL_MISSING", `Missing API key in env var ${cfg.apiKeyEnv}`);
      }
      if (typeof fetchFn !== "function") {
        throw new EvalProviderError("NETWORK_ERROR", "fetch is not available");
      }

      const baseUrl = String(cfg.baseUrl).replace(/\/+$/, "");
      const payload = {
        model: normalized.model,
        messages: normalized.messages,
        temperature: normalized.temperature,
        max_tokens: normalized.maxOutputTokens,
        stream: false,
      };
      if (normalized.tools.length > 0) {
        payload.tools = normalized.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        payload.tool_choice = "auto";
      }

      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? cfg.timeoutMs;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorText = redactSecret(await response.text().catch(() => response.statusText), apiKey);
          throw new EvalProviderError("PROVIDER_ERROR", `HTTP ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        const message = data.choices?.[0]?.message ?? {};
        let toolCalls;
        try {
          toolCalls = (message.tool_calls ?? []).map((tc) => ({
            name: tc.function?.name ?? tc.name ?? "",
            args: parseToolCallArguments(tc.function?.arguments ?? tc.arguments),
          }));
        } catch (err) {
          throw new EvalProviderError("MALFORMED_TOOL_ARGS", redactSecret(err.message, apiKey));
        }
        const usage = data.usage ?? {};
        return normalizeResult({
          providerId: "openai-compatible",
          model: normalized.model,
          output: message.content ?? "",
          toolCalls,
          usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 },
          finishReason: data.choices?.[0]?.finish_reason ?? null,
          providerMetadata: { providerId: "openai-compatible", model: normalized.model },
        });
      } catch (err) {
        if (err?.name === "AbortError") {
          throw new EvalProviderError("TIMEOUT", `Request timed out after ${timeoutMs}ms`);
        }
        if (err instanceof EvalProviderError) {
          err.message = redactSecret(err.message, apiKey);
          throw err;
        }
        throw new EvalProviderError("NETWORK_ERROR", redactSecret(String(err?.message || err), apiKey));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const openaiCompatibleProvider = createOpenAICompatibleProvider();
registerProvider(openaiCompatibleProvider);
