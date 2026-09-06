#!/usr/bin/env node
/**
 * Phase 7C.2 — Secret-redaction regression.
 * Uses a fake credential and mocked fetch only; never makes a real network call.
 */
import { EvalProviderError, normalizeRequest } from "./provider.mjs";
import { openaiCompatibleProvider } from "./openai-compatible.mjs";
import { createMockProvider } from "./mock.mjs";

async function main() {
  let failures = 0;
  const check = (name, cond, detail = "") => {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"} ${name.padEnd(48)} ${detail}`);
  };

  const fakeKey = "sk-fake123456789012345678901234567890123456";
  const oldKey = process.env.OPENAI_API_KEY;
  const oldKeyEnv = process.env.OPENAI_API_KEY_ENV;
  const oldFetch = globalThis.fetch;

  try {
    process.env.OPENAI_API_KEY = fakeKey;
    process.env.OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

    const req = normalizeRequest({ model: "test-model", messages: [] });
    check("request contains no key", !JSON.stringify(req).includes(fakeKey));

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      async text() {
        return `upstream echoed credential ${fakeKey}`;
      },
    });

    try {
      await openaiCompatibleProvider.run({ model: "test-model", messages: [] });
      check("provider error path throws", false, "expected provider error");
    } catch (err) {
      const serialized = JSON.stringify({ name: err?.name, code: err?.code, message: err?.message });
      check("provider error is structured", err instanceof EvalProviderError, err?.code ?? "unknown");
      check("provider error redacts key", !serialized.includes(fakeKey));
      check("provider error marks redaction", serialized.includes("[REDACTED]"));
    }

    const mockResult = await createMockProvider().run({
      model: "mock",
      messages: [{ role: "user", content: "test" }],
    });
    check("mock output has no key", !JSON.stringify(mockResult).includes(fakeKey));

    delete process.env.OPENAI_API_KEY;
    try {
      await openaiCompatibleProvider.run({ model: "test-model", messages: [] });
      check("missing credential rejected", false, "expected credential error");
    } catch (err) {
      check("missing credential rejected", err instanceof EvalProviderError && err.code === "CREDENTIAL_MISSING", err?.code ?? "unknown");
      check("missing-key error has no key", !JSON.stringify({ message: err?.message }).includes(fakeKey));
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldKeyEnv === undefined) delete process.env.OPENAI_API_KEY_ENV;
    else process.env.OPENAI_API_KEY_ENV = oldKeyEnv;
  }

  console.log(`\n${failures ? "❌ Secret-redaction tests FAILED" : "✅ Secret-redaction tests PASSED"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
