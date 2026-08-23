"""Semantic geometry resolution against OpenCascade shapes."""

from __future__ import annotations

import math
from typing import Any

from geom import resolve_dim, resolve_vec3

FACE_NAMES = {
    "top_face",
    "bottom_face",
    "front_face",
    "back_face",
    "left_face",
    "right_face",
}


class SelectorError(Exception):
    def __init__(self, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


def _round(n: float, d: int = 4) -> float:
    return round(float(n), d)


def _vec(p) -> dict[str, float]:
    return {"x": _round(p.x), "y": _round(p.y), "z": _round(p.z)}


def normalize_selector(raw: Any, default_entity: str = "edge", fallback: str = "all_edges") -> dict[str, Any]:
    if raw is None or raw == "":
        return {"entity": default_entity, "selector": fallback}
    if isinstance(raw, str):
        entity = "face" if raw in FACE_NAMES or "face" in raw or "planar" in raw or raw.startswith("normal_") else default_entity
        return {"entity": entity, "selector": raw}
    if isinstance(raw, dict):
        out = dict(raw)
        out.setdefault("entity", default_entity)
        out.setdefault("selector", fallback)
        return out
    raise SelectorError("INVALID_GEOMETRY_SELECTOR", f"Selector must be a string or object, got {type(raw).__name__}.")


def selector_kind(sel: dict[str, Any]) -> str:
    return str(sel.get("selector") or "").strip().lower()


def _parallel(dx: float, dy: float, dz: float, ax: float, ay: float, az: float, tol: float = 0.08) -> bool:
    length = math.hypot(dx, dy, dz) or 1.0
    ux, uy, uz = dx / length, dy / length, dz / length
    return abs(abs(ux * ax + uy * ay + uz * az) - 1.0) <= tol


def enumerate_faces(shape, created_by: str | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if shape is None or shape.isNull():
        return out
    faces = list(getattr(shape, "Faces", []) or [])
    for i, face in enumerate(faces, 1):
        surf = face.Surface
        stype = type(surf).__name__
        try:
            umin, umax, vmin, vmax = face.ParameterRange
            u = 0.5 * (umin + umax)
            v = 0.5 * (vmin + vmax)
            n = face.normalAt(u, v)
        except Exception:
            n = None
        try:
            c = face.CenterOfMass
            centroid = _vec(c)
        except Exception:
            centroid = {"x": 0.0, "y": 0.0, "z": 0.0}
        try:
            area = float(face.Area)
        except Exception:
            area = 0.0
        radius = None
        if stype == "Cylinder":
            try:
                radius = float(surf.Radius)
            except Exception:
                radius = None
        normal = _vec(n) if n is not None else None
        role = None
        if stype == "Plane" and normal:
            if normal["z"] > 0.9:
                role = "top_face"
            elif normal["z"] < -0.9:
                role = "bottom_face"
            elif normal["y"] > 0.9:
                role = "front_face"
            elif normal["y"] < -0.9:
                role = "back_face"
            elif normal["x"] > 0.9:
                role = "right_face"
            elif normal["x"] < -0.9:
                role = "left_face"
        bb = face.BoundBox
        rec = {
            "semantic_id": f"gref_face_{i:03d}",
            "entity": "face",
            "occt_index": i,
            "surface_type": stype,
            "area_mm2": _round(area, 3),
            "centroid": centroid,
            "normal": normal,
            "radius_mm": _round(radius, 4) if radius is not None else None,
            "bbox": {
                "min": {"x": _round(bb.XMin), "y": _round(bb.YMin), "z": _round(bb.ZMin)},
                "max": {"x": _round(bb.XMax), "y": _round(bb.YMax), "z": _round(bb.ZMax)},
            },
            "role": role,
            "created_by": created_by,
            "fingerprint": {
                "surface_type": stype,
                "role": role,
                "area": round(area, 2),
                "nx": round(normal["x"], 2) if normal else None,
                "ny": round(normal["y"], 2) if normal else None,
                "nz": round(normal["z"], 2) if normal else None,
                "cx": round(centroid["x"], 2),
                "cy": round(centroid["y"], 2),
                "cz": round(centroid["z"], 2),
            },
            "confidence": "exact",
            "_shape": face,
        }
        out.append(rec)
    # disambiguate duplicate role labels by keeping the largest area
    by_role: dict[str, list[dict[str, Any]]] = {}
    for rec in out:
        if rec.get("role"):
            by_role.setdefault(rec["role"], []).append(rec)
    for role, group in by_role.items():
        if len(group) > 1:
            group.sort(key=lambda r: r.get("area_mm2") or 0, reverse=True)
            for extra in group[1:]:
                extra["role"] = None
    return out


def enumerate_edges(shape, faces: list[dict[str, Any]] | None = None, created_by: str | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if shape is None or shape.isNull():
        return out
    edges = list(getattr(shape, "Edges", []) or [])
    top_z = None
    bot_z = None
    if faces:
        tops = [f for f in faces if f.get("role") == "top_face"]
        bots = [f for f in faces if f.get("role") == "bottom_face"]
        if tops:
            top_z = tops[0]["centroid"]["z"]
        if bots:
            bot_z = bots[0]["centroid"]["z"]
    for i, edge in enumerate(edges, 1):
        try:
            curve = edge.Curve
            ctype = type(curve).__name__
        except Exception:
            ctype = "unknown"
        try:
            length = float(edge.Length)
        except Exception:
            length = 0.0
        try:
            mid = edge.valueAt(0.5 * (edge.FirstParameter + edge.LastParameter))
            midpoint = _vec(mid)
        except Exception:
            try:
                midpoint = _vec(edge.CenterOfMass)
            except Exception:
                midpoint = {"x": 0.0, "y": 0.0, "z": 0.0}
        try:
            t = edge.tangentAt(0.5 * (edge.FirstParameter + edge.LastParameter))
            direction = _vec(t)
        except Exception:
            direction = {"x": 0.0, "y": 0.0, "z": 0.0}
        convex = True
        try:
            anc = shape.ancestorsOfType(edge, type(shape.Faces[0])) if shape.Faces else []
            if len(anc) >= 2:
                n1 = anc[0].normalAt(0.5, 0.5)
                n2 = anc[1].normalAt(0.5, 0.5)
                bis = n1.add(n2)
                if bis.Length > 1e-9:
                    bis.normalize()
                    probe = edge.CenterOfMass.add(bis.multiply(0.05))
                    convex = not bool(shape.isInside(probe, 1e-4, True))
        except Exception:
            convex = True
        role = None
        is_line = "Line" in (ctype or "")
        if _parallel(direction["x"], direction["y"], direction["z"], 0, 0, 1):
            role = "all_vertical"
        elif is_line and top_z is not None and abs(midpoint["z"] - top_z) < 0.15 and abs(direction["z"]) < 0.08:
            role = "top_perimeter"
        elif is_line and bot_z is not None and abs(midpoint["z"] - bot_z) < 0.15 and abs(direction["z"]) < 0.08:
            role = "bottom_perimeter"
        bb = edge.BoundBox
        rec = {
            "semantic_id": f"gref_edge_{i:03d}",
            "entity": "edge",
            "occt_index": i,
            "curve_type": ctype,
            "length_mm": _round(length, 3),
            "midpoint": midpoint,
            "direction": direction,
            "bbox": {
                "min": {"x": _round(bb.XMin), "y": _round(bb.YMin), "z": _round(bb.ZMin)},
                "max": {"x": _round(bb.XMax), "y": _round(bb.YMax), "z": _round(bb.ZMax)},
            },
            "role": role,
            "convex": convex,
            "created_by": created_by,
            "fingerprint": {
                "curve_type": ctype,
                "role": role,
                "length": round(length, 2),
                "mx": round(midpoint["x"], 2),
                "my": round(midpoint["y"], 2),
                "mz": round(midpoint["z"], 2),
                "dx": round(direction["x"], 2),
                "dy": round(direction["y"], 2),
                "dz": round(direction["z"], 2),
            },
            "confidence": "exact",
            "_shape": edge,
        }
        out.append(rec)
    return out


def _dist(a: dict[str, float], b: dict[str, float]) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"], a["z"] - b["z"])


def filter_faces(faces: list[dict[str, Any]], sel: dict[str, Any], params: dict[str, float]) -> list[dict[str, Any]]:
    out = list(faces)
    kind = selector_kind(sel)
    if kind in FACE_NAMES:
        out = [f for f in out if f.get("role") == kind]
    elif kind in ("planar",):
        out = [f for f in out if f.get("surface_type") == "Plane"]
    elif kind in ("cylindrical",):
        out = [f for f in out if f.get("surface_type") == "Cylinder"]
    elif kind in ("largest_planar", "largest_planar_face"):
        planar = [f for f in out if f.get("surface_type") == "Plane"]
        if planar:
            m = max(f.get("area_mm2") or 0 for f in planar)
            out = [f for f in planar if abs((f.get("area_mm2") or 0) - m) < 1e-6]
        else:
            out = []
    elif kind in ("smallest_planar", "smallest_planar_face"):
        planar = [f for f in out if f.get("surface_type") == "Plane"]
        if planar:
            m = min(f.get("area_mm2") or 1e18 for f in planar)
            out = [f for f in planar if abs((f.get("area_mm2") or 0) - m) < 1e-6]
        else:
            out = []
    elif kind == "normal_positive_x":
        out = [f for f in out if (f.get("normal") or {}).get("x", 0) > 0.9]
    elif kind == "normal_negative_x":
        out = [f for f in out if (f.get("normal") or {}).get("x", 0) < -0.9]
    elif kind == "normal_positive_y":
        out = [f for f in out if (f.get("normal") or {}).get("y", 0) > 0.9]
    elif kind == "normal_negative_y":
        out = [f for f in out if (f.get("normal") or {}).get("y", 0) < -0.9]
    elif kind == "normal_positive_z":
        out = [f for f in out if (f.get("normal") or {}).get("z", 0) > 0.9]
    elif kind == "normal_negative_z":
        out = [f for f in out if (f.get("normal") or {}).get("z", 0) < -0.9]
    elif kind == "highest_z":
        if out:
            m = max((f.get("centroid") or {}).get("z", -1e18) for f in out)
            out = [f for f in out if abs((f.get("centroid") or {}).get("z", 0) - m) < 1e-6]
    elif kind == "lowest_z":
        if out:
            m = min((f.get("centroid") or {}).get("z", 1e18) for f in out)
            out = [f for f in out if abs((f.get("centroid") or {}).get("z", 0) - m) < 1e-6]
    created = sel.get("created_by")
    if created:
        out = [f for f in out if f.get("created_by") == created]
    if sel.get("nearest") and out:
        p = resolve_vec3(sel.get("nearest"), params, "nearest")
        scored = sorted(((_dist(f.get("centroid") or p, p), f) for f in out), key=lambda t: t[0])
        best = scored[0][0]
        tied = [f for d, f in scored if abs(d - best) < 1e-4]
        out = tied
    if sel.get("centroid_near") and out:
        p = resolve_vec3(sel.get("centroid_near"), params, "centroid_near")
        scored = sorted(((_dist(f.get("centroid") or p, p), f) for f in out), key=lambda t: t[0])
        best = scored[0][0]
        tied = [f for d, f in scored if abs(d - best) < 1e-4]
        out = tied
    return out


def filter_edges(
    edges: list[dict[str, Any]],
    sel: dict[str, Any],
    params: dict[str, float],
    faces: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out = list(edges)
    kind = selector_kind(sel)
    if kind in ("all_vertical", "parallel_to_z"):
        out = [e for e in out if _parallel(*(e.get("direction") or {"x": 0, "y": 0, "z": 0}).values(), 0, 0, 1)]
    elif kind == "parallel_to_x":
        out = [e for e in out if _parallel(*(e.get("direction") or {"x": 0, "y": 0, "z": 0}).values(), 1, 0, 0)]
    elif kind == "parallel_to_y":
        out = [e for e in out if _parallel(*(e.get("direction") or {"x": 0, "y": 0, "z": 0}).values(), 0, 1, 0)]
    elif kind == "all_horizontal":
        out = [e for e in out if abs((e.get("direction") or {}).get("z", 0)) < 0.08]
    elif kind == "top_perimeter":
        out = [e for e in out if e.get("role") == "top_perimeter" and "Line" in (e.get("curve_type") or "Line")]
    elif kind == "bottom_perimeter":
        out = [e for e in out if e.get("role") == "bottom_perimeter" and "Line" in (e.get("curve_type") or "Line")]
    elif kind in ("convex", "convex_edges"):
        out = [e for e in out if e.get("convex") is True]
    elif kind in ("concave", "concave_edges"):
        out = [e for e in out if e.get("convex") is False]
    elif kind in ("all", "all_edges", "", "edge"):
        pass
    created = sel.get("created_by")
    if created:
        out = [e for e in out if e.get("created_by") == created]
    if sel.get("length_between"):
        lb = sel["length_between"]
        lo = resolve_dim(lb.get("min", 0), params, "length_between.min")
        hi = resolve_dim(lb.get("max", 1e9), params, "length_between.max")
        out = [e for e in out if lo - 1e-6 <= (e.get("length_mm") or 0) <= hi + 1e-6]
    if sel.get("adjacent_to"):
        adj = normalize_selector(sel.get("adjacent_to"), "face", "top_face")
        matched = filter_faces(faces, adj, params)
        roles = {f.get("role") for f in matched}
        if "top_face" in roles:
            out = [e for e in out if e.get("role") == "top_perimeter"]
        elif "bottom_face" in roles:
            out = [e for e in out if e.get("role") == "bottom_perimeter"]
    if sel.get("nearest") and out:
        p = resolve_vec3(sel.get("nearest"), params, "nearest")
        scored = sorted(((_dist(e.get("midpoint") or p, p), e) for e in out), key=lambda t: t[0])
        best = scored[0][0]
        tied = [e for d, e in scored if abs(d - best) < 1e-4]
        out = tied
    if sel.get("centroid_near") and out:
        p = resolve_vec3(sel.get("centroid_near"), params, "centroid_near")
        scored = sorted(((_dist(e.get("midpoint") or p, p), e) for e in out), key=lambda t: t[0])
        best = scored[0][0]
        tied = [e for d, e in scored if abs(d - best) < 1e-4]
        out = tied
    return out


def public_match(rec: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in rec.items() if not k.startswith("_")}


def query_shape(
    shape,
    selector: Any,
    params: dict[str, float] | None = None,
    created_by: str | None = None,
    grefs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    params = params or {}
    sel = normalize_selector(selector, "edge", "all_edges")
    faces = enumerate_faces(shape, created_by=created_by)
    edges = enumerate_edges(shape, faces, created_by=created_by)
    entity = sel.get("entity") or "edge"
    if sel.get("gref"):
        pool = faces + edges
        stored = None
        if grefs:
            stored = next((g for g in grefs if g.get("id") == sel["gref"]), None)
        hit = next((m for m in pool if m.get("semantic_id") == sel["gref"]), None)
        if hit is None and stored and stored.get("fingerprint"):
            fp = stored["fingerprint"]
            candidates = [m for m in pool if m.get("entity") == stored.get("entity")]
            scored = []
            for m in candidates:
                mf = m.get("fingerprint") or {}
                score = 0
                for k, v in fp.items():
                    if mf.get(k) == v:
                        score += 1
                scored.append((score, m))
            scored.sort(key=lambda t: t[0], reverse=True)
            if not scored or scored[0][0] == 0:
                raise SelectorError(
                    "GEOMETRY_REFERENCE_LOST",
                    f"Geometry reference '{sel['gref']}' could not be re-resolved.",
                    gref=sel["gref"],
                )
            if len(scored) > 1 and scored[0][0] == scored[1][0]:
                raise SelectorError(
                    "GEOMETRY_REFERENCE_AMBIGUOUS",
                    f"Geometry reference '{sel['gref']}' matched multiple candidates equally.",
                    gref=sel["gref"],
                    match_count=2,
                )
            hit = scored[0][1]
            hit["confidence"] = "strong"
        matches = [hit] if hit else []
        if not matches:
            raise SelectorError(
                "GEOMETRY_REFERENCE_LOST",
                f"Geometry reference '{sel['gref']}' is no longer present.",
                gref=sel["gref"],
            )
    else:
        matches = filter_faces(faces, sel, params) if entity == "face" else filter_edges(edges, sel, params, faces)
    confidence = "exact" if len(matches) == 1 else ("missing" if not matches else "strong")
    if len(matches) > 1 and (sel.get("unique") or sel.get("nearest") or sel.get("centroid_near")):
        # nearest/centroid already collapsed ties; remaining ties are ambiguous
        if sel.get("nearest") or sel.get("centroid_near") or sel.get("unique"):
            raise SelectorError(
                "GEOMETRY_REFERENCE_AMBIGUOUS" if sel.get("nearest") or sel.get("centroid_near") else "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
                f"Selector resolved to {len(matches)} equally valid candidates.",
                match_count=len(matches),
                candidates=[public_match(m) for m in matches],
            )
    return {
        "selector": {k: v for k, v in sel.items() if k != "_shape"},
        "entity": entity,
        "kernel": "freecad",
        "match_count": len(matches),
        "matches": [public_match(m) for m in matches],
        "confidence": confidence,
        "_raw": matches,
    }


def pick_edges(shape, selector: Any, params: dict[str, float] | None = None, created_by: str | None = None) -> list[Any]:
    result = query_shape(shape, selector if selector is not None else "all_vertical", params, created_by)
    sel = normalize_selector(selector, "edge", "all_vertical")
    if result["match_count"] == 0:
        kind = selector_kind(sel)
        if kind in ("all", "all_edges"):
            return list(shape.Edges)
        raise SelectorError(
            "GEOMETRY_SELECTOR_NO_MATCH",
            f"Selector '{kind or selector}' resolved to no edges.",
            selector=sel,
            match_count=0,
        )
    return [m["_shape"] for m in result["_raw"]]


def pick_face(shape, selector: Any, params: dict[str, float] | None = None) -> dict[str, Any]:
    sel = normalize_selector(selector, "face", "top_face")
    sel["entity"] = "face"
    result = query_shape(shape, sel, params)
    if result["match_count"] == 0:
        raise SelectorError(
            "GEOMETRY_SELECTOR_NO_MATCH",
            f"Selector '{selector_kind(sel)}' resolved to no faces.",
            selector=sel,
            match_count=0,
        )
    if result["match_count"] > 1 and sel.get("unique", True):
        raise SelectorError(
            "GEOMETRY_SELECTOR_MULTIPLE_MATCHES",
            f"Selector resolved to {result['match_count']} faces but the operation requires 1.",
            match_count=result["match_count"],
        )
    return result["_raw"][0]
