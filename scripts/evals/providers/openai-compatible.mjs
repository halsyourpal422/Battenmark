/**
 * Phase 7C.2 — OpenAI-compatible EvalProvider.
 * Credentials stay in env and must never leak into traces or errors.
 */
import {
  EvalProviderError,
  normalizeRequest,
  normalizeResult,
  parseToolCallArguments,
  registerProvider,
} from "./provider.mjs";
import { loadProviderConfig, validateProviderConfig } from "./provider-config.mjs";

const MAX_RATE_LIMIT_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;
const MAX_TOTAL_RETRY_DELAY_MS = 15000;
// Conservative tokenizer-free reservation: serialized input estimate + frozen
// max output allowance + a small accounting buffer.
const TOKEN_HEADROOM_BUFFER = 512;
const PACING_SAFETY_MARGIN_MS = 250;
const MAX_RESET_DURATION_MS = 60 * 60 * 1000;

function redactSecret(text, secret) {
  const value = String(text ?? "");
  if (!secret) return value;
  return value.split(secret).join("[REDACTED]");
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function providerErrorDetails(errorText) {
  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error && typeof parsed.error === "object" ? parsed.error : {};
  } catch {
    return {};
  }
}

export function parseResetDurationMs(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();
  const pattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  let total = 0;
  let end = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index !== end) return null;
    total += Number(match[1]) * multipliers[match[2]];
    end = pattern.lastIndex;
  }
  if (end !== text.length || !Number.isFinite(total) || total < 0 || total > MAX_RESET_DURATION_MS)
    return null;
  return total;
}

function parseNonNegativeNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readRateLimitState(headers, observedAt) {
  if (!headers?.get) return null;
  const state = {
    tokenLimit: parseNonNegativeNumber(headers.get("x-ratelimit-limit-tokens")),
    tokensRemaining: parseNonNegativeNumber(headers.get("x-ratelimit-remaining-tokens")),
    tokenResetDelayMs: parseResetDurationMs(headers.get("x-ratelimit-reset-tokens")),
    requestLimit: parseNonNegativeNumber(headers.get("x-ratelimit-limit-requests")),
    requestsRemaining: parseNonNegativeNumber(headers.get("x-ratelimit-remaining-requests")),
    requestResetDelayMs: parseResetDurationMs(headers.get("x-ratelimit-reset-requests")),
    observedAt,
  };
  const hasOperationalValue = Object.entries(state).some(
    ([key, value]) => key !== "observedAt" && value !== null,
  );
  return hasOperationalValue ? state : null;
}

function remainingResetDelay(resetDelayMs, state, nowMs) {
  if (resetDelayMs === null) return null;
  return Math.max(0, resetDelayMs - Math.max(0, nowMs - state.observedAt));
}

function estimatedTokenHeadroom(normalized) {
  const inputEstimate = Math.ceil(
    JSON.stringify({ messages: normalized.messages, tools: normalized.tools }).length / 4,
  );
  return inputEstimate + normalized.maxOutputTokens + TOKEN_HEADROOM_BUFFER;
}

function pacingDelayMs(state, requiredTokenHeadroom, nowMs) {
  if (!state) return null;
  const delays = [];
  if (state.tokensRemaining !== null && state.tokensRemaining < requiredTokenHeadroom) {
    const delay = remainingResetDelay(state.tokenResetDelayMs, state, nowMs);
    if (delay !== null) delays.push(delay);
  }
  if (state.requestsRemaining !== null && state.requestsRemaining <= 0) {
    const delay = remainingResetDelay(state.requestResetDelayMs, state, nowMs);
    if (delay !== null) delays.push(delay);
  }
  return delays.length ? Math.max(...delays) + PACING_SAFETY_MARGIN_MS : null;
}

function isRetryableRateLimit(status, errorText) {
  if (status !== 429) return false;
  const error = providerErrorDetails(errorText);
  return error.code === "rate_limit_exceeded" || error.type === "rate_limit_exceeded";
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const delayMs = Number(trimmed) * 1000;
    return Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : null;
  }
  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - nowMs);
}

