/**
 * Phase 7C.2 — Deterministic mock EvalProvider for testing and CI.
 * Exercises the full provider seam without calling any real API.
 */
import { EvalProviderError, normalizeRequest, normalizeResult, registerProvider } from "./provider.mjs";

/** @returns {import("./provider.mjs").EvalProvider} */
export function createMockProvider() {
  return {
    id: "mock",
    async run(request) {
      const normalized = normalizeRequest(request);
      if (!normalized.model) throw new EvalProviderError("MODEL_REQUIRED", "mock requires model field");
      const lastMsg = [...normalized.messages].reverse().find((m) => m.role === "user");
      const output = lastMsg ? String(lastMsg.content).slice(0, 20) + " [mocked]" : "[mocked]";
      return normalizeResult({
        providerId: "mock",
        model: normalized.model,
        output,
        toolCalls: [{ name: "project_create", args: { name: "mock-project" } }],
        usage: { promptTokens: 50, completionTokens: 12 },
        providerMetadata: { providerId: "mock", model: normalized.model },
      });
    },
  };
}

// Auto-register on module load
registerProvider(createMockProvider());
