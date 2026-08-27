/**
 * Phase 7C.2 — OpenAI-compatible EvalProvider.
 * Supports OpenAI and OpenAI-compatible endpoints (local, hosted, etc.)
 * Credentials must come from environment variables.
 */
import { EvalProviderError, normalizeRequest, normalizeResult } from "./provider.mjs";

/** @type {import("./provider.mjs").EvalProvider} */
export const openaiCompatibleProvider = {
  id: "openai-compatible",
  async run(request) {
    const normalized = normalizeRequest(request);
    const apiKeyEnv = process.env.OPENAI_API_KEY_ENV || "OPENAI_API_KEY";
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) throw new EvalProviderError("CREDENTIAL_MISSING", `Missing API key in env var ${apiKeyEnv}`);

    const baseUrl = (process.env.BATTENMARK_EVAL_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

    // Build chat.completions request with tool support
    const payload = {
      model: normalized.model,
      messages: normalized.messages,
      temperature: normalized.temperature,
      max_tokens: normalized.maxOutputTokens,
      stream: false,
    };
    if (normalized.tools && normalized.tools.length > 0) {
      payload.tools = normalized.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }
      }));
      payload.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new EvalProviderError("PROVIDER_ERROR", `HTTP ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      // Parse OpenAI response into normalized format
      const choice = data.choices?.[0] ?? {};
      const message = choice.message ?? {};
      const content = message.content ?? "";
      const toolCalls = (message.tool_calls ?? []).map(tc => ({
        name: tc.function?.name ?? "",
        args: tc.function?.arguments ? JSON.parse(tc.function?.arguments) : {},
      }));
      const usage = data.usage ?? {};
      return normalizeResult({
        providerId: "openai-compatible",
        model: normalized.model,
        output: content,
        toolCalls,
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
        },
        providerMetadata: {
          providerId: "openai-compatible",
          model: normalized.model,
          baseUrl: baseUrl,
          // Never leak API key
          apiKeyPresent: !!apiKey,
        },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") throw new EvalProviderError("TIMEOUT", "Request timed out after 30s");
      if (err instanceof EvalProviderError) throw err;
      throw new EvalProviderError("NETWORK_ERROR", String(err));
    }
  },
};

// Auto-register
import { registerProvider } from "./provider.mjs";
registerProvider(openaiCompatibleProvider);
