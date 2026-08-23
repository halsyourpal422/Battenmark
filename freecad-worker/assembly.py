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
import os
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


def _imported_shape(source: dict[str, Any], label: str):
    """Materialize an imported STEP/FCStd component via existing importer
    semantics. FCStd uses Body.Tip / visible feature shapes; historical
    PartDesign intermediates are never summed."""
    path = source.get("sourcePath")
    fmt = source.get("format")
    if not path:
        raise RuntimeError(f"Imported definition '{label}' has no sourcePath")
    if not os.path.isfile(path):
        raise RuntimeError(f"File not found: {path}")
    compound = None

    if fmt == "step":
        import Import  # noqa: WPS433

        tmp = App.newDocument(f"import_{label}")
        try:
            Import.insert(path, tmp.Name)
            solids = _visible_solids(tmp)
            compound = Part.makeCompound(solids) if solids else None
        finally:
            App.closeDocument(tmp.Name)
    elif fmt == "fcstd":
        opened = App.openDocument(path)
        solids = []
        compound = None
        try:
            # PartDesign feature objects retain historical shapes. Count each
            # Body's final Tip once and skip its contained features; standalone
            # top-level solids outside any Body are still legitimate results.
            bodies = [o for o in opened.Objects if o.TypeId == "PartDesign::Body"]
            owned: set[str] = set()
            for b in bodies:
                for member in getattr(b, "Group", []) or []:
                    owned.add(member.Name)
                tip = getattr(b, "Tip", None)
                shape = None
                if tip is not None:
                    shape = getattr(tip, "Shape", None)
                if shape is None or shape.isNull():
                    shape = getattr(b, "Shape", None)
                if shape is not None and not shape.isNull():
                    for solid in shape.Solids or ([shape] if shape.ShapeType == "Solid" else []):
                        solids.append(solid)
            for obj in opened.Objects:
                # Body results were taken above; every other PartDesign::* object
                # is historical feature geometry owned by some Body.
                if obj.Name in owned or str(obj.TypeId).startswith("PartDesign::"):
                    continue
                shape = getattr(obj, "Shape", None)
                if shape is None or shape.isNull():
                    continue
                for solid in shape.Solids or ([shape] if shape.ShapeType == "Solid" else []):
                    solids.append(solid)
            compound = Part.makeCompound(solids) if solids else None
        finally:
            App.closeDocument(opened.Name)
    else:
        raise RuntimeError(f"Unsupported import format '{fmt}' for assemblies")

    if not solids or compound is None:
        raise RuntimeError(f"Imported definition '{label}' produced no solids")
    return compound


