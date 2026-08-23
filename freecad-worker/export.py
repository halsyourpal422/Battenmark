"""Authoritative FCStd / STEP / STL / 3MF export."""

from __future__ import annotations

import os
from typing import Any


def _ensure_parent(path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)


def _nonzero(path: str) -> None:
    if not os.path.isfile(path):
        raise RuntimeError(f"Export did not create {path}")
    if os.path.getsize(path) <= 0:
        raise RuntimeError(f"Export created an empty file: {path}")


def _visible_objects(doc, bodies_meta: list[dict[str, Any]], body_id: str | None):
    wanted = []
    for body in bodies_meta:
        if body.get("consumed"):
            continue
        if body_id and body.get("id") != body_id and body.get("name") != body_id:
            continue
        tip = doc.getObject(body.get("tip")) if body.get("tip") else None
        if tip is not None:
            wanted.append(tip)
    if wanted:
        return wanted
    # fallback: all objects that have a valid solid shape
    out = []
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and obj.Shape and not obj.Shape.isNull():
            if getattr(obj.Shape, "Solids", []):
                out.append(obj)
    return out


def export_fcstd(doc, path: str) -> dict[str, Any]:
    _ensure_parent(path)
    doc.saveAs(path)
    _nonzero(path)
    return {"format": "fcstd", "path": path, "bytes": os.path.getsize(path), "objects": [o.Name for o in doc.Objects]}


def export_step(doc, path: str, bodies_meta: list[dict[str, Any]], body_id: str | None = None) -> dict[str, Any]:
    import Import

    objs = _visible_objects(doc, bodies_meta, body_id)
    if not objs:
        raise RuntimeError("Nothing to export as STEP — no visible solid.")
    _ensure_parent(path)
    Import.export(objs, path)
    _nonzero(path)
    head = ""
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(64)
    except Exception:
        head = ""
    if "ISO-10303" not in head:
        raise RuntimeError("STEP export did not produce an ISO-10303 file.")
    return {
        "format": "step",
        "path": path,
        "bytes": os.path.getsize(path),
        "objects": [o.Name for o in objs],
    }


def export_stl(doc, path: str, bodies_meta: list[dict[str, Any]], body_id: str | None = None) -> dict[str, Any]:
    import Mesh

    objs = _visible_objects(doc, bodies_meta, body_id)
    if not objs:
        raise RuntimeError("Nothing to export as STL — no visible solid.")
    _ensure_parent(path)
    Mesh.export(objs, path)
    _nonzero(path)
    return {
        "format": "stl",
        "path": path,
        "bytes": os.path.getsize(path),
        "objects": [o.Name for o in objs],
    }


def export_3mf(doc, path: str, bodies_meta: list[dict[str, Any]], body_id: str | None = None) -> dict[str, Any]:
    import Mesh

    objs = _visible_objects(doc, bodies_meta, body_id)
    if not objs:
        raise RuntimeError("Nothing to export as 3MF — no visible solid.")
    _ensure_parent(path)
    Mesh.export(objs, path)
    _nonzero(path)
    return {
        "format": "3mf",
        "path": path,
        "bytes": os.path.getsize(path),
        "objects": [o.Name for o in objs],
    }
