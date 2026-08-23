"""Structured inspection and B-rep validation against OpenCascade shapes."""

from __future__ import annotations

from typing import Any


def _round(n: float, digits: int = 4) -> float:
    return round(float(n), digits)


def shape_info(shape) -> dict[str, Any]:
    if shape is None or shape.isNull():
        return {
            "shape_type": "null",
            "valid": False,
            "solid_count": 0,
            "shell_count": 0,
            "face_count": 0,
            "edge_count": 0,
            "volume_mm3": 0.0,
            "surface_area_mm2": 0.0,
            "bounding_box_mm": None,
            "closed": False,
        }
    valid = False
    try:
        valid = bool(shape.isValid())
    except Exception:
        valid = False
    bbox = None
    try:
        bb = shape.BoundBox
        if bb.isValid():
            bbox = {
                "min": {"x": _round(bb.XMin), "y": _round(bb.YMin), "z": _round(bb.ZMin)},
                "max": {"x": _round(bb.XMax), "y": _round(bb.YMax), "z": _round(bb.ZMax)},
                "x": _round(bb.XLength),
                "y": _round(bb.YLength),
                "z": _round(bb.ZLength),
            }
    except Exception:
        bbox = None
    volume = 0.0
    area = 0.0
    try:
        volume = float(shape.Volume)
    except Exception:
        volume = 0.0
    try:
        area = float(shape.Area)
    except Exception:
        area = 0.0
    closed = False
    try:
        closed = bool(shape.isClosed())
    except Exception:
        closed = False
    return {
        "shape_type": str(getattr(shape, "ShapeType", "unknown")),
        "valid": valid,
        "solid_count": len(getattr(shape, "Solids", []) or []),
        "shell_count": len(getattr(shape, "Shells", []) or []),
        "face_count": len(getattr(shape, "Faces", []) or []),
        "edge_count": len(getattr(shape, "Edges", []) or []),
        "volume_mm3": _round(volume, 3),
        "surface_area_mm2": _round(area, 3),
        "bounding_box_mm": bbox,
        "closed": closed,
    }


def object_record(obj, agent_id: str | None, kind: str | None = None) -> dict[str, Any]:
    rec: dict[str, Any] = {
        "agentcad_id": agent_id,
        "freecad_name": obj.Name,
        "label": obj.Label,
        "feature_type": obj.TypeId,
        "kind": kind,
        "visibility": True,
        "placement": None,
        "dimensions": {},
        "dependencies": [x.Name for x in getattr(obj, "InList", [])],
        "shape": None,
        "valid": True,
        "state": None,
    }
    try:
        if hasattr(obj, "ViewObject") and obj.ViewObject is not None:
            rec["visibility"] = bool(getattr(obj.ViewObject, "Visibility", True))
    except Exception:
        pass
    try:
        if hasattr(obj, "Placement"):
            p = obj.Placement.Base
            rec["placement"] = {"x": _round(p.x), "y": _round(p.y), "z": _round(p.z)}
    except Exception:
        pass
    dims = {}
    for prop in ("Length", "Width", "Height", "Radius", "Diameter", "FirstAngle", "SecondAngle"):
        if hasattr(obj, prop):
            try:
                dims[prop.lower()] = float(getattr(obj, prop))
            except Exception:
                pass
    rec["dimensions"] = dims
    if hasattr(obj, "Shape"):
        rec["shape"] = shape_info(obj.Shape)
        rec["valid"] = rec["shape"]["valid"]
    try:
        if hasattr(obj, "State"):
            rec["state"] = list(obj.State)
    except Exception:
        rec["state"] = None
    return rec


