#!/usr/bin/env node
/**
 * Phase 7C.2 — Regression test: EvalProvider outputs must never contain API keys or secrets.
 *
 * Run with: OPENAI_API_KEY=sk-fake123456789012345678 npx tsx scripts/evals/providers/secret-redaction-test.mjs
 * Must PASS even with fake credentials injected.
 */
import { normalizeResult, normalizeRequest, EvalProviderError } from "./provider.mjs";
import { openaiCompatibleProvider } from "./openai-compatible.mjs";
import { createMockProvider } from "./mock.mjs";

function check(name, cond, detail = "") {
  const ok = cond;
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(48)} ${detail}`);
  return ok;
}

async function main() {
  let passed = true;
  const fakeKey = "sk-fake123456789012345678901234567890123456";
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = fakeKey;
  process.env.OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

  // Test 1: normalizeRequest must not see the key
  try {
    const req = normalizeRequest({ model: "gpt-4", messages: [] });
    if (JSON.stringify(req).includes(fakeKey)) {
      passed = check("request contains no key", false, "key leaked in request");
    } else passed = check("request contains no key", true);
  } catch (e) { passed = check("request normalization", false, String(e)); }

  // Test 2: openai-compatible provider error path – no key in error message
  try {
    const provider = openaiCompatibleProvider;
    await provider.run({ model: "gpt-4", messages: [] });
    passed = check("openai provider rejects no-key", false, "should have thrown");
  } catch (e) {
    if (e instanceof EvalProviderError && JSON.stringify(e).includes(fakeKey)) {
      passed = check("error message has no key", false, "key in error");
    } else passed = check("error message has no key", true);
  }

  // Test 3: mock provider output never includes env vars
  const mockProvider = createMockProvider();
  const mockResult = await mockProvider.run({ model: "mock", messages: [{ role: "user", content: "test" }] });
  const resultJson = JSON.stringify(mockResult);
  if (resultJson.includes(fakeKey)) {
    passed = check("mock output has no key", false, "key in output");
  } else passed = check("mock output has no key", true);

  // Test 4: providerMetadata should not leak keys
  const metadataJson = JSON.stringify(mockResult.providerMetadata);
  if (metadataJson.includes(fakeKey)) {
    passed = check("metadata has no key", false, "key in metadata");
  } else passed = check("metadata has no key", true);

  // Test 5: unset key, mock still works
  delete process.env.OPENAI_API_KEY;
  const mockResult2 = await mockProvider.run({ model: "another", messages: [] });
  passed = check("mock works without env key" + (mockResult2.output ? "" : " no output"), !!mockResult2.output);

  process.env.OPENAI_API_KEY = oldKey;
  console.log("\n" + (passed ? "✅ Secret-redaction tests PASSED" : "❌ Secret-leak detected"));
  process.exit(passed ? 0 : 1);
}

main();
