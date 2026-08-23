export {
  CAPABILITY_KEYS,
  BACKEND_ROLES,
  FREECAD_BACKEND_ID,
  JSCAD_BACKEND_ID,
  MOCKCAD_BACKEND_ID,
  capabilityFlags,
  freecadCapabilities,
  jscadCapabilities,
  capabilityReport,
  capabilityReportFromStatus,
  capabilitiesForOperation,
  requiredCapabilitiesFor,
  firstUnsupportedCapability,
  pickRole,
} from "./capabilities";
export type {
  BackendCapabilities,
  BackendId,
  BackendRole,
  CapabilityFlag,
  CapabilityKey,
  CapabilityReport,
} from "./capabilities";
export {
  BackendRegistry,
  createBackendRegistry,
  createProductionRegistry,
  getBackendRegistry,
  resetBackendRegistry,
  assertValidBackendId,
  isValidBackendId,
} from "./registry";
export type { BackendRegistration, RegisteredBackend } from "./registry";
export { mockcadCapabilities, mockcadRegistration, mockcadInspect } from "./mockcad";
