"""Battenmark build123d adapter worker (Phase 6.2).

One-shot CLI: worker.py <op> <payload.json> -> JSON on stdout.
Pure build123d/OCP — imports no FreeCAD modules, keeping dependency stacks
isolated per ADR-0004. Implements the Phase 6.2 conformance slice only:
create_box, create_cylinder, create_hole (through, axis-aligned),
fillet (top_perimeter on a boxed body), inspect, export/import STEP.
Unsupported feature kinds fail with UNSUPPORTED_FEATURE (honest gaps).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

# Dependency isolation (ADR-0004): locate the vendored build123d stack next to
# this worker when present, independent of caller environment delivery.
_VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "vendor", "b23d-py")
if os.path.isdir(_VENDOR) and _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)

from build123d import Axis, Box, Cylinder, Pos, Plane  # noqa: F401
from build123d import Solid, Compound
from build123d import fillet as bd_fillet
from build123d import import_step, export_step


class Unsupported(Exception):
    pass


def _num(v: Any, params: dict[str, float]) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    raise Unsupported(f"expression dimensions are not supported by this backend yet: {v!r}")


def _origin(o: dict[str, Any] | None, params: dict[str, float]) -> tuple[float, float, float]:
    o = o or {}
    return (_num(o.get("x", 0), params), _num(o.get("y", 0), params), _num(o.get("z", 0), params))


def _box(f: dict[str, Any], params: dict[str, float]):
    x, y, z = _origin(f.get("origin"), params)
    L = _num(f["length"], params); W = _num(f["width"], params); H = _num(f["height"], params)
    return Pos(x + L / 2, y + W / 2, z + H / 2) * Box(L, W, H)


def _cylinder(f: dict[str, Any], params: dict[str, float]):
    x, y, z = _origin(f.get("origin"), params)
    r = _num(f["radius"], params); h = _num(f["height"], params)
    axis = f.get("axis", "Z")
    if axis != "Z":
        raise Unsupported(f"cylinder axis '{axis}' not supported by this backend yet")
    return Pos(x, y, z + h / 2) * Cylinder(r, h)


def _hole(part, f: dict[str, Any], params: dict[str, float], height_hint: float):
    face = f.get("face") or f.get("target_face")
    if face not in ("top_face", "bottom_face"):
        raise Unsupported(f"hole face '{face}' not supported by this backend yet")
    d = _num(f["diameter"], params)
    if f.get("centered"):
        bb0 = part.bounding_box()
        u = (bb0.max.X - bb0.min.X) / 2
        v = (bb0.max.Y - bb0.min.Y) / 2
    else:
        u = _num(f.get("u", f.get("x_mm", 0)), params)
        v = _num(f.get("v", f.get("y_mm", 0)), params)
    through = bool(f.get("through"))
    bb = part.bounding_box()
    H = bb.max.Z - bb.min.Z
    sign = 1.0 if face == "top_face" else -1.0
    base_z = bb.max.Z if face == "top_face" else bb.min.Z
    depth = H + 2.0 if through else min(_num(f.get("depth", 0) , params), H)
    cutter = Pos(bb.min.X + u, bb.min.Y + v, base_z - sign * (depth / 2)) * Cylinder(d / 2, depth)
    return part - cutter


def _fillet_top_perimeter(part, radius: float):
    edges = part.edges().filter_by(Axis.Z).group_by(Axis.Z)[-1]
    return bd_fillet(edges, radius)


def _apply_features(doc: dict[str, Any]):
    params = {p["name"]: float(p["value"]) for p in doc.get("parameters", [])}
    parts: dict[str, Any] = {}
    meta_bodies = {b["id"]: b for b in doc.get("bodies", [])}
    for f in doc.get("features", []):
        kind = f.get("kind")
        bid = f.get("bodyId")
        if kind == "sketch":
            continue
        if kind == "boolean":
            tool_id = f.get("toolBodyId")
            op = f.get("operation")
            if op != "subtract":
                raise Unsupported(f"boolean.{op}")
            parts[bid] = parts[bid] - parts[tool_id]
            continue
        if kind == "box":
            parts.setdefault(bid, None)
            parts[bid] = _box(f, params) if parts.get(bid) is None else parts[bid] + _box(f, params)
        elif kind == "cylinder":
            solid = _cylinder(f, params)
            parts[bid] = solid if parts.get(bid) is None else parts[bid] + solid
        elif kind == "hole":
            if parts.get(bid) is None:
                raise Unsupported("hole without host solid")
            parts[bid] = _hole(parts[bid], f, params, 0)
        elif kind == "fillet":
            if parts.get(bid) is None:
                raise Unsupported("fillet without host solid")
            raw_sel = f.get("edges")
            sel = raw_sel.get("selector") if isinstance(raw_sel, dict) else raw_sel
            if sel != "top_perimeter":
                raise Unsupported(f"fillet selector '{sel}' not supported by this backend yet")
            parts[bid] = _fillet_top_perimeter(parts[bid], _num(f["radius"], params))
        elif kind == "imported_solid":
            raise Unsupported("imported_solid inside native definitions is out of the Phase 6.2 slice")
        else:
            raise Unsupported(f"feature kind '{kind}'")
    visible = [parts[bid] for bid, b in ((i, meta_bodies.get(i)) for i in parts)
               if (b is None) or (not b.get("consumed") and b.get("visible", True))]
    result = visible[0] if len(visible) == 1 else Compound(list(visible))
    return result


def _inspect(shape) -> dict[str, Any]:
    solids = shape.solids()
    volume = sum(s.volume for s in solids)
    bb = shape.bounding_box()
    return {
        "valid": all(bool(s.is_valid) for s in solids) and len(solids) > 0,
        "solid_count": len(solids),
        "volume_mm3": volume,
        "surface_area_mm2": sum(s.area for s in solids),
        "bounding_box": {
            "min": {"x": bb.min.X, "y": bb.min.Y, "z": bb.min.Z},
            "max": {"x": bb.max.X, "y": bb.max.Y, "z": bb.max.Z},
        },
        "shape_type": "Solid" if len(solids) == 1 else ("Compound" if solids else "Empty"),
    }


def main() -> None:
    op = sys.argv[1]
    payload = json.load(open(sys.argv[2]))
    if op == "hello":
        import build123d as b
        out = {"ok": True, "result": {"backend": "build123d", "version": getattr(b, "__version__", "unknown"), "kernel": "OpenCascade"}}
    elif op == "build":
        shape = _apply_features(payload.get("document") or {})
        out = {"ok": True, "result": _inspect(shape), "_shape": shape}
    elif op == "export":
        shape = _apply_features((payload.get("document") or {}))
        export_step(shape, payload["path"])
        import os
        out = {"ok": True, "result": {"format": "step", "path": payload["path"], "bytes": os.path.getsize(payload["path"])}}
    elif op == "import":
        imported = import_step(payload["path"])
        inspected = _inspect(imported)
        inspected.update({"source_format": "step", "parametric": False})
        out = {"ok": True, "result": inspected}
    else:
        print(json.dumps({"ok": False, "error": {"code": "UNKNOWN_OP", "message": op}}))
        return
    payload_out = dict(out)
    shape_obj = payload_out.pop("_shape", None)
    if shape_obj is not None and op in ("export",):
        pass
    print(json.dumps(payload_out))


if __name__ == "__main__":
    main()
