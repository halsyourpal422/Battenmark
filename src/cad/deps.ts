import { collectDimRefs } from "./expressions";
import type { CadDocument, Dim, Feature, GeometrySelector, Vec3Expr } from "./types";

function pushUnique(out: string[], names: string[]) {
  for (const n of names) if (n && !out.includes(n)) out.push(n);
}

function walkSelector(sel: GeometrySelector | undefined, out: string[]) {
  if (!sel || typeof sel === "string") return;
  if (sel.created_by) pushUnique(out, [sel.created_by]);
  if (sel.nearest) pushUnique(out, collectDimRefs(sel.nearest as Vec3Expr));
  if (sel.centroid_near) pushUnique(out, collectDimRefs(sel.centroid_near as Vec3Expr));
  if (sel.length_between) {
    pushUnique(out, collectDimRefs(sel.length_between.min as Dim));
    pushUnique(out, collectDimRefs(sel.length_between.max as Dim));
  }
  if (sel.adjacent_to) walkSelector(sel.adjacent_to, out);
}

export function featureDependsOn(f: Feature): string[] {
  const out: string[] = [];
  switch (f.kind) {
    case "box":
      pushUnique(out, collectDimRefs(f.length));
      pushUnique(out, collectDimRefs(f.width));
      pushUnique(out, collectDimRefs(f.height));
      pushUnique(out, collectDimRefs(f.origin));
      break;
    case "cylinder":
      pushUnique(out, collectDimRefs(f.radius));
      pushUnique(out, collectDimRefs(f.height));
      pushUnique(out, collectDimRefs(f.origin));
      break;
    case "sphere":
      pushUnique(out, collectDimRefs(f.radius));
      pushUnique(out, collectDimRefs(f.origin));
      break;
    case "sketch":
      pushUnique(out, collectDimRefs(f.origin));
      for (const pr of f.profiles) {
        if (pr.type === "rectangle") {
          pushUnique(out, collectDimRefs(pr.x));
          pushUnique(out, collectDimRefs(pr.y));
          pushUnique(out, collectDimRefs(pr.width));
          pushUnique(out, collectDimRefs(pr.height));
        } else {
          pushUnique(out, collectDimRefs(pr.cx));
          pushUnique(out, collectDimRefs(pr.cy));
          pushUnique(out, collectDimRefs(pr.radius));
        }
      }
      break;
    case "pad":
    case "pocket":
      pushUnique(out, collectDimRefs(f.depth));
      break;
    case "hole":
      pushUnique(out, collectDimRefs(f.u));
      pushUnique(out, collectDimRefs(f.v));
      pushUnique(out, collectDimRefs(f.diameter));
      pushUnique(out, collectDimRefs(f.depth));
      if (f.fromLeft) pushUnique(out, collectDimRefs(f.fromLeft));
      if (f.fromRight) pushUnique(out, collectDimRefs(f.fromRight));
      if (f.fromFront) pushUnique(out, collectDimRefs(f.fromFront));
      if (f.fromBack) pushUnique(out, collectDimRefs(f.fromBack));
      if (f.counterbore) {
        pushUnique(out, collectDimRefs(f.counterbore.diameter));
        pushUnique(out, collectDimRefs(f.counterbore.depth));
      }
      if (f.countersink) {
        pushUnique(out, collectDimRefs(f.countersink.diameter));
        pushUnique(out, collectDimRefs(f.countersink.angle));
      }
      walkSelector(typeof f.face === "string" ? undefined : f.face, out);
      break;
    case "fillet":
      pushUnique(out, collectDimRefs(f.radius));
      walkSelector(f.edges, out);
      break;
    case "chamfer":
      pushUnique(out, collectDimRefs(f.distance));
      walkSelector(f.edges, out);
      break;
    case "pattern":
      pushUnique(out, collectDimRefs(f.count as Dim));
      pushUnique(out, collectDimRefs(f.dx));
      pushUnique(out, collectDimRefs(f.dy));
      pushUnique(out, collectDimRefs(f.dz));
      if (f.countX) pushUnique(out, collectDimRefs(f.countX));
      if (f.countY) pushUnique(out, collectDimRefs(f.countY));
      if (f.spacingX) pushUnique(out, collectDimRefs(f.spacingX));
      if (f.spacingY) pushUnique(out, collectDimRefs(f.spacingY));
      break;
    default:
      break;
  }
  return out;
}

export function inspectDependencies(doc: CadDocument, name: string) {
  const param = doc.parameters.find((p) => p.name === name);
  const dependents: Array<{ kind: "parameter" | "feature"; name: string; id?: string }> = [];
  for (const p of doc.parameters) {
    if (!p.expression) continue;
    if (collectDimRefs(p.expression).includes(name)) {
      dependents.push({ kind: "parameter", name: p.name });
    }
  }
  for (const f of doc.features) {
    if (featureDependsOn(f).includes(name)) {
      dependents.push({ kind: "feature", name: f.name, id: f.id });
    }
  }
  return {
    name,
    defined: Boolean(param),
    value: param?.value ?? null,
    expression: param?.expression ?? null,
    dependents,
    feature_names: dependents.filter((d) => d.kind === "feature").map((d) => d.name),
  };
}

export function previewParameterChange(doc: CadDocument, name: string, next: number) {
  const impact = inspectDependencies(doc, name);
  return {
    name,
    from: doc.parameters.find((p) => p.name === name)?.value ?? null,
    to: next,
    affected: impact.dependents,
    note: "Preview only — no geometry was mutated.",
  };
}