def inspect_document(doc, mapping: dict[str, str], envelopes: dict[str, Any], bodies_meta: list[dict[str, Any]], features_meta: list[dict[str, Any]], parameters: dict[str, float]) -> dict[str, Any]:
    reverse = {v: k for k, v in mapping.items()}
    objects = []
    issues: list[dict[str, Any]] = []
    visible_solids = 0
    volume = 0.0
    area = 0.0
    bbox = None
    for obj in doc.Objects:
        aid = reverse.get(obj.Name)
        rec = object_record(obj, aid)
        objects.append(rec)
        shape = rec.get("shape")
        if not shape:
            continue
        if not shape["valid"] and shape["shape_type"] != "null":
            type_id = getattr(obj, "TypeId", "") or ""
            if type_id.startswith(("App::", "Spreadsheet::", "Sketcher::")):
                continue
            if shape.get("solid_count", 0) == 0 and shape.get("shape_type") not in ("Solid", "Compound", "CompSolid"):
                continue
            issues.append({
                "severity": "error",
                "code": "INVALID_SHAPE",
                "message": f"{obj.Label} has an invalid OpenCascade shape.",
                "feature": obj.Label,
            })
        if shape["shape_type"] == "null":
            continue

    # Prefer body tips for aggregate metrics
    body_reports = []
    for body in bodies_meta:
        tip_name = body.get("tip")
        tip = doc.getObject(tip_name) if tip_name else None
        info = shape_info(tip.Shape) if tip is not None and hasattr(tip, "Shape") else shape_info(None)
        consumed = bool(body.get("consumed"))
        visible = not consumed
        if visible and info["solid_count"] >= 1 and info["valid"]:
            visible_solids += info["solid_count"]
            volume += info["volume_mm3"]
            area += info["surface_area_mm2"]
            bb = info.get("bounding_box_mm")
            if bb:
                if bbox is None:
                    bbox = {
                        "min": dict(bb["min"]),
                        "max": dict(bb["max"]),
                    }
                else:
                    bbox["min"] = {
                        "x": min(bbox["min"]["x"], bb["min"]["x"]),
                        "y": min(bbox["min"]["y"], bb["min"]["y"]),
                        "z": min(bbox["min"]["z"], bb["min"]["z"]),
                    }
                    bbox["max"] = {
                        "x": max(bbox["max"]["x"], bb["max"]["x"]),
                        "y": max(bbox["max"]["y"], bb["max"]["y"]),
                        "z": max(bbox["max"]["z"], bb["max"]["z"]),
                    }
        if visible and not consumed and info["solid_count"] == 0 and tip is not None:
            issues.append({
                "severity": "error",
                "code": "INVALID_SOLID",
                "message": f"Body '{body.get('name')}' did not produce a solid.",
                "body": body.get("name"),
            })
        env = envelopes.get(body["id"])
        body_reports.append({
            "id": body["id"],
            "name": body.get("name"),
            "freecad_tip": tip_name,
            "consumed": consumed,
            "visible": visible,
            "faces": env["faces"] if env else [],
            **info,
        })

    feature_reports = []
    for feat in features_meta:
        fc = feat.get("freecad_name")
        obj = doc.getObject(fc) if fc else None
        rec = object_record(obj, feat.get("id"), feat.get("kind")) if obj else {
            "agentcad_id": feat.get("id"),
            "freecad_name": fc,
            "label": feat.get("name"),
            "kind": feat.get("kind"),
            "valid": False,
            "shape": None,
        }
        rec["summary"] = feat.get("summary")
        feature_reports.append(rec)

    valid = not any(i["severity"] == "error" for i in issues) and visible_solids >= 0
    # empty document is valid-but-empty
    if any(b.get("visible") and not b.get("consumed") for b in bodies_meta) and visible_solids == 0:
        valid = False

    return {
        "document": {
            "freecad_name": doc.Name,
            "label": doc.Label if hasattr(doc, "Label") else doc.Name,
            "object_count": len(doc.Objects),
        },
        "bodies": body_reports,
        "features": feature_reports,
        "parameters": parameters,
        "bounding_box": bbox,
        "solid_count": visible_solids,
        "volume_mm3": _round(volume, 3),
        "surface_area_mm2": _round(area, 3),
        "valid": valid,
        "issues": issues,
        "shape_type": "Solid" if visible_solids == 1 else ("Compound" if visible_solids > 1 else "Empty"),
    }


def validate_document(doc, mapping, envelopes, bodies_meta, features_meta, parameters) -> dict[str, Any]:
    inspected = inspect_document(doc, mapping, envelopes, bodies_meta, features_meta, parameters)
    issues = list(inspected["issues"])
    for body in inspected["bodies"]:
        if body.get("consumed"):
            continue
        if body.get("shape_type") == "null":
            continue
        if not body.get("valid"):
            issues.append({
                "severity": "error",
                "code": "INVALID_SHAPE",
                "message": f"{body.get('name')} failed B-rep validity.",
                "body": body.get("name"),
            })
        elif body.get("solid_count", 0) < 1 and body.get("freecad_tip"):
            issues.append({
                "severity": "error",
                "code": "INVALID_SOLID",
                "message": f"{body.get('name')} is not a solid (type {body.get('shape_type')}).",
                "body": body.get("name"),
            })
        # Self-intersection: OCCT does not always expose a cheap definitive API.
        # isValid() catches many cases; we do not claim manufacturing watertightness.
    valid = not any(i["severity"] == "error" for i in issues)
    return {
        "valid": valid,
        "shape_type": inspected["shape_type"],
        "solid_count": inspected["solid_count"],
        "volume_mm3": inspected["volume_mm3"],
        "surface_area_mm2": inspected["surface_area_mm2"],
        "bounding_box": inspected["bounding_box"],
        "issues": issues,
        "self_intersection": {
            "checked": False,
            "note": "OpenCascade Shape.isValid() is the authoritative check used here. Dedicated self-intersection classification is not always available through FreeCAD's Python API; we do not fabricate that result.",
        },
    }