function retryDelayMs(response, retryNumber, totalRetryDelayMs, nowMs) {
  const retryAfter = response.headers?.get?.("retry-after");
  const resetDelays = [
    parseResetDurationMs(response.headers?.get?.("x-ratelimit-reset-tokens")),
    parseResetDurationMs(response.headers?.get?.("x-ratelimit-reset-requests")),
  ].filter((value) => value !== null);
  const recommended =
    parseRetryAfterMs(retryAfter, nowMs) ??
    (resetDelays.length ? Math.max(...resetDelays) : null) ??
    Math.min(BASE_RETRY_DELAY_MS * 2 ** (retryNumber - 1), MAX_RETRY_DELAY_MS);
  const remaining = MAX_TOTAL_RETRY_DELAY_MS - totalRetryDelayMs;
  if (remaining <= 0) return null;
  return Math.min(recommended, MAX_RETRY_DELAY_MS, remaining);
}

export function createOpenAICompatibleProvider({
  fetchImpl,
  sleepImpl,
  nowImpl,
  config: configOverrides,
} = {}) {
  let rateLimitState = null;
  return {
    id: "openai-compatible",
    getRateLimitState() {
      return rateLimitState ? { ...rateLimitState } : null;
    },
    async run(request, runtime = {}) {
      const cfg = validateProviderConfig(
        loadProviderConfig({ ...configOverrides, ...runtime.config }),
      );
      const fetchFn = runtime.fetchImpl || fetchImpl || globalThis.fetch;
      const sleepFn = runtime.sleepImpl || sleepImpl || sleep;
      const nowFn = runtime.nowImpl || nowImpl || Date.now;
      const normalized = normalizeRequest({
        ...request,
        model: request.model || cfg.model,
        temperature: request.temperature ?? cfg.temperature,
        maxOutputTokens: request.maxOutputTokens ?? cfg.maxOutputTokens,
      });
      const apiKey = process.env[cfg.apiKeyEnv];
      if (!apiKey) {
        throw new EvalProviderError(
          "CREDENTIAL_MISSING",
          `Missing API key in env var ${cfg.apiKeyEnv}`,
        );
      }
      if (typeof fetchFn !== "function") {
        throw new EvalProviderError("NETWORK_ERROR", "fetch is not available");
      }

      const proactiveDelayMs = pacingDelayMs(
        rateLimitState,
        estimatedTokenHeadroom(normalized),
        nowFn(),
      );
      if (proactiveDelayMs !== null) {
        await sleepFn(proactiveDelayMs);
        rateLimitState = null;
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
        let retries = 0;
        let totalRetryDelayMs = 0;
        let response;
        while (true) {
          response = await fetchFn(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          rateLimitState = readRateLimitState(response.headers, nowFn());
          if (!response.ok) {
            const rawErrorText = await response.text().catch(() => response.statusText);
            const errorText = redactSecret(rawErrorText, apiKey);
            if (isRetryableRateLimit(response.status, rawErrorText)) {
              if (retries >= MAX_RATE_LIMIT_RETRIES) {
                throw new EvalProviderError(
                  "RATE_LIMIT_EXHAUSTED",
                  `Provider rate limit retry budget exhausted after ${retries + 1} attempts: HTTP ${response.status}: ${errorText}`,
                );
              }
              const delayMs = retryDelayMs(response, retries + 1, totalRetryDelayMs, nowFn());
              if (delayMs === null) {
                throw new EvalProviderError(
                  "RATE_LIMIT_EXHAUSTED",
                  `Provider rate limit retry duration exhausted after ${retries + 1} attempts: HTTP ${response.status}: ${errorText}`,
                );
              }
              retries++;
              totalRetryDelayMs += delayMs;
              await sleepFn(delayMs);
              continue;
            }
            throw new EvalProviderError("PROVIDER_ERROR", `HTTP ${response.status}: ${errorText}`);
          }
          break;
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
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          },
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
        throw new EvalProviderError(
          "NETWORK_ERROR",
          redactSecret(String(err?.message || err), apiKey),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const openaiCompatibleProvider = createOpenAICompatibleProvider();
registerProvider(openaiCompatibleProvider);
