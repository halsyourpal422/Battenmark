/**
 * Phase 7C.2 — Deterministic mock EvalProvider for CI.
 */
import {
  EvalProviderError,
  normalizeRequest,
  normalizeResult,
  registerProvider,
} from "./provider.mjs";

export function createMockProvider(options = {}) {
  const script = Array.isArray(options.script) ? [...options.script] : null;
  return {
    id: "mock",
    async run(request) {
      const normalized = normalizeRequest(request);
      if (!normalized.model)
        throw new EvalProviderError("MODEL_REQUIRED", "mock requires model field");
      if (script && script.length) {
        const scripted = script.shift();
        const turn = typeof scripted === "function" ? await scripted(normalized) : scripted;
        return normalizeResult({
          providerId: "mock",
          model: normalized.model,
          output: turn.output ?? "",
          toolCalls: turn.toolCalls ?? [],
          usage: { promptTokens: 1, completionTokens: 1 },
          finishReason: turn.finishReason ?? (turn.toolCalls?.length ? "tool_calls" : "stop"),
          providerMetadata: { providerId: "mock", model: normalized.model },
        });
      }
      const lastMsg = [...normalized.messages].reverse().find((m) => m.role === "user");
      return normalizeResult({
        providerId: "mock",
        model: normalized.model,
        output: lastMsg ? `${String(lastMsg.content).slice(0, 24)} [mocked]` : "[mocked]",
        toolCalls: [],
        usage: { promptTokens: 8, completionTokens: 4 },
        finishReason: "stop",
        providerMetadata: { providerId: "mock", model: normalized.model },
      });
    },
  };
}

registerProvider(createMockProvider());
