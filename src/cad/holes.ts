import { cadError } from "./errors";
import { resolveDim } from "./expressions";
import { FACE_NAMES } from "./types";
import type { FaceFrame, FaceName, Feature, GeometrySelector } from "./types";
import { normalizeSelector, queryEnvelopeGeometry, type EnvelopeBox } from "./selectors";

export function resolveHoleUV(
  f: Extract<Feature, { kind: "hole" }>,
  face: FaceFrame,
  vars: Record<string, number>,
): { u: number; v: number } {
  if (f.centered) {
    return { u: face.width / 2, v: face.height / 2 };
  }
  let u: number;
  if (f.fromRight !== undefined) u = face.width - resolveDim(f.fromRight, vars, "from_right");
  else if (f.fromLeft !== undefined) u = resolveDim(f.fromLeft, vars, "from_left");
  else u = resolveDim(f.u, vars, "x");

  let v: number;
  if (f.fromFront !== undefined) v = face.height - resolveDim(f.fromFront, vars, "from_front");
  else if (f.fromBack !== undefined) v = resolveDim(f.fromBack, vars, "from_back");
  else v = resolveDim(f.v, vars, "y");

  return { u, v };
}

export function resolveHoleFace(
  f: Extract<Feature, { kind: "hole" }>,
  env: EnvelopeBox & { faces: FaceFrame[] },
  vars: Record<string, number>,
): FaceFrame {
  const raw = f.face;
  if (typeof raw === "string" && FACE_NAMES.includes(raw as FaceName)) {
    const face = env.faces.find((fc) => fc.name === raw);
    if (!face) {
      throw cadError("UNKNOWN_FACE", `Face '${raw}' is not available.`);
    }
    return face;
  }
  const sel = normalizeSelector(raw as GeometrySelector, "face", "top_face");
  sel.entity = "face";
  const q = queryEnvelopeGeometry(env, sel, vars);
  if (q.match_count === 0) {
    throw cadError("GEOMETRY_SELECTOR_NO_MATCH", "Hole target face selector matched nothing.", {
      selector: sel,
    });
  }
  if (q.match_count > 1) {
    const top = q.matches.find((m) => m.role === "top_face");
    if (top?.role) {
      const face = env.faces.find((fc) => fc.name === top.role);
      if (face) return face;
    }
    throw cadError(
      "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
      `Hole target face selector resolved to ${q.match_count} faces.`,
      { match_count: q.match_count, selector: sel },
    );
  }
  const role = q.matches[0]?.role;
  const face = env.faces.find((fc) => fc.name === role) ?? env.faces[0];
  if (!face) throw cadError("UNKNOWN_FACE", "No envelope face for hole.");
  return face;
}
