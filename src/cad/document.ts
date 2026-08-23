import type { CadDocument, Feature, Parameter } from "./types";
import { uid } from "./ids";
import { resolveParameters } from "./expressions";
import { selectorLabel } from "./selectors";
import { featureDependsOn } from "./deps";
import { AGENTCAD_SCHEMA_VERSION } from "./version";

export function emptyDocument(name = "Untitled"): CadDocument {
  const now = Date.now();
  return {
    schemaVersion: AGENTCAD_SCHEMA_VERSION,
    id: uid("doc"),
    name,
    units: "mm",
    createdAt: now,
    updatedAt: now,
    parameters: [],
    bodies: [],
    features: [],
    log: [],
    revisions: [],
    currentRevisionId: null,
    geometryRefs: [],
  };
}

export function cloneDocument(doc: CadDocument): CadDocument {
  return structuredClone(doc);
}

export function paramMap(doc: CadDocument): Record<string, number> {
  return resolveParameters(doc.parameters);
}

export function findBody(doc: CadDocument, id: string) {
  return doc.bodies.find((b) => b.id === id || b.name === id);
}

export function findFeature(doc: CadDocument, id: string) {
  return doc.features.find((f) => f.id === id || f.name === id);
}

export function featureNames(doc: CadDocument) {
  return doc.features.map((f) => f.name);
}

export function bodyNames(doc: CadDocument) {
  return doc.bodies.map((b) => b.name);
}

export function allNames(doc: CadDocument) {
  return [...bodyNames(doc), ...featureNames(doc), ...doc.parameters.map((p) => p.name)];
}

export function summarizeFeature(f: Feature): string {
  switch (f.kind) {
    case "box":
      return `box ${f.length} × ${f.width} × ${f.height} mm`;
    case "cylinder":
      return `cylinder ⌀${Number(f.radius) * 2} × ${f.height} mm · ${f.axis}`;
    case "sphere":
      return `sphere r ${f.radius} mm`;
    case "sketch":
      return `sketch ${f.plane} · ${f.profiles.length} profile(s)`;
    case "pad":
      return `pad ${f.depth} mm`;
    case "pocket":
      return `pocket ${f.depth} mm`;
    case "hole": {
      const extra = f.counterbore
        ? " counterbore"
        : f.countersink
          ? " countersink"
          : f.thread
            ? ` ${f.thread}`
            : "";
      return `hole ⌀${f.diameter} on ${typeof f.face === "string" ? f.face : selectorLabel(f.face)}${f.through ? " through" : ` × ${f.depth} mm`}${extra}`;
    }
    case "fillet":
      return `fillet r ${f.radius} mm · ${selectorLabel(f.edges)}`;
    case "chamfer":
      return `chamfer ${f.distance} mm · ${selectorLabel(f.edges)}`;
    case "boolean":
      return `${f.operation} ← ${f.toolBodyId}`;
    case "pattern":
      return `${f.patternKind} ×${f.count}`;
    case "imported_solid":
      return `imported ${f.sourceFormat} · ${f.sourceName} · ${Math.round(f.volumeMm3)} mm³`;
    default:
      return (f as Feature).kind;
  }
}

export function setParam(doc: CadDocument, next: Parameter) {
  const i = doc.parameters.findIndex((p) => p.name === next.name);
  if (i >= 0) doc.parameters[i] = next;
  else doc.parameters.push(next);
}

export { featureDependsOn };
