import type { CadDocument, Evaluation } from "./types";
import { featureDependsOn, summarizeFeature } from "./document";

export function inspectDocument(doc: CadDocument, evaluation?: Evaluation | null) {
  const bodyEval = new Map(evaluation?.bodies.map((b) => [b.bodyId, b]) ?? []);
  return {
    id: doc.id,
    name: doc.name,
    units: doc.units,
    parameters: doc.parameters.map((p) => ({
      name: p.name,
      value: p.value,
      unit: p.unit,
      expression: p.expression ?? null,
    })),
    bodies: doc.bodies.map((b) => {
      const ev = bodyEval.get(b.id);
      return {
        id: b.id,
        name: b.name,
        visible: b.visible,
        consumed: b.consumed,
        volume_mm3: ev ? round(ev.volumeMm3) : null,
        bbox: ev?.bbox ?? null,
        triangle_count: ev?.triangleCount ?? null,
        valid: ev?.valid ?? null,
        features: doc.features
          .filter((f) => f.bodyId === b.id)
          .map((f) => ({
            id: f.id,
            name: f.name,
            kind: f.kind,
            summary: summarizeFeature(f),
            suppressed: f.suppressed,
            depends_on: featureDependsOn(f),
            placement:
              f.kind === "box" || f.kind === "cylinder" || f.kind === "sphere" || f.kind === "sketch"
                ? f.origin
                : undefined,
          })),
      };
    }),
    feature_count: doc.features.length,
    revision_count: doc.revisions.length,
    current_revision: doc.currentRevisionId,
    validation: evaluation
      ? {
          ok: evaluation.ok,
          issues: evaluation.issues,
          volume_mm3: round(evaluation.volumeMm3),
          triangle_count: evaluation.triangleCount,
        }
      : null,
  };
}

export function inspectBody(doc: CadDocument, bodyId: string, evaluation?: Evaluation | null) {
  const full = inspectDocument(doc, evaluation);
  const body = full.bodies.find((b) => b.id === bodyId || b.name === bodyId);
  return body ?? null;
}

export function inspectFeature(doc: CadDocument, featureId: string) {
  const f = doc.features.find((x) => x.id === featureId || x.name === featureId);
  if (!f) return null;
  return { ...f, summary: summarizeFeature(f) };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
