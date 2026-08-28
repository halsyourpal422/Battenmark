#!/usr/bin/env node
import { getProvider, listProviders, resolveProvider, normalizeRequest, EvalProviderError } from "./provider.mjs";
import { loadProviderConfig, validateProviderConfig, hasProviderCredential, SUPPORTED_PROVIDERS } from "./provider-config.mjs";
import { createOpenAICompatibleProvider } from "./openai-compatible.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const out = [];
async function test(id, fn) {
  try {
    await fn();
    out.push({ id, passed: true });
    console.log(`PASS ${id}`);
  } catch (err) {
    out.push({ id, passed: false });
    console.log(`FAIL ${id} ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  await test("registry-mock-and-openai", () => {
    const ids = listProviders();
    assert(ids.includes("mock") && ids.includes("openai-compatible"), ids.join(","));
    assert(getProvider("mock").id === "mock", "mock id");
  });
  await test("unknown-provider-rejected", () => {
    try {
      validateProviderConfig(loadProviderConfig({ provider: "anthropic", model: "x" }));
      throw new Error("expected throw");
    } catch (err) {
      assert(/unknown eval provider/.test(err.message), err.message);
    }
  });
  await test("provider-id-not-model-id", () => {
    const cfg = loadProviderConfig({ provider: "openai-compatible", model: "gpt-4o-mini" });
    assert(cfg.provider === "openai-compatible", cfg.provider);
    assert(cfg.model === "gpt-4o-mini", cfg.model);
    const resolved = resolveProvider({ provider: "mock", model: "gpt-4o-mini" });
    assert(resolved.id === "mock", resolved.id);
  });
  await test("missing-model-rejected-for-real-provider", () => {
    try {
      validateProviderConfig(loadProviderConfig({ provider: "openai-compatible", model: "" }));
      throw new Error("expected throw");
    } catch (err) {
      assert(/BATTENMARK_EVAL_MODEL/.test(err.message), err.message);
    }
  });
  await test("credential-is-not-model-name", () => {
    const cfg = loadProviderConfig({ provider: "openai-compatible", model: "gpt-4o" });
    assert(hasProviderCredential(cfg, { OPENAI_API_KEY: "" }) === false, "empty key");
    assert(hasProviderCredential(cfg, { OPENAI_API_KEY: "sk-test" }) === true, "present");
    assert(SUPPORTED_PROVIDERS.includes("mock"), "supported");
  });
  await test("normalize-request-excludes-secrets", () => {
    const n = normalizeRequest({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "create_box", description: "box", parameters: { type: "object" } }],
      temperature: 0.2,
      maxOutputTokens: 99,
    });
    assert(n.tools[0].name === "create_box", "tool wrap");
    assert(n.temperature === 0.2 && n.maxOutputTokens === 99, "params");
    assert(!JSON.stringify(n).includes("sk-"), "secret");
  });
  await test("openai-http-mocked", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-mock";
    let captured;
    try {
      const provider = createOpenAICompatibleProvider({
        config: { provider: "openai-compatible", model: "gpt-test", timeoutMs: 5000 },
        fetchImpl: async (url, init) => {
          captured = { url, init };
          return {
            ok: true,
            json: async () => ({
              choices: [{
                message: {
                  content: "ok",
                  tool_calls: [{ id: "1", function: { name: "create_box", arguments: "{\"length_mm\":1}" } }],
                },
                finish_reason: "tool_calls",
              }],
              usage: { prompt_tokens: 3, completion_tokens: 2 },
            }),
          };
        },
      });
      const result = await provider.run(
        { model: "gpt-test", messages: [{ role: "user", content: "go" }], tools: [{ name: "create_box" }] },
        { config: { provider: "openai-compatible", model: "gpt-test", apiKeyEnv: "OPENAI_API_KEY" } },
      );
      assert(captured.url.endsWith("/chat/completions"), captured.url);
      const body = JSON.parse(captured.init.body);
      assert(body.model === "gpt-test" && body.temperature === 0 && body.max_tokens === 4096, "payload");
      assert(result.toolCalls[0].name === "create_box", "parsed tool");
      assert(result.usage.promptTokens === 3, "usage");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
  await test("timeout-uses-config", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-mock";
    const provider = createOpenAICompatibleProvider({
      fetchImpl: () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      },
    });
    try {
      await provider.run(
        { model: "m", messages: [], timeoutMs: 5 },
        { config: { provider: "openai-compatible", model: "m", timeoutMs: 5, apiKeyEnv: "OPENAI_API_KEY" } },
      );
      throw new Error("expected timeout");
    } catch (err) {
      assert(err instanceof EvalProviderError && err.code === "TIMEOUT", String(err && err.code));
      assert(String(err.message).includes("5ms"), err.message);
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
  await test("http-401-redacted", async () => {
    const fake = "sk-secret-should-not-leak";
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = fake;
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => `bad ${fake}`,
      }),
    });
    try {
      await provider.run({ model: "m", messages: [] }, { config: { provider: "openai-compatible", model: "m" } });
      throw new Error("expected http error");
    } catch (err) {
      assert(!JSON.stringify(err).includes(fake), "leak");
      assert(err instanceof EvalProviderError, "typed");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
  const failed = out.filter((t) => !t.passed).length;
  console.log(`\n${out.length - failed}/${out.length} eval provider tests passed`);
  if (failed) process.exit(1);
}
main();
