/**
 * Backend registry.
 *
 * IDs are open, validated strings. Roles are advertised by each backend and
 * derived at report time. The generic reporter does not know that FreeCAD
 * or JSCAD exist — those names appear only in adapter registration.
 */
import { cadError } from "../errors";
import {
  BACKEND_ROLES,
  capabilityReport,
  freecadCapabilities,
  jscadCapabilities,
  type BackendCapabilities,
  type BackendId,
  type BackendRole,
  type CapabilityKey,
  type CapabilityReport,
} from "./capabilities";

const BACKEND_ID_RE = /^[a-z][a-z0-9_-]{0,62}$/;

export function isValidBackendId(id: unknown): id is BackendId {
  return typeof id === "string" && BACKEND_ID_RE.test(id);
}

export function assertValidBackendId(id: unknown): BackendId {
  if (!isValidBackendId(id)) {
    throw cadError("MALFORMED_REQUEST", `Invalid backend id '${String(id)}'. Use a lowercase identifier such as 'freecad' or 'build123d'.`);
  }
  return id;
}

export interface BackendRegistration {
  id: string;
  name: string;
  roles: BackendRole[];
  /** If set, registering a second exclusive holder of that role fails. */
  exclusiveRoles?: BackendRole[];
  capabilities: BackendCapabilities["capabilities"];
  notes?: string[];
  testOnly?: boolean;
  available?: boolean;
  version?: string | null;
  executable?: string | null;
  platform?: string;
  arch?: string;
  discovery_mode?: string;
  detail?: string;
}

export interface RegisteredBackend extends BackendCapabilities {
  exclusiveRoles: BackendRole[];
}

export class BackendRegistry {
  private items = new Map<BackendId, RegisteredBackend>();

  register(input: BackendRegistration): RegisteredBackend {
    const id = assertValidBackendId(input.id);
    if (this.items.has(id)) {
      throw cadError("BACKEND_REGISTRATION_CONFLICT", `Backend '${id}' is already registered.`, {
        backend: id,
      });
    }
    if (!input.roles.length) {
      throw cadError("MALFORMED_REQUEST", `Backend '${id}' must advertise at least one role.`, { backend: id });
    }
    for (const role of input.exclusiveRoles ?? []) {
      for (const existing of this.items.values()) {
        if (existing.exclusiveRoles.includes(role)) {
          throw cadError(
            "BACKEND_ROLE_CONFLICT",
            `Role '${role}' is exclusively held by '${existing.id}'; '${id}' cannot claim it.`,
            { role, holder: existing.id, backend: id },
          );
        }
      }
    }
    const roles = input.roles;
    const entry: RegisteredBackend = {
      id,
      name: input.name,
      role: roles[0]!,
      roles,
      exclusiveRoles: [...(input.exclusiveRoles ?? [])],
      available: input.available ?? false,
      version: input.version ?? null,
      executable: input.executable ?? null,
      platform: input.platform,
      arch: input.arch,
      discovery_mode: input.discovery_mode,
      detail: input.detail,
      test_only: input.testOnly,
      capabilities: input.capabilities,
      notes: input.notes ?? [],
    };
    this.items.set(id, entry);
    return entry;
  }

  get(id: string): RegisteredBackend | undefined {
    return this.items.get(id);
  }

  require(id: string): RegisteredBackend {
    const hit = this.items.get(id);
    if (!hit) {
      throw cadError("BACKEND_NOT_FOUND", `Backend '${id}' is not registered.`, {
        backend: id,
        known: this.ids(),
      });
    }
    return hit;
  }

  ids(): BackendId[] {
    return [...this.items.keys()];
  }

  list(): RegisteredBackend[] {
    return [...this.items.values()];
  }

  update(id: string, patch: Partial<Omit<RegisteredBackend, "id" | "capabilities" | "roles" | "exclusiveRoles">>): RegisteredBackend {
    const hit = this.require(id);
    Object.assign(hit, patch);
    return hit;
  }

  role(role: BackendRole): RegisteredBackend | undefined {
    const list = this.list();
    const id = list.find((b) => b.available && b.roles.includes(role))?.id ?? list.find((b) => b.roles.includes(role))?.id;
    return id ? this.items.get(id) : undefined;
  }

  /**
   * Resolve an explicit backend request.
   * Omitted id does not throw — callers that want a default should use `role("authoritative")`.
   */
  select(requested: string, needed: CapabilityKey[] = []): RegisteredBackend {
    const id = assertValidBackendId(requested);
    const backend = this.get(id);
    if (!backend) {
      throw cadError("BACKEND_NOT_FOUND", `Backend '${id}' is not registered.`, {
        backend: id,
        known: this.ids(),
        suggestion: `Known backends: ${this.ids().join(", ") || "(none)"}.`,
      });
    }
    if (!backend.available) {
      throw cadError("BACKEND_UNAVAILABLE", `Backend '${id}' is registered but not available.`, {
        backend: id,
        detail: backend.detail,
        suggestion:
          id === "freecad"
            ? "Install FreeCAD and set AGENTCAD_FREECAD_CMD, or run scripts/bootstrap-macos.sh / scripts/install-freecad.sh."
            : `Start or install backend '${id}'.`,
      });
    }
    for (const key of needed) {
      if (!backend.capabilities[key]) {
        throw cadError("BACKEND_UNSUPPORTED", `Backend '${id}' does not support '${key}'.`, {
          backend: id,
          capability: key,
          suggestion: "Call inspect_backend_capabilities and pick a backend that advertises this capability, or omit backend to use the default.",
        });
      }
    }
    return backend;
  }

  report(): CapabilityReport {
    return capabilityReport(this.list());
  }
}

export function createBackendRegistry(): BackendRegistry {
  return new BackendRegistry();
}

/** Production set: FreeCAD authoritative, JSCAD preview. No test backends. */
export function createProductionRegistry(): BackendRegistry {
  const registry = new BackendRegistry();
  // Phase 6.2: experimental second backend, centrally selected via env.
  if (process.env.BATTENMARK_CAD_BACKEND === "build123d") {
    try {
      const { build123dCapabilities, BUILD123D_BACKEND_ID } = require("./capabilities") as typeof import("./capabilities");
      void BUILD123D_BACKEND_ID;
      registry.register(build123dCapabilities({ available: true }));
    } catch {
      /* registration must never break the default registry */
    }
  }
  const fc = freecadCapabilities({ available: false });
  const js = jscadCapabilities({ available: true });
  registry.register({
    id: fc.id,
    name: fc.name,
    roles: fc.roles,
    capabilities: fc.capabilities,
    notes: fc.notes,
    available: fc.available,
    version: fc.version,
    executable: fc.executable,
  });
  registry.register({
    id: js.id,
    name: js.name,
    roles: js.roles,
    capabilities: js.capabilities,
    notes: js.notes,
    available: js.available,
    version: js.version,
  });
  return registry;
}

let singleton: BackendRegistry | null = null;

export function getBackendRegistry(): BackendRegistry {
  if (!singleton) singleton = createProductionRegistry();
  return singleton;
}

export function resetBackendRegistry(next?: BackendRegistry): BackendRegistry {
  singleton = next ?? createProductionRegistry();
  return singleton;
}

export { BACKEND_ROLES };
