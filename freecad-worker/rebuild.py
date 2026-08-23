"""Translate an AgentCAD document into a parametric FreeCAD feature tree."""

from __future__ import annotations

import math
import os
from typing import Any

import FreeCAD as App
import Part

from geom import (
    add_vec,
    box_faces,
    dim_text,
    fc_name,
    GeomError,
    hole_uv,
    resolve_dim,
    resolve_params,
    resolve_vec3,
    scale_vec,
    to_freecad_expr,
)
from partdesign import is_pd_eligible, rebuild_pd_body
from selectors import (
    SelectorError,
    normalize_selector,
    pick_edges,
    selector_kind,
)

OVER = 0.08


def _edge_pairs(edges, picked, value):
    """Map picked OCC edges onto 1-based indices of `edges` via isEqual (wrapper ids are not stable)."""
    pairs = []
    for i, e in enumerate(edges, 1):
        try:
            if any(e.isEqual(p) for p in picked):
                pairs.append((i, value, value))
        except Exception:
            continue
    return pairs


class RebuildError(Exception):
    def __init__(self, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


def _vector(d: dict[str, float]) -> App.Vector:
    return App.Vector(d["x"], d["y"], d["z"])


def _align_z(placement: App.Placement, direction: dict[str, float]) -> None:
    z = App.Vector(0, 0, 1)
    d = App.Vector(direction["x"], direction["y"], direction["z"])
    if d.Length < 1e-12:
        return
    d.normalize()
    dot = z.dot(d)
    if dot > 0.999999:
        return
    if dot < -0.999999:
        placement.Rotation = App.Rotation(App.Vector(1, 0, 0), 180)
        return
    axis = z.cross(d)
    angle = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
    placement.Rotation = App.Rotation(axis, angle)


def _set_dim(obj, prop: str, value: Any, params: dict[str, float], param_names: set[str]) -> None:
    if isinstance(value, str) and any(name in value for name in param_names):
        expr = to_freecad_expr(value, param_names)
        obj.setExpression(prop, expr)
        setattr(obj, prop, resolve_dim(value, params, prop))
    else:
        setattr(obj, prop, resolve_dim(value, params, prop))


def _hide(obj) -> None:
    try:
        if hasattr(obj, "ViewObject") and obj.ViewObject is not None:
            obj.ViewObject.Visibility = False
        elif hasattr(obj, "Visibility"):
            obj.Visibility = False
    except Exception:
        pass


def _is_vertical_edge(edge, tol: float = 1e-5) -> bool:
    try:
        t = edge.tangentAt(edge.FirstParameter)
        return abs(t.x) <= tol and abs(t.y) <= tol and abs(abs(t.z) - 1) <= 0.05
    except Exception:
        return False


def _tag(obj, agent_id: str, kind: str) -> None:
    try:
        if "AgentCadId" not in obj.PropertiesList:
            obj.addProperty("App::PropertyString", "AgentCadId", "AgentCAD")
        obj.AgentCadId = agent_id
        if "AgentCadKind" not in obj.PropertiesList:
            obj.addProperty("App::PropertyString", "AgentCadKind", "AgentCAD")
        obj.AgentCadKind = kind
    except Exception:
        pass


def _set_placement(obj, origin: Any, params: dict[str, float], param_names: set[str]) -> dict[str, float]:
    resolved_o = resolve_vec3(origin, params)
    pl = obj.Placement
    pl.Base = _vector(resolved_o)
    obj.Placement = pl
    origin = origin or {}
    for axis in ("x", "y", "z"):
        text = dim_text(origin.get(axis) if isinstance(origin, dict) else None)
        if text:
            try:
                obj.setExpression(f"Placement.Base.{axis}", to_freecad_expr(text, param_names))
            except Exception:
                pass
    return resolved_o


def close_all_documents() -> None:
    for _ in range(4):
        names = list(App.listDocuments().keys())
        if not names:
            return
        for name in names:
            try:
                App.closeDocument(name)
            except Exception:
                pass


def _spreadsheet(doc, params: list[dict[str, Any]], resolved: dict[str, float]):
    sheet = doc.addObject("Spreadsheet::Sheet", "Params")
    sheet.Label = "Params"
    for i, p in enumerate(params):
        row = i + 1
        sheet.set(f"A{row}", p["name"])
        sheet.set(f"B{row}", str(resolved[p["name"]]))
        try:
            sheet.setAlias(f"B{row}", p["name"])
        except Exception:
            pass
        unit = p.get("unit") or "mm"
        sheet.set(f"C{row}", unit)
    return sheet


def rebuild(document: dict[str, Any]) -> dict[str, Any]:
    """Build a FreeCAD document from an AgentCAD JSON document. Returns mapping + meta."""
    close_all_documents()
    name = document.get("name") or "AgentCAD"
    safe = fc_name(name, set(), "AgentCAD")
    doc = App.newDocument(safe)
    doc.Label = name

    parameters = document.get("parameters") or []
    resolved = resolve_params(parameters)
    param_names = set(resolved.keys())
    if parameters:
        _spreadsheet(doc, parameters, resolved)

    used_names: set[str] = {"Params"}
    mapping: dict[str, str] = {}
    envelopes: dict[str, Any] = {}
    tips: dict[str, Any] = {}
    body_meta: list[dict[str, Any]] = []
    feature_meta: list[dict[str, Any]] = []
    sketches: dict[str, Any] = {}
    issues: list[dict[str, Any]] = []
    fillet_of: dict[str, Any] = {}
    chamfer_of: dict[str, Any] = {}
    edge_mod_applied: set[str] = set()

    for body in document.get("bodies") or []:
        body_meta.append({
            "id": body["id"],
            "name": body.get("name"),
            "consumed": bool(body.get("consumed")),
            "tip": None,
        })

    def tip_of(body_id: str):
        return tips.get(body_id)

    def set_tip(body_id: str, obj) -> None:
        tips[body_id] = obj
        for b in body_meta:
            if b["id"] == body_id:
                b["tip"] = obj.Name

    def remember(agent_id: str, obj, kind: str, extra: dict[str, Any] | None = None) -> None:
        mapping[agent_id] = obj.Name
        rec = {"id": agent_id, "name": getattr(obj, "Label", obj.Name), "kind": kind, "freecad_name": obj.Name}
        if extra:
            rec.update(extra)
        feature_meta.append(rec)

    def apply_edge_mod(body_id: str, base) -> Any:
        """Fillet/chamfer the originating solid so later cuts keep outer rounds."""
        if body_id in edge_mod_applied:
            return base
        feat = fillet_of.get(body_id)
        kind = "fillet"
        if feat is None:
            feat = chamfer_of.get(body_id)
            kind = "chamfer"
        if feat is None:
            return base
        fname = feat.get("name") or kind
        fid = feat.get("id") or ""
        doc.recompute()
        shape = base.Shape
        if shape is None or shape.isNull():
            return base
        mode = feat.get("edges") or feat.get("target") or "all_vertical"
        edges = list(shape.Edges)
        try:
            picked = pick_edges(shape, mode, resolved, created_by=None)
        except SelectorError as err:
            if err.code in (
                "GEOMETRY_REFERENCE_LOST",
                "GEOMETRY_REFERENCE_AMBIGUOUS",
                "GEOMETRY_SELECTOR_NO_MATCH",
                "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
                "INVALID_GEOMETRY_SELECTOR",
            ):
                raise RebuildError(err.code, err.message, **err.extra)
            kind_sel = selector_kind(normalize_selector(mode, "edge", "all_vertical"))
            picked = [e for e in edges if _is_vertical_edge(e)] if kind_sel == "all_vertical" else []
        if not picked:
            raise RebuildError(
                "GEOMETRY_SELECTOR_NO_MATCH",
                f"{fname}: no edges matched selector.",
                feature=fname,
            )
        env = envelopes.get(body_id)
        if kind == "fillet":
            radius = resolve_dim(feat.get("radius"), resolved, "radius")
            if env:
                max_r = min(env["L"], env["W"], env["H"]) / 2.0 - 0.05
                if radius > max_r:
                    raise RebuildError(
                        "FILLET_RADIUS_TOO_LARGE",
                        f"{fname}: fillet radius {radius} mm exceeds maximum {max_r:.2f} mm for this box.",
                        feature=fname,
                        requested_radius_mm=radius,
                        suggestion=f"Use a radius below {max_r:.2f} mm or enlarge the box.",
                    )
            obj = doc.addObject("Part::Fillet", fc_name(fname, used_names, "Fillet"))
            obj.Label = fname
            obj.Base = base
            obj.Edges = _edge_pairs(edges, picked, radius)
            if not obj.Edges:
                doc.removeObject(obj.Name)
                raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: could not bind filleted edges.", feature=fname)
            _tag(obj, fid, "fillet")
            doc.recompute()
            if obj.Shape is None or obj.Shape.isNull() or not obj.Shape.isValid():
                doc.removeObject(obj.Name)
                raise RebuildError(
                    "FILLET_FAILED",
                    f"{fname}: the requested fillet could not be constructed.",
                    feature=fname,
                    requested_radius_mm=radius,
                )
            remember(fid, obj, "fillet")
            edge_mod_applied.add(body_id)
            return obj
        dist = resolve_dim(feat.get("distance"), resolved, "distance")
        if env:
            max_d = min(env["L"], env["W"]) / 2.0 - 0.05
            if dist > max_d:
                raise RebuildError(
                    "CHAMFER_DISTANCE_TOO_LARGE",
                    f"{fname}: chamfer {dist} mm exceeds maximum {max_d:.2f} mm.",
                    feature=fname,
                    suggestion=f"Use a distance below {max_d:.2f} mm.",
                )
        obj = doc.addObject("Part::Chamfer", fc_name(fname, used_names, "Chamfer"))
        obj.Label = fname
        obj.Base = base
        obj.Edges = _edge_pairs(edges, picked, dist)
        if not obj.Edges:
            doc.removeObject(obj.Name)
            raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: could not bind chamfered edges.", feature=fname)
        _tag(obj, fid, "chamfer")
        doc.recompute()
        if obj.Shape is None or obj.Shape.isNull() or not obj.Shape.isValid():
            doc.removeObject(obj.Name)
            raise RebuildError(
                "CHAMFER_FAILED",
                f"{fname}: the requested chamfer could not be constructed.",
                feature=fname,
                requested_distance_mm=dist,
            )
        remember(fid, obj, "chamfer")
        edge_mod_applied.add(body_id)
        return obj

    features = [f for f in (document.get("features") or []) if not f.get("suppressed")]
    pd_body_ids = {
        b["id"]
        for b in (document.get("bodies") or [])
        if is_pd_eligible(b["id"], features)
    }

    for body in document.get("bodies") or []:
        if body["id"] not in pd_body_ids:
            continue
        env = rebuild_pd_body(
            doc,
            body,
            features,
            resolved,
            param_names,
            used_names,
            remember,
            set_tip,
            issues,
        )
        if env:
            envelopes[body["id"]] = env

    for f in features:
        if f.get("kind") == "sketch":
            sketches[f["id"]] = f
        if f.get("kind") == "fillet" and f.get("bodyId") not in pd_body_ids:
            fillet_of[f.get("bodyId")] = f
        if f.get("kind") == "chamfer" and f.get("bodyId") not in pd_body_ids:
            chamfer_of[f.get("bodyId")] = f

    for f in features:
        kind = f.get("kind")
        fid = f.get("id") or ""
        fname = f.get("name") or kind or "Feature"
        body_id = f.get("bodyId")
        if body_id in pd_body_ids and kind in ("box", "hole", "fillet", "chamfer", "pattern"):
            continue
        try:
            if kind == "box":
                obj = doc.addObject("Part::Box", fc_name(fname, used_names, "Box"))
                obj.Label = fname
                _set_dim(obj, "Length", f.get("length"), resolved, param_names)
                _set_dim(obj, "Width", f.get("width"), resolved, param_names)
                _set_dim(obj, "Height", f.get("height"), resolved, param_names)
                origin = _set_placement(obj, f.get("origin"), resolved, param_names)
                _tag(obj, fid, "box")
                L = float(obj.Length)
                W = float(obj.Width)
                H = float(obj.Height)
                if body_id not in envelopes:
                    envelopes[body_id] = {
                        "origin": origin,
                        "L": L,
                        "W": W,
                        "H": H,
                        "faces": box_faces(origin, L, W, H),
                    }
                prev = tip_of(body_id)
                if prev is None:
                    set_tip(body_id, obj)
                    remember(fid, obj, "box", {"summary": f"box {L} × {W} × {H} mm"})
                    try:
                        edged = apply_edge_mod(body_id, obj)
                        if edged is not obj:
                            set_tip(body_id, edged)
                    except RebuildError as err:
                        issues.append({"severity": "error", **err.as_dict(), "feature": fname})
                else:
                    fuse = doc.addObject("Part::Fuse", fc_name(f"{fname}_Join", used_names, "Fuse"))
                    fuse.Label = f"{fname} join"
                    fuse.Base = prev
                    fuse.Tool = obj
                    _hide(obj)
                    _tag(fuse, fid, "box")
                    set_tip(body_id, fuse)
                    remember(fid, obj, "box", {"summary": f"box {L} × {W} × {H} mm"})

            elif kind == "cylinder":
                obj = doc.addObject("Part::Cylinder", fc_name(fname, used_names, "Cylinder"))
                obj.Label = fname
                _set_dim(obj, "Radius", f.get("radius"), resolved, param_names)
                _set_dim(obj, "Height", f.get("height"), resolved, param_names)
                origin = resolve_vec3(f.get("origin"), resolved)
                axis = (f.get("axis") or "Z").upper()
                pl = App.Placement()
                if axis == "X":
                    pl.Rotation = App.Rotation(App.Vector(0, 1, 0), 90)
                elif axis == "Y":
                    pl.Rotation = App.Rotation(App.Vector(1, 0, 0), -90)
                pl.Base = _vector(origin)
                obj.Placement = pl
                for ax in ("x", "y", "z"):
                    text = dim_text((f.get("origin") or {}).get(ax) if isinstance(f.get("origin"), dict) else None)
                    if text:
                        try:
                            obj.setExpression(f"Placement.Base.{ax}", to_freecad_expr(text, param_names))
                        except Exception:
                            pass
                _tag(obj, fid, "cylinder")
                prev = tip_of(body_id)
                if prev is None:
                    set_tip(body_id, obj)
                else:
                    fuse = doc.addObject("Part::Fuse", fc_name(f"{fname}_Join", used_names, "Fuse"))
                    fuse.Base = prev
                    fuse.Tool = obj
                    _hide(obj)
                    set_tip(body_id, fuse)
                remember(fid, obj, "cylinder")

            elif kind == "sphere":
                obj = doc.addObject("Part::Sphere", fc_name(fname, used_names, "Sphere"))
                obj.Label = fname
                _set_dim(obj, "Radius", f.get("radius"), resolved, param_names)
                origin = _set_placement(obj, f.get("origin"), resolved, param_names)
                _tag(obj, fid, "sphere")
                prev = tip_of(body_id)
                if prev is None:
                    set_tip(body_id, obj)
                else:
                    fuse = doc.addObject("Part::Fuse", fc_name(f"{fname}_Join", used_names, "Fuse"))
                    fuse.Base = prev
                    fuse.Tool = obj
                    _hide(obj)
                    set_tip(body_id, fuse)
                remember(fid, obj, "sphere")

            elif kind == "sketch":
                obj = doc.addObject("Sketcher::SketchObject", fc_name(fname, used_names, "Sketch"))
                obj.Label = fname
                origin = _set_placement(obj, f.get("origin"), resolved, param_names)
                plane = f.get("plane") or "XY"
                pl = obj.Placement
                if plane == "XZ":
                    pl.Rotation = App.Rotation(App.Vector(1, 0, 0), 90)
                elif plane == "YZ":
                    pl.Rotation = App.Rotation(App.Vector(0, 1, 0), 90)
                obj.Placement = pl
                for pr in f.get("profiles") or []:
                    if pr.get("type") == "rectangle":
                        x = resolve_dim(pr.get("x"), resolved, "x")
                        y = resolve_dim(pr.get("y"), resolved, "y")
                        w = resolve_dim(pr.get("width"), resolved, "width")
                        h = resolve_dim(pr.get("height"), resolved, "height")
                        pts = [
                            App.Vector(x, y, 0),
                            App.Vector(x + w, y, 0),
                            App.Vector(x + w, y + h, 0),
                            App.Vector(x, y + h, 0),
                        ]
                        for i in range(4):
                            obj.addGeometry(Part.LineSegment(pts[i], pts[(i + 1) % 4]), False)
                    elif pr.get("type") == "circle":
                        cx = resolve_dim(pr.get("cx"), resolved, "cx")
                        cy = resolve_dim(pr.get("cy"), resolved, "cy")
                        r = resolve_dim(pr.get("radius"), resolved, "radius")
                        obj.addGeometry(Part.Circle(App.Vector(cx, cy, 0), App.Vector(0, 0, 1), r), False)
                _tag(obj, fid, "sketch")
                sketches[fid] = {**f, "_obj": obj}
                remember(fid, obj, "sketch")

            elif kind == "pad":
                sketch = sketches.get(f.get("sketchId"))
                if not sketch or "_obj" not in sketch:
                    raise RebuildError("UNKNOWN_SKETCH", f"{fname}: sketch not found.")
                depth = resolve_dim(f.get("depth"), resolved, "depth")
                reverse = bool(f.get("reverse"))
                ext = doc.addObject("Part::Extrusion", fc_name(fname, used_names, "Pad"))
                ext.Label = fname
                ext.Base = sketch["_obj"]
                ext.Solid = True
                dir_z = -1 if reverse else 1
                plane = sketch.get("plane") or "XY"
                if plane == "XY":
                    ext.Dir = App.Vector(0, 0, dir_z)
                elif plane == "XZ":
                    ext.Dir = App.Vector(0, dir_z, 0)
                else:
                    ext.Dir = App.Vector(dir_z, 0, 0)
                _set_dim(ext, "LengthFwd", f.get("depth"), resolved, param_names)
                _tag(ext, fid, "pad")
                prev = tip_of(body_id)
                if prev is None:
                    set_tip(body_id, ext)
                else:
                    fuse = doc.addObject("Part::Fuse", fc_name(f"{fname}_Join", used_names, "Fuse"))
                    fuse.Base = prev
                    fuse.Tool = ext
                    set_tip(body_id, fuse)
                if body_id not in envelopes:
                    profiles = sketch.get("profiles") or []
                    rect = next((p for p in profiles if p.get("type") == "rectangle"), None)
                    if rect:
                        x = resolve_dim(rect.get("x"), resolved, "x")
                        y = resolve_dim(rect.get("y"), resolved, "y")
                        w = resolve_dim(rect.get("width"), resolved, "width")
                        h = resolve_dim(rect.get("height"), resolved, "height")
                        origin = add_vec(resolve_vec3(sketch.get("origin"), resolved), {"x": x, "y": y, "z": 0})
                        envelopes[body_id] = {
                            "origin": origin,
                            "L": w,
                            "W": h,
                            "H": depth,
                            "faces": box_faces(origin, w, h, depth),
                        }
                remember(fid, ext, "pad")

            elif kind == "pocket":
                sketch = sketches.get(f.get("sketchId"))
                if not sketch or "_obj" not in sketch:
                    raise RebuildError("UNKNOWN_SKETCH", f"{fname}: sketch not found.")
                prev = tip_of(body_id)
                if prev is None:
                    raise RebuildError("BOOLEAN_MISSING_SOLID", f"{fname}: body has no solid to cut.")
                ext = doc.addObject("Part::Extrusion", fc_name(fname + "Tool", used_names, "PocketTool"))
                ext.Base = sketch["_obj"]
                ext.Solid = True
                plane = sketch.get("plane") or "XY"
                if plane == "XY":
                    ext.Dir = App.Vector(0, 0, 1)
                elif plane == "XZ":
                    ext.Dir = App.Vector(0, 1, 0)
                else:
                    ext.Dir = App.Vector(1, 0, 0)
                _set_dim(ext, "LengthFwd", f.get("depth"), resolved, param_names)
                _hide(ext)
                cut = doc.addObject("Part::Cut", fc_name(fname, used_names, "Pocket"))
                cut.Label = fname
                cut.Base = prev
                cut.Tool = ext
                _tag(cut, fid, "pocket")
                set_tip(body_id, cut)
                remember(fid, cut, "pocket")

            elif kind == "hole":
                env = envelopes.get(body_id)
                if not env:
                    raise RebuildError(
                        "UNKNOWN_FACE",
                        f"{fname}: body has no envelope faces yet. Create a box or pad first.",
                        feature=fname,
                    )
                face_raw = f.get("face") or "top_face"
                face_name = face_raw if isinstance(face_raw, str) else (face_raw.get("selector") if isinstance(face_raw, dict) else "top_face")
                face = next((fc for fc in env["faces"] if fc["name"] == face_name), None)
                if not face and isinstance(face_raw, str) and "face" not in str(face_raw):
                    face = next((fc for fc in env["faces"] if fc["name"] == "top_face"), None)
                if not face:
                    raise RebuildError("UNKNOWN_FACE", f"{fname}: face '{face_name}' is not available.")
                dia = resolve_dim(f.get("diameter"), resolved, "diameter")
                u, v = hole_uv(f, face, resolved)
                r = dia / 2.0
                if dia >= min(face["width"], face["height"]):
                    raise RebuildError(
                        "HOLE_DIAMETER_INVALID",
                        f"{fname}: diameter {dia} mm is larger than the {face_name} ({face['width']} × {face['height']} mm).",
                        feature=fname,
                    )
                if u < r or v < r or u > face["width"] - r or v > face["height"] - r:
                    raise RebuildError(
                        "HOLE_OUTSIDE_FACE",
                        f"{fname}: center ({u}, {v}) with ⌀{dia} does not fit on {face_name} "
                        f"({face['width']} × {face['height']} mm). Coordinates start at the min-corner of the face.",
                        feature=fname,
                        suggestion=(
                            f"Keep x between {r:.1f} and {face['width'] - r:.1f}, "
                            f"y between {r:.1f} and {face['height'] - r:.1f}."
                        ),
                    )
                through = bool(f.get("through"))
                if f.get("holeType") == "blind":
                    through = False
                if f.get("holeType") == "through":
                    through = True
                depth = face["thickness"] if through else resolve_dim(f.get("depth") or 0, resolved, "depth")
                if not through and depth > face["thickness"] + 1e-6:
                    issues.append({
                        "severity": "warning",
                        "code": "POCKET_DEPTH_EXCEEDS_BODY",
                        "message": f"{fname}: blind depth {depth} mm exceeds thickness {face['thickness']} mm; treating as through.",
                    })
                    through = True
                    depth = face["thickness"]
                prev = tip_of(body_id)
                if prev is None:
                    raise RebuildError("BOOLEAN_MISSING_SOLID", f"{fname}: body has no solid to cut.")
                cut_len = (face["thickness"] if through else depth) + 2 * OVER
                P = add_vec(face["origin"], add_vec(scale_vec(face["uDir"], u), scale_vec(face["vDir"], v)))
                inward = scale_vec(face["normal"], -1)
                start = add_vec(P, scale_vec(inward, -OVER))
                tool = doc.addObject("Part::Cylinder", fc_name(fname + "Tool", used_names, "HoleTool"))
                tool.Label = f"{fname} tool"
                tool.Radius = r
                if isinstance(f.get("diameter"), str) and param_names:
                    tool.setExpression("Radius", f"({to_freecad_expr(str(f.get('diameter')), param_names)}) / 2")
                tool.Height = cut_len
                pl = App.Placement()
                pl.Base = _vector(start)
                _align_z(pl, inward)
                tool.Placement = pl
                _hide(tool)
                cut = doc.addObject("Part::Cut", fc_name(fname, used_names, "Hole"))
                cut.Label = fname
                cut.Base = prev
                cut.Tool = tool
                _tag(cut, fid, "hole")
                set_tip(body_id, cut)
                remember(fid, cut, "hole", {"summary": f"hole ⌀{dia} on {face_name}"})
                cb = f.get("counterbore")
                if cb:
                    cb_r = resolve_dim(cb.get("diameter"), resolved, "counterbore.diameter") / 2.0
                    cb_d = resolve_dim(cb.get("depth"), resolved, "counterbore.depth")
                    if cb_r <= r:
                        raise RebuildError("HOLE_CONFIGURATION_INVALID", f"{fname}: counterbore diameter must exceed the hole.")
                    cb_tool = doc.addObject("Part::Cylinder", fc_name(fname + "CBore", used_names, "CBore"))
                    cb_tool.Radius = cb_r
                    cb_tool.Height = cb_d + OVER
                    cb_pl = App.Placement()
                    cb_start = add_vec(P, scale_vec(inward, -OVER * 0.25))
                    cb_pl.Base = _vector(cb_start)
                    _align_z(cb_pl, inward)
                    cb_tool.Placement = cb_pl
                    _hide(cb_tool)
                    cb_cut = doc.addObject("Part::Cut", fc_name(fname + "CBoreCut", used_names, "CBoreCut"))
                    cb_cut.Base = tip_of(body_id)
                    cb_cut.Tool = cb_tool
                    set_tip(body_id, cb_cut)

            elif kind == "fillet":
                if body_id in edge_mod_applied:
                    continue
                prev = tip_of(body_id)
                if prev is None:
                    raise RebuildError("BOOLEAN_MISSING_SOLID", f"{fname}: nothing to fillet.")
                radius = resolve_dim(f.get("radius"), resolved, "radius")
                doc.recompute()
                shape = prev.Shape
                if shape is None or shape.isNull():
                    raise RebuildError("FILLET_FAILED", f"{fname}: base shape is null.", feature=fname)
                mode = f.get("edges") or f.get("target") or "all_vertical"
                edges = list(shape.Edges)
                try:
                    picked = pick_edges(shape, mode, resolved)
                except SelectorError as err:
                    raise RebuildError(err.code, err.message, **err.extra)
                if not picked:
                    raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: no edges to fillet.", feature=fname)
                env = envelopes.get(body_id)
                if env:
                    max_r = min(env["L"], env["W"], env["H"]) / 2.0 - 0.05
                    if radius > max_r:
                        raise RebuildError(
                            "FILLET_RADIUS_TOO_LARGE",
                            f"{fname}: fillet radius {radius} mm exceeds maximum {max_r:.2f} mm for this box.",
                            feature=fname,
                            requested_radius_mm=radius,
                            suggestion=f"Use a radius below {max_r:.2f} mm or enlarge the box.",
                        )
                fil = doc.addObject("Part::Fillet", fc_name(fname, used_names, "Fillet"))
                fil.Label = fname
                fil.Base = prev
                fil.Edges = _edge_pairs(edges, picked, radius)
                if not fil.Edges:
                    doc.removeObject(fil.Name)
                    raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: could not bind filleted edges.", feature=fname)
                _tag(fil, fid, "fillet")
                doc.recompute()
                if fil.Shape is None or fil.Shape.isNull() or not fil.Shape.isValid():
                    raise RebuildError(
                        "FILLET_FAILED",
                        f"{fname}: the requested fillet could not be constructed.",
                        feature=fname,
                        requested_radius_mm=radius,
                    )
                set_tip(body_id, fil)
                remember(fid, fil, "fillet")

            elif kind == "chamfer":
                if body_id in edge_mod_applied:
                    continue
                prev = tip_of(body_id)
                if prev is None:
                    raise RebuildError("BOOLEAN_MISSING_SOLID", f"{fname}: nothing to chamfer.")
                dist = resolve_dim(f.get("distance"), resolved, "distance")
                doc.recompute()
                shape = prev.Shape
                mode = f.get("edges") or f.get("target") or "all_vertical"
                edges = list(shape.Edges)
                try:
                    picked = pick_edges(shape, mode, resolved)
                except SelectorError as err:
                    raise RebuildError(err.code, err.message, **err.extra)
                if not picked:
                    raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: no edges to chamfer.", feature=fname)
                env = envelopes.get(body_id)
                if env:
                    max_d = min(env["L"], env["W"]) / 2.0 - 0.05
                    if dist > max_d:
                        raise RebuildError(
                            "CHAMFER_DISTANCE_TOO_LARGE",
                            f"{fname}: chamfer {dist} mm exceeds maximum {max_d:.2f} mm.",
                            feature=fname,
                            suggestion=f"Use a distance below {max_d:.2f} mm.",
                        )
                ch = doc.addObject("Part::Chamfer", fc_name(fname, used_names, "Chamfer"))
                ch.Label = fname
                ch.Base = prev
                ch.Edges = _edge_pairs(edges, picked, dist)
                if not ch.Edges:
                    doc.removeObject(ch.Name)
                    raise RebuildError("GEOMETRY_SELECTOR_NO_MATCH", f"{fname}: could not bind chamfered edges.", feature=fname)
                _tag(ch, fid, "chamfer")
                doc.recompute()
                if ch.Shape is None or ch.Shape.isNull() or not ch.Shape.isValid():
                    raise RebuildError(
                        "CHAMFER_FAILED",
                        f"{fname}: the requested chamfer could not be constructed.",
                        feature=fname,
                        requested_distance_mm=dist,
                    )
                set_tip(body_id, ch)
                remember(fid, ch, "chamfer")

            elif kind == "boolean":
                target_id = body_id
                tool_id = f.get("toolBodyId")
                target = tip_of(target_id)
                tool = tip_of(tool_id)
                if target is None or tool is None:
                    raise RebuildError(
                        "BOOLEAN_MISSING_SOLID",
                        f"{fname}: both bodies must have solid geometry.",
                        feature=fname,
                    )
                op = f.get("operation") or "union"
                type_id = {"union": "Part::Fuse", "subtract": "Part::Cut", "intersect": "Part::Common"}.get(op)
                if not type_id:
                    raise RebuildError("INVALID_REFERENCE", f"Unknown boolean operation '{op}'.")
                obj = doc.addObject(type_id, fc_name(fname, used_names, "Boolean"))
                obj.Label = fname
                obj.Base = target
                obj.Tool = tool
                _tag(obj, fid, "boolean")
                if f.get("consumeTool", True):
                    _hide(tool)
                    for b in body_meta:
                        if b["id"] == tool_id:
                            b["consumed"] = True
                set_tip(target_id, obj)
                remember(fid, obj, "boolean")

            elif kind == "pattern":
                src_id = f.get("sourceFeatureId")
                src = next((x for x in features if x.get("id") == src_id), None)
                if src is None:
                    raise RebuildError("UNKNOWN_FEATURE", f"{fname}: source feature not found.")
                kind_pat = f.get("patternKind") or "linear"
                if src.get("kind") != "hole":
                    issues.append({
                        "severity": "warning",
                        "code": "PATTERN_PARTIAL",
                        "message": f"{fname}: CSG pattern currently supports hole sources.",
                    })
                    continue
                env = envelopes.get(body_id)
                if not env:
                    raise RebuildError("UNKNOWN_FACE", f"{fname}: body has no envelope.")
                face_raw = src.get("face") or "top_face"
                face_name = face_raw if isinstance(face_raw, str) else (
                    face_raw.get("selector") if isinstance(face_raw, dict) else "top_face"
                )
                face = next((fc for fc in env["faces"] if fc["name"] == face_name), env["faces"][1] if env.get("faces") else None)
                if not face:
                    raise RebuildError("UNKNOWN_FACE", f"{fname}: hole face not found.")
                dia = resolve_dim(src.get("diameter"), resolved, "diameter")
                u0, v0 = hole_uv(src, face, resolved)
                through = bool(src.get("through"))
                if src.get("holeType") == "blind":
                    through = False
                depth = face["thickness"] if through else resolve_dim(src.get("depth") or 0, resolved, "depth")
                offsets: list[tuple[float, float]] = []
                if kind_pat == "rectangular":
                    nx = int(resolve_dim(f.get("countX") or f.get("count") or 2, resolved, "count_x"))
                    ny = int(resolve_dim(f.get("countY") or 1, resolved, "count_y"))
                    sx = resolve_dim(f.get("spacingX") or f.get("dx") or 0, resolved, "spacing_x")
                    sy = resolve_dim(f.get("spacingY") or f.get("dy") or 0, resolved, "spacing_y")
                    for ix in range(nx):
                        for iy in range(ny):
                            if ix == 0 and iy == 0:
                                continue
                            offsets.append((ix * sx, iy * sy))
                else:
                    count = int(resolve_dim(f.get("count") or 2, resolved, "count"))
                    dx = resolve_dim(f.get("dx") or 0, resolved, "dx")
                    dy = resolve_dim(f.get("dy") or 0, resolved, "dy")
                    for i in range(1, max(count, 1)):
                        offsets.append((i * dx, i * dy))
                for i, (du, dv) in enumerate(offsets, 1):
                    prev = tip_of(body_id)
                    if prev is None:
                        raise RebuildError("BOOLEAN_MISSING_SOLID", f"{fname}: body has no solid.")
                    u, v = u0 + du, v0 + dv
                    cut_len = depth + 2 * OVER
                    P = add_vec(face["origin"], add_vec(scale_vec(face["uDir"], u), scale_vec(face["vDir"], v)))
                    inward = scale_vec(face["normal"], -1)
                    start = add_vec(P, scale_vec(inward, -OVER))
                    tool = doc.addObject("Part::Cylinder", fc_name(f"{fname}T{i}", used_names, "PatTool"))
                    tool.Radius = dia / 2.0
                    tool.Height = cut_len
                    pl = App.Placement()
                    pl.Base = _vector(start)
                    _align_z(pl, inward)
                    tool.Placement = pl
                    _hide(tool)
                    cut = doc.addObject("Part::Cut", fc_name(f"{fname}{i}", used_names, "PatHole"))
                    cut.Base = prev
                    cut.Tool = tool
                    set_tip(body_id, cut)
                remember(fid, tip_of(body_id), "pattern")

            elif kind == "imported_solid":
                src = f.get("sourcePath") or ""
                if not src or not os.path.isfile(src):
                    raise RebuildError("IMPORT_FAILED", f"{fname}: imported source file is missing.")
                fmt = (f.get("sourceFormat") or os.path.splitext(src)[1].lstrip(".")).lower()
                before = set(doc.Objects)
                if fmt in ("step", "stp", "iges", "igs"):
                    import Import

                    Import.insert(src, doc.Name)
                elif fmt == "fcstd":
                    other = App.openDocument(src)
                    shapes = []
                    for o in other.Objects:
                        sh = getattr(o, "Shape", None)
                        if sh is not None and not sh.isNull():
                            shapes.extend(list(sh.Solids) or [sh])
                    App.closeDocument(other.Name)
                    if not shapes:
                        raise RebuildError("IMPORT_FAILED", f"{fname}: FCStd contained no shapes.")
                    fused = shapes[0]
                    for extra in shapes[1:]:
                        fused = fused.fuse(extra)
                    obj = doc.addObject("Part::Feature", fc_name(fname, used_names, "Imported"))
                    obj.Label = fname
                    obj.Shape = fused
                    _tag(obj, fid, "imported_solid")
                    set_tip(body_id, obj)
                    remember(fid, obj, "imported_solid")
                    bbox = fused.BoundBox
                    envelopes[body_id] = {
                        "origin": {"x": bbox.XMin, "y": bbox.YMin, "z": bbox.ZMin},
                        "L": bbox.XLength,
                        "W": bbox.YLength,
                        "H": bbox.ZLength,
                        "faces": box_faces({"x": bbox.XMin, "y": bbox.YMin, "z": bbox.ZMin}, bbox.XLength, bbox.YLength, bbox.ZLength),
                    }
                    continue
                else:
                    import Mesh

                    Mesh.insert(src, doc.Name)
                new = [o for o in doc.Objects if o not in before]
                if not new:
                    raise RebuildError("IMPORT_FAILED", f"{fname}: import produced no objects.")
                tip = new[-1]
                for o in new:
                    _tag(o, fid, "imported_solid")
                    o.Label = fname
                set_tip(body_id, tip)
                remember(fid, tip, "imported_solid")
                shape = getattr(tip, "Shape", None)
                if shape is not None and not shape.isNull():
                    bbox = shape.BoundBox
                    envelopes[body_id] = {
                        "origin": {"x": bbox.XMin, "y": bbox.YMin, "z": bbox.ZMin},
                        "L": bbox.XLength,
                        "W": bbox.YLength,
                        "H": bbox.ZLength,
                        "faces": box_faces({"x": bbox.XMin, "y": bbox.YMin, "z": bbox.ZMin}, bbox.XLength, bbox.YLength, bbox.ZLength),
                    }

            elif kind in ("sketch",):
                pass
            else:
                issues.append({
                    "severity": "warning",
                    "code": "UNSUPPORTED_FEATURE",
                    "message": f"Feature kind '{kind}' is not implemented in the FreeCAD driver.",
                    "feature": fname,
                })
        except RebuildError as err:
            issues.append({"severity": "error", **err.as_dict(), "feature": fname})
        except (GeomError, SelectorError) as err:
            extra = err.as_dict() if hasattr(err, "as_dict") else {"code": getattr(err, "code", "RECOMPUTE_FAILED"), "message": str(err)}
            issues.append({"severity": "error", **extra, "feature": fname})
        except Exception as err:
            issues.append({
                "severity": "error",
                "code": "RECOMPUTE_FAILED",
                "message": f"{fname}: {err}",
                "feature": fname,
            })

    doc.recompute()
    for b in body_meta:
        if b.get("consumed") and b.get("tip"):
            obj = doc.getObject(b["tip"])
            if obj:
                _hide(obj)

    return {
        "document_name": doc.Name,
        "mapping": mapping,
        "envelopes": envelopes,
        "bodies": body_meta,
        "features": feature_meta,
        "parameters": resolved,
        "issues": issues,
        "object_count": len(doc.Objects),
    }
