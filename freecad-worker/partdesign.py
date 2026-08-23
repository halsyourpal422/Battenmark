"""PartDesign reconstruction for simple AgentCAD bodies (box + holes + fillet/chamfer + pattern)."""

from __future__ import annotations

from typing import Any

import FreeCAD as App
import Part

from geom import (
    box_faces,
    dim_text,
    fc_name,
    hole_uv,
    resolve_dim,
    resolve_vec3,
    to_freecad_expr,
)
from selectors import SelectorError, pick_edges, pick_face

PD_KINDS = {"box", "hole", "fillet", "chamfer", "pattern"}

FACE_SUB = {
    "bottom_face": "Face5",
    "top_face": "Face6",
    "back_face": "Face3",
    "front_face": "Face4",
    "left_face": "Face1",
    "right_face": "Face2",
}


class PdError(Exception):
    def __init__(self, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


def is_pd_eligible(body_id: str, features: list[dict[str, Any]]) -> bool:
    feats = [f for f in features if f.get("bodyId") == body_id and not f.get("suppressed")]
    if not feats:
        return False
    if feats[0].get("kind") != "box":
        return False
    return all(f.get("kind") in PD_KINDS for f in feats)


def _vector(d: dict[str, float]) -> App.Vector:
    return App.Vector(d["x"], d["y"], d["z"])


def _set_dim(obj, prop: str, value: Any, params: dict[str, float], param_names: set[str]) -> None:
    if isinstance(value, str) and any(name in value for name in param_names):
        expr = to_freecad_expr(value, param_names)
        try:
            obj.setExpression(prop, expr)
        except Exception:
            pass
        setattr(obj, prop, resolve_dim(value, params, prop))
    else:
        setattr(obj, prop, resolve_dim(value, params, prop))


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


def _origin_axis(body, letter: str):
    origin = getattr(body, "Origin", None)
    if origin is None:
        return None
    want = f"{letter.upper()}_Axis"
    for child in list(getattr(origin, "OutList", []) or []):
        if child.Name.endswith(want) or child.Name == want:
            return child
    return None


def _sketch_of(source_obj, body=None):
    """PartDesign Hole.Profile is often (Sketch, ['Face1']), not a DocumentObject."""
    prof = getattr(source_obj, "Profile", None)
    if isinstance(prof, (tuple, list)) and prof:
        prof = prof[0]
    if prof is not None and getattr(prof, "TypeId", "") == "Sketcher::SketchObject":
        return prof
    if body is not None:
        for o in list(getattr(body, "Group", []) or []):
            if getattr(o, "TypeId", "") == "Sketcher::SketchObject":
                return o
    return None


def _face_name(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        return str(raw.get("selector") or "top_face")
    return "top_face"


def _hole_key(feat: dict[str, Any]) -> tuple:
    face = _face_name(feat.get("face"))
    ht = feat.get("holeType") or ("through" if feat.get("through", True) else "blind")
    cb = feat.get("counterbore")
    cs = feat.get("countersink")
    return (
        face,
        str(feat.get("diameter")),
        ht,
        str(feat.get("depth")),
        str(cb.get("diameter") if cb else None),
        str(cb.get("depth") if cb else None),
        str(cs.get("diameter") if cs else None),
        str(feat.get("thread")),
    )


def _apply_hole_cut(hole, feat: dict[str, Any], params: dict[str, float]) -> None:
    through = bool(feat.get("through", True)) if feat.get("holeType") != "blind" else False
    if feat.get("holeType") == "through":
        through = True
    if feat.get("holeType") == "blind":
        through = False
    hole.Threaded = False
    hole.HoleCutType = "None"
    hole.DrillPoint = "Flat"
    if through:
        hole.DepthType = "ThroughAll"
    else:
        hole.DepthType = "Dimension"
        hole.Depth = resolve_dim(feat.get("depth") or 0, params, "depth")
    dia = resolve_dim(feat.get("diameter"), params, "diameter")
    hole.Diameter = dia
    cb = feat.get("counterbore")
    cs = feat.get("countersink")
    if cb and cs:
        raise PdError("HOLE_CONFIGURATION_INVALID", "A hole cannot be both counterbore and countersink.")
    if cb:
        hole.HoleCutType = "Counterbore"
        hole.HoleCutCustomValues = True
        hole.HoleCutDiameter = resolve_dim(cb.get("diameter"), params, "counterbore.diameter")
        hole.HoleCutDepth = resolve_dim(cb.get("depth"), params, "counterbore.depth")
        if hole.HoleCutDiameter <= dia:
            raise PdError("HOLE_CONFIGURATION_INVALID", "Counterbore diameter must exceed the hole diameter.")
    if cs:
        hole.HoleCutType = "Countersink"
        hole.HoleCutCustomValues = True
        hole.HoleCutDiameter = resolve_dim(cs.get("diameter"), params, "countersink.diameter")
        hole.HoleCutCountersinkAngle = resolve_dim(cs.get("angle") or 90, params, "countersink.angle")
        if hole.HoleCutDiameter <= dia:
            raise PdError("HOLE_CONFIGURATION_INVALID", "Countersink diameter must exceed the hole diameter.")
    thread = feat.get("thread")
    if thread:
        try:
            if "ThreadType" in hole.PropertiesList:
                # cosmetic metadata only — do not model helical threads
                pass
        except Exception:
            pass


def _add_pd_hole(
    doc,
    body,
    box,
    env: dict[str, Any],
    holes: list[dict[str, Any]],
    params: dict[str, float],
    used_names: set[str],
) -> Any:
    if not holes:
        return None
    first = holes[0]
    face_label = _face_name(first.get("face"))
    sub = FACE_SUB.get(face_label, "Face6")
    face = next((fc for fc in env["faces"] if fc["name"] == face_label), env["faces"][1])
    sketch_name = fc_name((first.get("name") or "Hole") + "Sketch", used_names, "HoleSketch")
    sketch = doc.addObject("Sketcher::SketchObject", sketch_name)
    body.addObject(sketch)
    try:
        sketch.AttachmentSupport = [(box, sub)]
        sketch.MapMode = "FlatFace"
    except Exception:
        sketch.Placement.Base = _vector(face["origin"])
    for feat in holes:
        u, v = hole_uv(feat, face, params)
        r = resolve_dim(feat.get("diameter"), params, "diameter") / 2.0
        if u < r or v < r or u > face["width"] - r or v > face["height"] - r:
            raise PdError(
                "HOLE_OUTSIDE_FACE",
                f"{feat.get('name')}: center ({u:.2f}, {v:.2f}) with ⌀{r * 2} does not fit on {face_label}.",
                feature=feat.get("name"),
            )
        sketch.addGeometry(Part.Circle(App.Vector(u, v, 0), App.Vector(0, 0, 1), 0.5), False)
    doc.recompute()
    hole_name = fc_name(first.get("name") or "Hole", used_names, "Hole")
    hole = doc.addObject("PartDesign::Hole", hole_name)
    hole.Label = first.get("name") or "Hole"
    body.addObject(hole)
    hole.Profile = sketch
    _apply_hole_cut(hole, first, params)
    _tag(hole, first.get("id") or "", "hole")
    if first.get("thread"):
        try:
            hole.addProperty("App::PropertyString", "AgentCadThread", "AgentCAD")
            hole.AgentCadThread = str(first.get("thread"))
        except Exception:
            pass
    body.Tip = hole
    doc.recompute()
    if hole.Shape is None or hole.Shape.isNull() or not hole.Shape.isValid():
        raise PdError("RECOMPUTE_FAILED", f"{hole.Label}: PartDesign Hole produced an invalid shape.")
    return hole


def _set_pattern_mode(pat, intent: str) -> None:
    """Set LinearPattern extent Mode across FreeCAD versions (1.0 'length' vs 1.1+ 'Extent')."""
    candidates = {
        "length": ("extent", "length"),
        "spacing": ("spacing",),
    }.get(intent, (intent,))
    try:
        enums = [str(e) for e in pat.getEnumerationsOfProperty("Mode")]
    except Exception:
        enums = []
    for want in candidates:
        for choice in enums:
            if choice.lower() == want:
                pat.Mode = choice
                return
    if enums:
        pat.Mode = enums[0]
    else:
        pat.Mode = intent


def _add_pd_pattern(
    doc,
    body,
    source_obj,
    feat: dict[str, Any],
    params: dict[str, float],
    used_names: set[str],
) -> Any:
    kind = feat.get("patternKind") or "linear"
    name = fc_name(feat.get("name") or "Pattern", used_names, "Pattern")
    if kind == "rectangular":
        nx = int(resolve_dim(feat.get("countX") or feat.get("count") or 2, params, "count_x"))
        ny = int(resolve_dim(feat.get("countY") or 1, params, "count_y"))
        sx = resolve_dim(feat.get("spacingX") or feat.get("dx") or 0, params, "spacing_x")
        sy = resolve_dim(feat.get("spacingY") or feat.get("dy") or 0, params, "spacing_y")
        pat_x = doc.addObject("PartDesign::LinearPattern", name + "X")
        pat_x.Originals = [source_obj]
        sk = _sketch_of(source_obj, body)
        if sk is not None:
            pat_x.Direction = (sk, ["H_Axis"])
        pat_x.Occurrences = max(nx, 1)
        _set_pattern_mode(pat_x, "length")
        pat_x.Length = max(sx * max(nx - 1, 0), 0.0)
        body.addObject(pat_x)
        body.Tip = pat_x
        _tag(pat_x, feat.get("id") or "", "pattern")
        doc.recompute()
        if ny > 1:
            pat_y = doc.addObject("PartDesign::LinearPattern", name + "Y")
            pat_y.Originals = [pat_x]
            if sk is not None:
                pat_y.Direction = (sk, ["V_Axis"])
            pat_y.Occurrences = ny
            _set_pattern_mode(pat_y, "length")
            pat_y.Length = max(sy * max(ny - 1, 0), 0.0)
            body.addObject(pat_y)
            body.Tip = pat_y
            _tag(pat_y, feat.get("id") or "", "pattern")
            doc.recompute()
            return pat_y
        return pat_x

    count = int(resolve_dim(feat.get("count") or 2, params, "count"))
    dx = resolve_dim(feat.get("dx") or 0, params, "dx")
    dy = resolve_dim(feat.get("dy") or 0, params, "dy")
    dz = resolve_dim(feat.get("dz") or 0, params, "dz")
    direction = (feat.get("direction") or "x")
    if isinstance(direction, str):
        direction = direction.lower()
    pat = doc.addObject("PartDesign::LinearPattern", name)
    pat.Label = feat.get("name") or "Pattern"
    pat.Originals = [source_obj]
    axis = "H_Axis"
    length = abs(dx) * max(count - 1, 0)
    if direction in ("y", "Y") or (abs(dy) > abs(dx) + 1e-9 and abs(dy) >= abs(dz)):
        axis = "V_Axis"
        length = abs(dy) * max(count - 1, 0)
    sk = _sketch_of(source_obj, body)
    if sk is not None:
        pat.Direction = (sk, [axis])
    else:
        letter = "Y" if axis == "V_Axis" else "X"
        if abs(dz) > abs(dx) and abs(dz) > abs(dy):
            letter = "Z"
            length = abs(dz) * max(count - 1, 0)
        orig_axis = _origin_axis(body, letter)
        if orig_axis is not None:
            pat.Direction = orig_axis
    pat.Occurrences = max(count, 1)
    _set_pattern_mode(pat, "length")
    pat.Length = length
    body.addObject(pat)
    body.Tip = pat
    _tag(pat, feat.get("id") or "", "pattern")
    doc.recompute()
    return pat


def _add_pd_fillet(
    doc,
    body,
    feat: dict[str, Any],
    params: dict[str, float],
    used_names: set[str],
) -> Any:
    tip = body.Tip
    if tip is None or getattr(tip, "Shape", None) is None:
        raise PdError("BOOLEAN_MISSING_SOLID", f"{feat.get('name')}: nothing to fillet.")
    doc.recompute()
    shape = tip.Shape
    mode = feat.get("edges") or feat.get("target") or "all_vertical"
    try:
        picked = pick_edges(shape, mode, params)
    except SelectorError as err:
        raise PdError(err.code, err.message, **err.extra)
    if not picked:
        raise PdError("GEOMETRY_SELECTOR_NO_MATCH", f"{feat.get('name')}: no edges to fillet.")
    edges = list(shape.Edges)
    names = [f"Edge{i}" for i, e in enumerate(edges, 1) if any(e.isEqual(p) for p in picked)]
    if not names:
        index_of = {id(e): i + 1 for i, e in enumerate(edges)}
        names = [f"Edge{index_of[id(e)]}" for e in picked if id(e) in index_of]
    fil = doc.addObject("PartDesign::Fillet", fc_name(feat.get("name") or "Fillet", used_names, "Fillet"))
    fil.Label = feat.get("name") or "Fillet"
    fil.Base = (tip, names)
    fil.Radius = resolve_dim(feat.get("radius"), params, "radius")
    body.addObject(fil)
    body.Tip = fil
    _tag(fil, feat.get("id") or "", "fillet")
    doc.recompute()
    if fil.Shape is None or fil.Shape.isNull() or not fil.Shape.isValid():
        raise PdError("FILLET_FAILED", f"{fil.Label}: the requested fillet could not be constructed.")
    return fil


def _add_pd_chamfer(
    doc,
    body,
    feat: dict[str, Any],
    params: dict[str, float],
    used_names: set[str],
) -> Any:
    tip = body.Tip
    if tip is None or getattr(tip, "Shape", None) is None:
        raise PdError("BOOLEAN_MISSING_SOLID", f"{feat.get('name')}: nothing to chamfer.")
    doc.recompute()
    shape = tip.Shape
    mode = feat.get("edges") or feat.get("target") or "all_vertical"
    try:
        picked = pick_edges(shape, mode, params)
    except SelectorError as err:
        raise PdError(err.code, err.message, **err.extra)
    edges = list(shape.Edges)
    names = [f"Edge{i}" for i, e in enumerate(edges, 1) if any(e.isEqual(p) for p in picked)]
    ch = doc.addObject("PartDesign::Chamfer", fc_name(feat.get("name") or "Chamfer", used_names, "Chamfer"))
    ch.Label = feat.get("name") or "Chamfer"
    ch.Base = (tip, names)
    dist = resolve_dim(feat.get("distance"), params, "distance")
    if "Size" in ch.PropertiesList:
        ch.Size = dist
    body.addObject(ch)
    body.Tip = ch
    _tag(ch, feat.get("id") or "", "chamfer")
    doc.recompute()
    if ch.Shape is None or ch.Shape.isNull() or not ch.Shape.isValid():
        raise PdError("CHAMFER_FAILED", f"{ch.Label}: the requested chamfer could not be constructed.")
    return ch


def rebuild_pd_body(
    doc,
    body_rec: dict[str, Any],
    features: list[dict[str, Any]],
    resolved: dict[str, float],
    param_names: set[str],
    used_names: set[str],
    remember,
    set_tip,
    issues: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Build one PartDesign body. Returns envelope dict or None on failure."""
    body_id = body_rec["id"]
    feats = [f for f in features if f.get("bodyId") == body_id and not f.get("suppressed")]
    box_feat = next((f for f in feats if f.get("kind") == "box"), None)
    if not box_feat:
        return None
    pd_name = fc_name(body_rec.get("name") or "Body", used_names, "PDBody")
    pd = doc.addObject("PartDesign::Body", pd_name)
    pd.Label = body_rec.get("name") or "Body"
    box = doc.addObject("PartDesign::AdditiveBox", fc_name(box_feat.get("name") or "Box", used_names, "Box"))
    box.Label = box_feat.get("name") or "Box"
    pd.addObject(box)
    _set_dim(box, "Length", box_feat.get("length"), resolved, param_names)
    _set_dim(box, "Width", box_feat.get("width"), resolved, param_names)
    _set_dim(box, "Height", box_feat.get("height"), resolved, param_names)
    origin = _set_placement(box, box_feat.get("origin"), resolved, param_names)
    _tag(box, box_feat.get("id") or "", "box")
    pd.Tip = box
    doc.recompute()
    L = float(box.Length)
    W = float(box.Width)
    H = float(box.Height)
    env = {
        "origin": origin,
        "L": L,
        "W": W,
        "H": H,
        "faces": box_faces(origin, L, W, H),
        "pd": True,
    }
    remember(box_feat.get("id") or "", box, "box", {"summary": f"box {L} × {W} × {H} mm", "feature_type": box.TypeId})
    set_tip(body_id, pd if getattr(pd, "Tip", None) is None else pd.Tip)

    patterned = {f.get("sourceFeatureId") for f in feats if f.get("kind") == "pattern"}
    holes = [f for f in feats if f.get("kind") == "hole"]
    hole_objs: dict[str, Any] = {}

    # Group identical unpatterned holes into one PartDesign::Hole (multiple circles).
    groups: dict[tuple, list[dict[str, Any]]] = {}
    for h in holes:
        if h.get("id") in patterned:
            key = ("solo", h.get("id"))
        else:
            key = _hole_key(h)
        groups.setdefault(key, []).append(h)

    try:
        for group in groups.values():
            obj = _add_pd_hole(doc, pd, box, env, group, resolved, used_names)
            for h in group:
                hole_objs[h.get("id")] = obj
                remember(
                    h.get("id") or "",
                    obj,
                    "hole",
                    {"summary": f"hole ⌀{h.get('diameter')} on {_face_name(h.get('face'))}", "feature_type": "PartDesign::Hole"},
                )
        for f in feats:
            if f.get("kind") != "pattern":
                continue
            src = hole_objs.get(f.get("sourceFeatureId"))
            if src is None:
                issues.append({
                    "severity": "warning",
                    "code": "PATTERN_CONFIGURATION_INVALID",
                    "message": f"{f.get('name')}: pattern source is not a PartDesign hole on this body.",
                    "feature": f.get("name"),
                })
                continue
            pat = _add_pd_pattern(doc, pd, src, f, resolved, used_names)
            remember(f.get("id") or "", pat, "pattern", {"feature_type": pat.TypeId})
        for f in feats:
            if f.get("kind") == "fillet":
                fil = _add_pd_fillet(doc, pd, f, resolved, used_names)
                remember(f.get("id") or "", fil, "fillet", {"feature_type": fil.TypeId})
            elif f.get("kind") == "chamfer":
                ch = _add_pd_chamfer(doc, pd, f, resolved, used_names)
                remember(f.get("id") or "", ch, "chamfer", {"feature_type": ch.TypeId})
    except (PdError, SelectorError) as err:
        extra = err.as_dict() if hasattr(err, "as_dict") else {"code": getattr(err, "code", "RECOMPUTE_FAILED"), "message": str(err)}
        issues.append({"severity": "error", **extra})
        return env

    tip = pd.Tip or box
    set_tip(body_id, tip)
    return env
