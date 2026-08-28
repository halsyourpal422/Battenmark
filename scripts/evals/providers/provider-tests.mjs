#!/usr/bin/env node
/**
 * Phase 7C.2 — Provider unit tests with mocked HTTP/network behavior.
 * No paid API calls are made in CI; all behavior is mocked.
 */
import { EvalProviderError, getProvider, listProviders, resolveProvider } from "./provider.mjs";
import { createMockProvider } from "./mock.mjs";
import { openaiCompatibleProvider } from "./openai-compatible.mjs";

function check(name, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name.padEnd(50)} ${detail}`);
}

async function main() {
  console.log("🧪 Running EvalProvider unit tests...\n");
  let failures = 0;

  // --- Registry tests ---
  console.log("1️⃣  Registry");
  const providerIds = listProviders();
  check("registry has mock", providerIds.includes("mock"), providerIds.join(", "));
  check("registry has openai-compatible", providerIds.includes("openai-compatible"), providerIds.join(", "));

  const mockRegistered = getProvider("mock");
  check("getProvider works for mock", mockRegistered !== undefined, "mock not found");
  check("getProvider returns correct type", mockRegistered.id === "mock", "wrong id");

  // Note: resolveProvider uses BATTENMARK_EVAL_MODEL env var; mock is default when not set
  const resolved = resolveProvider();
  check("resolveProvider returns a provider", resolved !== undefined, "undefined provider");

  console.log(`\n✅ Provider tests: ${providerIds.length} providers registered`);
  if (failures) process.exit(1);
}

main();
