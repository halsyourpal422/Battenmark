"""Import STEP / FCStd / IGES / mesh files into a FreeCAD document."""

from __future__ import annotations

import os
from typing import Any

import FreeCAD as App
import Part

from rebuild import RebuildError, close_all_documents, _tag
from cad_inspect import inspect_document


SUPPORTED = {
    "step": "step",
    "stp": "step",
    "iges": "iges",
    "igs": "iges",
    "fcstd": "fcstd",
    "stl": "stl",
    "obj": "obj",
    "3mf": "3mf",
}


def _fmt(path: str, explicit: str | None) -> str:
    raw = (explicit or os.path.splitext(path)[1].lstrip(".")).lower()
    if raw not in SUPPORTED:
        raise RebuildError(
            "UNSUPPORTED_FORMAT",
            f"Cannot import '{raw or 'unknown'}'. Supported: STEP, FCStd, IGES, STL, OBJ, 3MF.",
        )
    return SUPPORTED[raw]


def _collect_solids(doc) -> list[Any]:
    solids = []
    for obj in doc.Objects:
        shape = getattr(obj, "Shape", None)
        if shape is None or shape.isNull():
            continue
        if shape.ShapeType == "Solid":
            solids.append(shape)
        else:
            solids.extend(list(shape.Solids))
    return solids


def _bbox_volume(solids: list[Any]) -> tuple[dict[str, Any] | None, float, float]:
    if not solids:
        return None, 0.0, 0.0
    xmin = ymin = zmin = float("inf")
    xmax = ymax = zmax = float("-inf")
    volume = 0.0
    area = 0.0
    for s in solids:
        box = s.BoundBox
        xmin = min(xmin, box.XMin)
        ymin = min(ymin, box.YMin)
        zmin = min(zmin, box.ZMin)
        xmax = max(xmax, box.XMax)
        ymax = max(ymax, box.YMax)
        zmax = max(zmax, box.ZMax)
        try:
            volume += float(s.Volume)
        except Exception:
            pass
        try:
            area += float(s.Area)
        except Exception:
            pass
    return (
        {
            "min": {"x": xmin, "y": ymin, "z": zmin},
            "max": {"x": xmax, "y": ymax, "z": zmax},
            "x": xmax - xmin,
            "y": ymax - ymin,
            "z": zmax - zmin,
        },
        volume,
        area,
    )


def _tessellate(solids: list[Any], cap: int = 6000) -> list[float]:
    if not solids:
        return []
    try:
        import MeshPart
    except Exception:
        return []
    positions: list[float] = []
    for shape in solids:
        if len(positions) >= cap * 9:
            break
        try:
            mesh = MeshPart.meshFromShape(shape=shape, linearDeflection=0.45, angularDeflection=0.5)
            points, facets = mesh.Topology
        except Exception:
            continue
        for facet in facets:
            if len(positions) >= cap * 9:
                break
            if len(facet) < 3:
                continue
            for idx in facet[:3]:
                p = points[idx]
                positions.extend([float(p.x), float(p.y), float(p.z)])
    return positions


def import_path(path: str, format: str | None = None) -> dict[str, Any]:
    if not path or not os.path.isfile(path):
        raise RebuildError("IMPORT_FAILED", f"Import file not found: {path}")
    fmt = _fmt(path, format)
    close_all_documents()
    label = os.path.splitext(os.path.basename(path))[0] or "Imported"

    if fmt == "fcstd":
        doc = App.openDocument(path)
        doc.Label = label
    else:
        doc = App.newDocument(label)
        doc.Label = label
        if fmt in ("step", "iges"):
            import Import  # noqa: WPS433

            Import.insert(path, doc.Name)
        else:
            import Mesh  # noqa: WPS433

            Mesh.insert(path, doc.Name)
            for obj in list(doc.Objects):
                mesh = getattr(obj, "Mesh", None)
                if mesh is None:
                    continue
                try:
                    shape = Part.Shape()
                    shape.makeShapeFromMesh(mesh.Topology, 0.1)
                    solid = Part.Solid(Part.Shell(shape.Faces)) if shape.Faces else shape
                    feat = doc.addObject("Part::Feature", obj.Name + "Solid")
                    feat.Label = obj.Label
                    feat.Shape = solid if not solid.isNull() else shape
                    _tag(feat, "imported", "imported_solid")
                except Exception:
                    pass
        doc.recompute()

    solids = _collect_solids(doc)
    bbox, volume, area = _bbox_volume(solids)
    valid = True
    issues: list[dict[str, Any]] = []
    for s in solids:
        try:
            if not s.isValid():
                valid = False
                issues.append({"severity": "error", "code": "INVALID_SHAPE", "message": "Imported shape failed isValid()."})
        except Exception as err:
            issues.append({"severity": "warning", "code": "INVALID_SHAPE", "message": str(err)})

    parametric = False
    if fmt == "fcstd":
        issues.append(
            {
                "severity": "info",
                "code": "IMPORT_NOT_PARAMETRIC",
                "message": "FCStd was imported as B-rep. AgentCAD parameters live in document.json, not in an arbitrary FCStd tree.",
            }
        )
    elif fmt in ("stl", "obj", "3mf"):
        issues.append(
            {
                "severity": "warning",
                "code": "IMPORT_NOT_PARAMETRIC",
                "message": f"{fmt.upper()} is mesh geometry. It is not an editable parametric feature tree.",
            }
        )
    else:
        issues.append(
            {
                "severity": "info",
                "code": "IMPORT_NOT_PARAMETRIC",
                "message": "Imported B-rep is a solid, not a parametric AgentCAD feature history.",
            }
        )

    mapping: dict[str, str] = {}
    bodies = []
    features = []
    for i, obj in enumerate(doc.Objects):
        if not hasattr(obj, "Shape") or obj.Shape is None or obj.Shape.isNull():
            continue
        aid = f"imported_{i}"
        _tag(obj, aid, "imported_solid")
        mapping[aid] = obj.Name
        bodies.append({"id": aid, "name": obj.Label, "consumed": False, "tip": obj.Name})
        features.append({"id": aid, "name": obj.Label, "kind": "imported_solid", "freecad_name": obj.Name})

    inspected = inspect_document(doc, mapping, {}, bodies, features, {})
    tess = _tessellate(solids)
    inspected.update(
        {
            "source_format": fmt,
            "source_name": os.path.basename(path),
            "parametric": parametric,
            "solid_count": max(len(solids), inspected.get("solid_count") or 0),
            "volume_mm3": volume or inspected.get("volume_mm3") or 0,
            "surface_area_mm2": area or inspected.get("surface_area_mm2") or 0,
            "bounding_box": bbox or inspected.get("bounding_box"),
            "valid": valid and bool(solids or fmt in ("stl", "obj", "3mf")),
            "issues": issues + list(inspected.get("issues") or []),
            "document_name": doc.Name,
            "shape_type": "Solid" if solids else ("Mesh" if fmt in ("stl", "obj", "3mf") else "Empty"),
            "tessellation": tess,
        }
    )
    return {
        "document_name": doc.Name,
        "mapping": mapping,
        "bodies": bodies,
        "features": features,
        "parameters": {},
        "issues": inspected["issues"],
        "inspect": inspected,
    }
