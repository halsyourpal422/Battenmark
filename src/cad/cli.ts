import type { FaceName, Operation } from "./types";
import { FACE_NAMES } from "./types";

function flagMap(tokens: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = tokens[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function num(v: string | boolean | undefined, fallback?: number) {
  if (v === undefined || v === true) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got '${v}'`);
  return n;
}

function str(v: string | boolean | undefined) {
  if (v === undefined || v === true) return undefined;
  return String(v);
}

export function parseCli(input: string): Operation {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.replace(/^agentcad\s+/, "") ?? "";
  const rest = cmd === "agentcad" ? parts.slice(1) : parts;
  const verb = (rest[0] ?? "").toLowerCase();
  const args = rest.slice(1);
  const f = flagMap(args);
  const positional = args.filter((a) => !a.startsWith("--") && !Object.values(f).includes(a));

  switch (verb) {
    case "box":
      return {
        op: "create_box",
        name: str(f.name),
        body_id: str(f.body),
        length_mm: num(f.length ?? f.l, 40)!,
        width_mm: num(f.width ?? f.w, 20)!,
        height_mm: num(f.height ?? f.h, 10)!,
      };
    case "cylinder":
    case "cyl":
      return {
        op: "create_cylinder",
        name: str(f.name),
        radius_mm: num(f.radius ?? f.r, 5)!,
        height_mm: num(f.height ?? f.h, 10)!,
        axis: (str(f.axis) as "X" | "Y" | "Z") ?? "Z",
      };
    case "sphere":
      return {
        op: "create_sphere",
        name: str(f.name),
        radius_mm: num(f.radius ?? f.r, 10)!,
      };
    case "hole": {
      const face = (str(f.face) ?? "top_face") as FaceName;
      if (!FACE_NAMES.includes(face)) throw new Error(`Unknown face '${face}'`);
      return {
        op: "create_hole",
        body_id: str(f.body) ?? positional[0] ?? "Body",
        face,
        x_mm: num(f.x, 10)!,
        y_mm: num(f.y, 10)!,
        diameter_mm: num(f.diameter ?? f.d, 3.2)!,
        through: f.through === true || f.through === "true" || f.depth === undefined,
        depth_mm: num(f.depth),
        name: str(f.name),
      };
    }
    case "fillet":
      return {
        op: "fillet",
        body_id: str(f.body) ?? "Body",
        radius_mm: num(f.radius ?? f.r, 2)!,
      };
    case "chamfer":
      return {
        op: "chamfer",
        body_id: str(f.body) ?? "Body",
        distance_mm: num(f.distance ?? f.d, 1)!,
      };
    case "pad":
      return { op: "pad", sketch_id: str(f.sketch) ?? positional[0] ?? "", depth_mm: num(f.depth, 10)! };
    case "pocket":
      return { op: "pocket", sketch_id: str(f.sketch) ?? positional[0] ?? "", depth_mm: num(f.depth, 5)! };
    case "param":
    case "set":
      if (positional[0] && positional[1]) {
        return { op: "set_parameter", name: positional[0], value: Number(positional[1]) };
      }
      return { op: "define_parameter", name: str(f.name) ?? positional[0] ?? "p", value: num(f.value, 1)! };
    case "inspect":
      return { op: "inspect_document" };
    case "validate":
      return { op: "validate" };
    case "export":
      if ((str(f.format) ?? positional[0] ?? "stl") === "obj") return { op: "export_obj" };
      if ((str(f.format) ?? positional[0]) === "json") return { op: "export_json" };
      if ((str(f.format) ?? positional[0]) === "step") return { op: "export_step" };
      if ((str(f.format) ?? positional[0]) === "fcstd") return { op: "export_fcstd" };
      return { op: "export_stl" };
    case "undo":
    case "rollback":
      return { op: "rollback_revision", revision_id: positional[0] ?? "" };
    case "save":
      return { op: "save_revision", label: positional.join(" ") || "checkpoint" };
    case "body":
      return { op: "create_body", name: positional[0] ?? str(f.name) };
    default:
      throw new Error(
        `Unknown command '${verb}'. Try: box, cylinder, sphere, hole, fillet, chamfer, param, inspect, validate, export, save.`,
      );
  }
}
