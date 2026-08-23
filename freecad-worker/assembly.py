"""Backend-neutral assembly builder for FreeCAD/OpenCascade.

Battenmark owns the canonical assembly state (definitions, instances, solved
transforms). This adapter materializes it as a native FreeCAD document:

    App::Part (assembly)
      └── Part::Feature per instance   (Shape = definition B-rep,
                                        Placement = solved rigid transform)

Instance reuse note: shapes are copied per instance rather than linked
(App::Link requires container plumbing that differs across FreeCAD 1.0/1.1).
Rigid placement never changes component volume; hierarchy and transforms are
visible and editable when the FCStd is reopened.
"""

from __future__ import annotations

import math
from typing import Any

import FreeCAD as App
import Part

from rebuild import close_all_documents, rebuild
from cad_inspect import inspect_document


def _placement(t: dict[str, Any]) -> App.Placement:
    q = t.get("rotation") or {}
    pos = t.get("translation") or {}
    return App.Placement(
        App.Vector(float(pos.get("x", 0)), float(pos.get("y", 0)), float(pos.get("z", 0))),
        App.Rotation(
            float(q.get("x", 0)),
            float(q.get("y", 0)),
            float(q.get("z", 0)),
            float(q.get("w", 1)),
        ),
    )


def _definition_shape(definition: dict[str, Any], label: str):
    """Build one component definition through the standard rebuild pipeline."""
    doc_dict = {
        "schemaVersion": 2,
        "id": f"def_{label}",
        "name": label,
        "units": "mm",
        "createdAt": 0,
        "updatedAt": 0,
        "parameters": definition.get("parameters") or [],
        "bodies": definition.get("bodies") or [],
        "features": definition.get("features") or [],
        "log": [],
        "revisions": [],
        "currentRevisionId": None,
    }
    built = rebuild(doc_dict)
    src_doc = App.getDocument(built["document_name"])
    mapping = built.get("mapping") or {}
    body_meta = {b["id"]: b for b in (definition.get("bodies") or [])}

    solids = []
    for body in built.get("bodies") or []:
        if body.get("consumed") or not body.get("tip"):
            continue
        if body_meta and str(body["id"]) not in body_meta:
            continue
        obj = src_doc.getObject(body["tip"])
        if obj is None:
            continue
        shape = getattr(obj, "Shape", None)
        if shape is None or shape.isNull():
            continue
        for solid in shape.Solids or ([shape] if shape.ShapeType == "Solid" else []):
            solids.append(solid)
    if not solids:
        raise RuntimeError(f"Definition '{label}' produced no solids")
    del mapping
    compound = Part.makeCompound(solids)
    return compound, built


def build_assembly(payload: dict[str, Any]) -> dict[str, Any]:
    """Build an App::Part hierarchy from canonical assembly state."""
    asm = payload["assembly"]
    definitions: dict[str, dict[str, Any]] = payload.get("definitions") or {}
    placements: dict[str, dict[str, Any]] = payload.get("placements") or {}

    # Build every definition FIRST: rebuild() closes all documents as a side
    # effect, so the container must be created only after the last definition.
    close_all_documents()

    instance_reports = []
    total_volume = 0.0
    issues: list[dict[str, Any]] = []

    def_shapes: dict[str, Any] = {}
    def_volumes: dict[str, float] = {}

    for inst in asm.get("instances") or []:
        cid = inst["componentId"]
        if cid in def_shapes or cid not in (definitions or {}):
            continue
        try:
            shape, _built = _definition_shape(definitions[cid], cid)
        except Exception as err:  # noqa: BLE001 - surfaced as structured issue
            issues.append({"severity": "error", "code": "RECOMPUTE_FAILED", "message": str(err)})
            continue
        def_shapes[cid] = shape
        def_volumes[cid] = sum(s.Volume for s in shape.Solids)

    doc = App.newDocument("Assembly")
    doc.Label = asm.get("name") or "Assembly"
    part = doc.addObject("App::Part", "Assembly")
    part.Label = asm.get("name") or "Assembly"

    for inst in asm.get("instances") or []:
        iid = inst["id"]
        cid = inst["componentId"]
        placement = placements.get(iid)
        if placement is None:
            issues.append({"severity": "error", "code": "ASSEMBLY_UNSOLVED", "message": f"Instance '{iid}' has no solved placement."})
            continue
        if cid not in def_shapes:
            if not any(i["message"].startswith(f"Definition '{cid}'") for i in issues):
                issues.append({"severity": "error", "code": "COMPONENT_NOT_FOUND", "message": f"Definition '{cid}' missing."})
            continue

        feature = doc.addObject("Part::Feature", iid)
        feature.Label = iid
        shape_copy = def_shapes[cid].copy()
        shape_copy.Placement = _placement(placement)
        feature.Shape = shape_copy
        part.addObject(feature)

        valid = all(s.isValid() for s in shape_copy.Solids)
        volume = sum(s.Volume for s in shape_copy.Solids)
        total_volume += volume
        bb = shape_copy.BoundBox
        instance_reports.append({
            "instance_id": iid,
            "component_id": cid,
            "fixed": bool(inst.get("fixed")),
            "valid": valid,
            "volume_mm3": volume,
            "world_bbox": {
                "min": {"x": bb.XMin, "y": bb.YMin, "z": bb.ZMin},
                "max": {"x": bb.XMax, "y": bb.YMax, "z": bb.ZMax},
            },
            "transform": placement,
        })

    doc.recompute()

    world_bb = part.Shape.BoundBox if getattr(part, "Shape", None) is not None and not part.Shape.isNull() else None
    result = {
        "assembly_id": asm.get("id"),
        "instances": instance_reports,
        "solid_count": len(instance_reports),
        "total_volume_mm3": total_volume,
        "world_bbox": (
            {"min": {"x": world_bb.XMin, "y": world_bb.YMin, "z": world_bb.ZMin},
             "max": {"x": world_bb.XMax, "y": world_bb.YMax, "z": world_bb.ZMax}}
            if world_bb else None
        ),
        "issues": issues,
        "valid": not any(i["severity"] == "error" for i in issues),
        "representation": "App::Part + Part::Feature per instance (Placement carries the transform)",
    }
    return {"result": result, "session_doc": doc, "part": part}


def export_assembly(payload: dict[str, Any], fmt: str, path: str) -> dict[str, Any]:
    """Build then export. fcstd keeps the native hierarchy; STEP exports the
    placed solids (structured product hierarchy depends on OCC XCAF behaviour)."""
    import os

    from export import _ensure_parent, _nonzero

    built = build_assembly(payload)
    part = built["part"]
    doc = built["session_doc"]
    _ensure_parent(path)
    if fmt == "fcstd":
        doc.saveAs(path)
        _nonzero(path)
    elif fmt == "step":
        import Import  # noqa: WPS433

        Import.export([part], path)
        _nonzero(path)
        head = ""
        with open(path, "r", errors="replace") as handle:
            head = handle.read(64)
        if "ISO-10303" not in head:
            raise RuntimeError("STEP export did not produce an ISO-10303 file.")
    else:
        raise RuntimeError(f"Unsupported assembly export format '{fmt}'")
    return {
        "result": {
            "format": fmt,
            "path": path,
            "bytes": os.path.getsize(path),
            "objects": [o.Name for o in doc.Objects],
            "inspection": built["result"],
        }
    }


def quaternion_to_matrix(q: dict[str, float]):
    x, y, z, w = (float(q.get(k, 0)) for k in ("x", "y", "z", "w"))
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
