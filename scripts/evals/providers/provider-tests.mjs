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

function mockResponse({ status = 200, body = {}, headers = {} } = {}) {
  const normalizedHeaders = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: (name) => normalizedHeaders.get(String(name).toLowerCase()) ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

async function withFakeApiKey(fn, value = "sk-test-mock") {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
}

const successResponse = () => mockResponse({
  body: {
    choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 1 },
  },
});

const rateLimitResponse = ({ headers, message = "slow down" } = {}) => mockResponse({
  status: 429,
  headers,
  body: { error: { type: "tokens", code: "rate_limit_exceeded", message } },
});

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
  await test("rate-limit-retry-after-then-success", async () => withFakeApiKey(async () => {
    let attempts = 0;
    const waits = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => (++attempts === 1 ? rateLimitResponse({ headers: { "Retry-After": "2" } }) : successResponse()),
      sleepImpl: async (delayMs) => waits.push(delayMs),
    });
    const result = await provider.run(
      { model: "gpt-test", messages: [{ role: "user", content: "go" }], tools: [{ name: "create_box" }] },
      { config: { provider: "openai-compatible", model: "gpt-test" } },
    );
    assert(attempts === 2, `expected 2 attempts, got ${attempts}`);
    assert(waits.length === 1 && waits[0] === 2000, `unexpected waits ${JSON.stringify(waits)}`);
    assert(result.output === "ok" && result.model !== "changed", "successful result");
  }));
  await test("rate-limit-exponential-fallback", async () => withFakeApiKey(async () => {
    let attempts = 0;
    const waits = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => (++attempts === 1 ? rateLimitResponse() : successResponse()),
      sleepImpl: async (delayMs) => waits.push(delayMs),
    });
    await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
    assert(attempts === 2, `expected 2 attempts, got ${attempts}`);
    assert(waits.length === 1 && waits[0] === 1000, `unexpected waits ${JSON.stringify(waits)}`);
  }));
  await test("rate-limit-retry-after-http-date", async () => withFakeApiKey(async () => {
    let attempts = 0;
    const waits = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => (++attempts === 1
        ? rateLimitResponse({ headers: { "Retry-After": "Fri, 31 Dec 2099 23:59:59 GMT" } })
        : successResponse()),
      sleepImpl: async (delayMs) => waits.push(delayMs),
    });
    await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
    assert(attempts === 2, `expected 2 attempts, got ${attempts}`);
    assert(waits.length === 1 && waits[0] === 8000, `unexpected capped HTTP-date wait ${JSON.stringify(waits)}`);
  }));
  await test("rate-limit-retries-are-bounded", async () => withFakeApiKey(async () => {
    let attempts = 0;
    const waits = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => {
        attempts++;
        return rateLimitResponse();
      },
      sleepImpl: async (delayMs) => waits.push(delayMs),
    });
    try {
      await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
      throw new Error("expected rate-limit exhaustion");
    } catch (err) {
      assert(err instanceof EvalProviderError, "typed error");
      assert(err.code === "RATE_LIMIT_EXHAUSTED", `unexpected code ${err.code}`);
      assert(/rate limit.*exhausted/i.test(err.message), err.message);
      assert(attempts === 5, `expected 5 finite attempts, got ${attempts}`);
      assert(waits.length === 4, `expected 4 waits, got ${waits.length}`);
    }
  }));
  await test("credit-balance-exhausted-does-not-retry", async () => withFakeApiKey(async () => {
    let attempts = 0;
    const waits = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async () => {
        attempts++;
        return mockResponse({
          status: 429,
          body: { error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "add credits" } },
        });
      },
      sleepImpl: async (delayMs) => waits.push(delayMs),
    });
    try {
      await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
      throw new Error("expected provider error");
    } catch (err) {
      assert(err instanceof EvalProviderError, "typed error");
      assert(attempts === 1, `expected 1 attempt, got ${attempts}`);
      assert(waits.length === 0, `expected no waits, got ${waits.length}`);
    }
  }));
  await test("authentication-failures-do-not-retry", async () => withFakeApiKey(async () => {
    for (const status of [401, 403]) {
      let attempts = 0;
      const waits = [];
      const provider = createOpenAICompatibleProvider({
        fetchImpl: async () => {
          attempts++;
          return mockResponse({ status, body: { error: { code: "authentication_error", message: "denied" } } });
        },
        sleepImpl: async (delayMs) => waits.push(delayMs),
      });
      try {
        await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
        throw new Error(`expected HTTP ${status} error`);
      } catch (err) {
        assert(err instanceof EvalProviderError, `HTTP ${status} typed error`);
        assert(attempts === 1, `HTTP ${status} expected 1 attempt, got ${attempts}`);
        assert(waits.length === 0, `HTTP ${status} expected no wait`);
      }
    }
  }));
  await test("rate-limit-exhaustion-redacts-secret", async () => {
    const secret = "sk-retry-secret-must-not-leak";
    await withFakeApiKey(async () => {
      const provider = createOpenAICompatibleProvider({
        fetchImpl: async () => rateLimitResponse({ message: `provider echoed ${secret}` }),
        sleepImpl: async () => {},
      });
      try {
        await provider.run({ model: "gpt-test", messages: [] }, { config: { provider: "openai-compatible", model: "gpt-test" } });
        throw new Error("expected rate-limit exhaustion");
      } catch (err) {
        const serialized = JSON.stringify({ name: err?.name, code: err?.code, message: err?.message });
        assert(err instanceof EvalProviderError, "typed error");
        assert(!err.message.includes(secret), "secret leaked in message");
        assert(!serialized.includes(secret), "secret leaked when serialized");
        assert(serialized.includes("[REDACTED]"), "redaction marker missing");
      }
    }, secret);
  });
  await test("rate-limit-retry-preserves-request", async () => withFakeApiKey(async () => {
    const bodies = [];
    const provider = createOpenAICompatibleProvider({
      fetchImpl: async (_url, init) => {
        bodies.push(init.body);
        return bodies.length === 1 ? rateLimitResponse() : successResponse();
      },
      sleepImpl: async () => {},
    });
    await provider.run({
      model: "gpt-frozen",
      messages: [{ role: "system", content: "same" }, { role: "user", content: "task" }],
      tools: [{ name: "create_box", description: "box", parameters: { type: "object", properties: { size: { type: "number" } } } }],
      temperature: 0,
      maxOutputTokens: 4096,
    }, { config: { provider: "openai-compatible", model: "gpt-frozen" } });
    assert(bodies.length === 2, `expected 2 attempts, got ${bodies.length}`);
    assert(bodies[0] === bodies[1], "retry mutated serialized request body");
    const body = JSON.parse(bodies[1]);
    assert(body.model === "gpt-frozen", "model changed");
    assert(body.temperature === 0 && body.max_tokens === 4096, "frozen parameters changed");
    assert(body.messages.length === 2 && body.tools[0].function.name === "create_box", "messages/tools changed");
  }));
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
