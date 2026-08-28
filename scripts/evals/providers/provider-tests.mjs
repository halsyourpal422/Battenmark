#!/usr/bin/env node
/**
 * Phase 7C.2 — Provider unit tests with mocked behavior only.
 * No paid API calls are made in CI.
 */
import { getProvider, listProviders, resolveProvider } from "./provider.mjs";

async function main() {
  console.log("🧪 Running EvalProvider unit tests...\n");
  let failures = 0;
  const check = (name, cond, detail = "") => {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"} ${name.padEnd(50)} ${detail}`);
  };

  console.log("1️⃣  Registry");
  const providerIds = listProviders();
  check("registry has mock", providerIds.includes("mock"), providerIds.join(", "));
  check("registry has openai-compatible", providerIds.includes("openai-compatible"), providerIds.join(", "));

  const mockRegistered = getProvider("mock");
  check("getProvider works for mock", mockRegistered !== undefined, "mock not found");
  check("getProvider returns correct type", mockRegistered.id === "mock", "wrong id");

  const oldProvider = process.env.BATTENMARK_EVAL_MODEL;
  delete process.env.BATTENMARK_EVAL_MODEL;
  try {
    const resolved = resolveProvider();
    check("resolveProvider defaults to mock", resolved?.id === "mock", resolved?.id ?? "undefined");
  } finally {
    if (oldProvider === undefined) delete process.env.BATTENMARK_EVAL_MODEL;
    else process.env.BATTENMARK_EVAL_MODEL = oldProvider;
  }

  console.log(`\n${failures ? "❌" : "✅"} Provider tests: ${providerIds.length} providers registered`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
