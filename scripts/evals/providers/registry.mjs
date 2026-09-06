/**
 * Phase 7C.2 — Shared provider registry.
 * Single source of truth; imported by all provider modules.
 */
const registry = new Map();
const externalProviders = new Map();

export function registerProvider(provider) {
  registry.set(provider.id, provider);
}

export function getProvider(id) {
  const p = registry.get(id) || externalProviders.get(id);
  if (!p) throw new Error(`EvalProvider not found: ${id}`);
  return p;
}

export function listProviders() {
  return Array.from(registry.keys());
}

export function registerExternalProvider(id, fn) {
  externalProviders.set(id, fn);
}