def _visible_solids(doc):
    solids = []
    for obj in doc.Objects:
        shape = getattr(obj, "Shape", None)
        if shape is None or shape.isNull():
            continue
        for solid in shape.Solids or ([shape] if shape.ShapeType == "Solid" else []):
            solids.append(solid)
    return solids


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
        definition = definitions[cid]
        source = definition.get("source") or {"kind": "native"}
        try:
            if source.get("kind") == "imported":
                shape = _imported_shape(source, cid)
            elif source.get("kind") == "native":
                shape, _built = _definition_shape(definition, cid)
            else:
                raise RuntimeError(f"Unknown component source kind '{source.get('kind')}'")
        except Exception as err:  # noqa: BLE001 - surfaced as structured issue
            code = "IMPORT_FAILED" if source.get("kind") == "imported" else "RECOMPUTE_FAILED"
            issues.append({"severity": "error", "code": code, "message": str(err)})
            continue
        def_shapes[cid] = shape
        def_volumes[cid] = sum(s.Volume for s in shape.Solids)

    doc = App.newDocument("Assembly")
    doc.Label = asm.get("name") or "Assembly"
    part = doc.addObject("App::Part", "Assembly")
    part.Label = asm.get("name") or "Assembly"

    # Instance representation: prefer App::Link sharing one definition object
    # per component; degrade to shape copies if links are unavailable/failing.
    use_links = payload.get("use_links") is True
    link_ok = use_links
    def_features = {}
    defs_group = None
    if link_ok:
        try:
            defs_group = doc.addObject("App::Part", "Definitions")
            defs_group.Label = "Definitions"
            part.addObject(defs_group)
        except Exception:
            link_ok = False

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

        made_link = False
        feature = None
        if link_ok:
            try:
                if cid not in def_features:
                    src = doc.addObject("Part::Feature", f"{cid}_definition")
                    src.Shape = def_shapes[cid]
                    src.Visibility = False
                    def_features[cid] = src
                    defs_group.addObject(src)
                feature = doc.addObject("App::Link", iid)
                feature.Label = iid
                feature.LinkedObject = def_features[cid]
                part.addObject(feature)
                made_link = True
            except Exception:
                link_ok = False
                if feature is not None:
                    try:
                        doc.removeObject(feature.Name)
                    except Exception:
                        pass
        if not made_link:
            feature = doc.addObject("Part::Feature", iid)
            feature.Label = iid
            shape_copy = def_shapes[cid].copy()
            shape_copy.Placement = _placement(placement)
            feature.Shape = shape_copy
            part.addObject(feature)
        else:
            feature.Placement = _placement(placement)

        placed_shape = getattr(feature, "Shape", None)
        valid = bool(placed_shape is not None and not placed_shape.isNull()
                     and all(sol.isValid() for sol in placed_shape.Solids))
        volume = sum(sol.Volume for sol in placed_shape.Solids) if placed_shape else 0.0
        total_volume += volume
        bb = placed_shape.BoundBox if placed_shape else None
        instance_reports.append({
            "instance_id": iid,
            "component_id": cid,
            "fixed": bool(inst.get("fixed")),
            "valid": valid,
            "volume_mm3": volume,
            "world_bbox": (
                {"min": {"x": bb.XMin, "y": bb.YMin, "z": bb.ZMin},
                 "max": {"x": bb.XMax, "y": bb.YMax, "z": bb.ZMax}} if bb else None
            ),
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


def check_interference(payload):
    """Authoritative B-rep static interference via Shape.common(). Volumetric
    only; face/edge contact yields ~zero volume and is not reported."""
    import time as _time

    t0 = _time.time()
    built = build_assembly(payload)
    base = built["result"]
    doc = built["session_doc"]
    min_vol = float((payload or {}).get("min_volume_mm3") or 1e-6)
    scope = set((payload or {}).get("instance_ids") or [])

    shapes = {}
    for rep in base["instances"]:
        iid = rep["instance_id"]
        if scope and iid not in scope:
            continue
        obj = doc.getObject(iid)
        sh = getattr(obj, "Shape", None)
        if sh is not None and not sh.isNull():
            shapes[iid] = sh

    ids = sorted(shapes.keys())
    tol = 1e-6
    possible = len(ids) * (len(ids) - 1) // 2
    candidates = 0
    occ_calls = 0
    pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            bba, bbb = shapes[a].BoundBox, shapes[b].BoundBox
            overlap = (
                min(bba.XMax, bbb.XMax) - max(bba.XMin, bbb.XMin) > tol
                and min(bba.YMax, bbb.YMax) - max(bba.YMin, bbb.YMin) > tol
                and min(bba.ZMax, bbb.ZMax) - max(bba.ZMin, bbb.ZMin) > tol
            )
            if not overlap:
                continue
            candidates += 1
            occ_calls += 1
            common = shapes[a].common(shapes[b])
            vol = sum(sol.Volume for sol in (common.Solids or []))
            if vol > min_vol:
                pairs.append({"instance_a": a, "instance_b": b, "intersects": True,
                              "volume_mm3": vol,
                              "bbox_overlap_min": {"x": max(bba.XMin, bbb.XMin), "y": max(bba.YMin, bbb.YMin), "z": max(bba.ZMin, bbb.ZMin)},
                              "bbox_overlap_max": {"x": min(bba.XMax, bbb.XMax), "y": min(bba.YMax, bbb.YMax), "z": min(bba.ZMax, bbb.ZMax)}})
    return {"result": {
        "pairs": pairs,
        "stats": {"instances_checked": len(ids), "possible_pairs": possible,
                  "aabb_candidates": candidates, "occ_boolean_calls": occ_calls,
                  "elapsed_ms": int((_time.time() - t0) * 1000)},
        "semantics": "volumetric only; face/edge contact reported as no interference",
    }}



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
