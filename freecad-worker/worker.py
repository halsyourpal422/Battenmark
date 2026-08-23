#!/usr/bin/env python3
"""
AgentCAD FreeCAD worker.

JSON-lines protocol over stdin/stdout. FreeCAD progress noise is redirected
to stderr; the only stdout after ready is one JSON object per line.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from typing import Any

# Make sibling modules importable when FreeCADCmd runs this file.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# JSON goes to the fd saved by bootstrap.py (original stdout). fd 1 is stderr.
if "AGENTCAD_JSON_FD" in os.environ:
    _JSON_FD = int(os.environ["AGENTCAD_JSON_FD"])
else:
    _JSON_FD = os.dup(1)
    os.dup2(2, 1)
_JSON_OUT = os.fdopen(_JSON_FD, "w", buffering=1)
sys.stdout = sys.stderr

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("PYTHONUNBUFFERED", "1")

import FreeCAD as App  # noqa: E402

Gui = None
try:
    import FreeCADGui as Gui  # noqa: F401
except Exception:
    Gui = None

from export import export_3mf, export_fcstd, export_step, export_stl  # noqa: E402
from cad_inspect import inspect_document, validate_document  # noqa: E402
from rebuild import RebuildError, close_all_documents, rebuild  # noqa: E402
from import_file import import_path  # noqa: E402
from selectors import query_shape, SelectorError  # noqa: E402

ALLOWED_OPS = {
    "hello",
    "ping",
    "rebuild",
    "inspect",
    "validate",
    "export",
    "import",
    "query",
    "shutdown",
}

DEV_PYTHON = os.environ.get("AGENTCAD_FREECAD_DEV_PYTHON") == "1"
SESSION: dict[str, Any] = {
    "mapping": {},
    "envelopes": {},
    "bodies": [],
    "features": [],
    "parameters": {},
    "issues": [],
    "document_name": None,
}


def emit(payload: dict[str, Any]) -> None:
    _JSON_OUT.write(json.dumps(payload, default=str) + "\n")
    _JSON_OUT.flush()


def log(msg: str, **kv: Any) -> None:
    rec = {"ts": time.time(), "level": "info", "msg": msg, **kv}
    sys.stderr.write(json.dumps(rec, default=str) + "\n")
    sys.stderr.flush()


def _module_status() -> dict[str, bool]:
    out = {}
    for name in ("Part", "Mesh", "Import", "Sketcher", "PartDesign", "Spreadsheet", "MeshPart"):
        try:
            __import__(name)
            out[name] = True
        except Exception:
            out[name] = False
    return out


def hello() -> dict[str, Any]:
    ver = App.Version()
    return {
        "freecad_version": ".".join(str(ver[i]) for i in range(3) if i < len(ver)),
        "freecad_revision": ver[3] if len(ver) > 3 else None,
        "python_version": sys.version.split()[0],
        "modules": _module_status(),
        "pid": os.getpid(),
        "headless": True,
        "executable": sys.executable,
        "gui": Gui is not None,
        "dev_python": DEV_PYTHON,
    }


def _err(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"code": code, "message": message, **extra}


def _active_doc():
    name = SESSION.get("document_name")
    if not name:
        return None
    try:
        return App.getDocument(name)
    except Exception:
        return App.ActiveDocument


def handle(req: dict[str, Any]) -> dict[str, Any]:
    op = req.get("operation") or req.get("op")
    if op not in ALLOWED_OPS and not (op == "eval_python" and DEV_PYTHON):
        return {"ok": False, "error": _err("PRIVILEGED_DENIED", f"Operation '{op}' is not allowed.")}

    if op == "hello":
        return {"ok": True, "result": hello()}
    if op == "ping":
        return {"ok": True, "result": {"pid": os.getpid(), "alive": True}}
    if op == "shutdown":
        close_all_documents()
        return {"ok": True, "result": {"shutdown": True}}

    if op == "rebuild":
        document = req.get("document") or (req.get("arguments") or {}).get("document")
        if not isinstance(document, dict):
            return {"ok": False, "error": _err("PARSE_ERROR", "rebuild requires a document object.")}
        t0 = time.time()
        log("rebuild start", name=document.get("name"), nfeat=len(document.get("features") or []))
        built = rebuild(document)
        log("rebuild done", ms=int((time.time() - t0) * 1000), objects=built.get("object_count"), issues=len(built.get("issues") or []))
        SESSION.update(built)
        doc = _active_doc()
        t1 = time.time()
        inspected = inspect_document(
            doc,
            SESSION["mapping"],
            SESSION["envelopes"],
            SESSION["bodies"],
            SESSION["features"],
            SESSION["parameters"],
        )
        log("inspect done", ms=int((time.time() - t1) * 1000), valid=inspected.get("valid"))
        inspected["issues"] = list(built.get("issues") or []) + list(inspected.get("issues") or [])
        inspected["valid"] = not any(i.get("severity") == "error" for i in inspected["issues"])
        inspected["rebuild_ms"] = int((time.time() - t0) * 1000)
        inspected["mapping"] = SESSION["mapping"]
        inspected["object_count"] = built.get("object_count")
        return {
            "ok": True,
            "result": inspected,
            "warnings": [i for i in inspected["issues"] if i.get("severity") != "error"],
        }

    if op == "inspect":
        doc = _active_doc()
        if doc is None:
            return {"ok": False, "error": _err("NO_DOCUMENT", "No FreeCAD document is loaded. Call rebuild first.")}
        result = inspect_document(
            doc, SESSION["mapping"], SESSION["envelopes"], SESSION["bodies"], SESSION["features"], SESSION["parameters"]
        )
        return {"ok": True, "result": result}

    if op == "query":
        document = req.get("document") or (req.get("arguments") or {}).get("document")
        if isinstance(document, dict):
            built = rebuild(document)
            SESSION.update(built)
        doc = _active_doc()
        if doc is None:
            return {"ok": False, "error": _err("NO_DOCUMENT", "No FreeCAD document is loaded. Call rebuild first.")}
        args = req.get("arguments") or {}
        body_id = args.get("body_id")
        selector = args.get("selector")
        entity = args.get("entity") or "edge"
        created_by = args.get("created_by")
        if isinstance(selector, str) or selector is None:
            selector = {"entity": entity, "selector": selector or ("all_edges" if entity == "edge" else "planar")}
        elif isinstance(selector, dict):
            selector = {**selector, "entity": selector.get("entity") or entity}
            if created_by:
                selector["created_by"] = created_by
        shape = None
        tip_name = None
        for b in SESSION.get("bodies") or []:
            if not body_id or b.get("id") == body_id or b.get("name") == body_id:
                if b.get("consumed"):
                    continue
                tip_name = b.get("tip")
                break
        if tip_name:
            obj = doc.getObject(tip_name)
            if obj is not None:
                shape = getattr(obj, "Shape", None)
        if shape is None or shape.isNull():
            # fall back to compound of visible solids
            solids = []
            for obj in doc.Objects:
                sh = getattr(obj, "Shape", None)
                if sh is not None and not sh.isNull() and getattr(sh, "Solids", None):
                    solids.extend(list(sh.Solids))
            if solids:
                shape = solids[0]
                for extra in solids[1:]:
                    shape = shape.fuse(extra)
        if shape is None or shape.isNull():
            return {"ok": False, "error": _err("GEOMETRY_SELECTOR_NO_MATCH", "No solid is available to query.")}
        try:
            result = query_shape(
                shape,
                selector,
                SESSION.get("parameters") or {},
                created_by=created_by,
                grefs=args.get("grefs"),
            )
            result.pop("_raw", None)
            return {"ok": True, "result": result}
        except SelectorError as err:
            return {"ok": False, "error": err.as_dict()}

    if op == "validate":
        doc = _active_doc()
        if doc is None:
            return {"ok": False, "error": _err("NO_DOCUMENT", "No FreeCAD document is loaded. Call rebuild first.")}
        result = validate_document(
            doc, SESSION["mapping"], SESSION["envelopes"], SESSION["bodies"], SESSION["features"], SESSION["parameters"]
        )
        result["issues"] = list(SESSION.get("issues") or []) + list(result.get("issues") or [])
        result["valid"] = not any(i.get("severity") == "error" for i in result["issues"])
        return {"ok": result["valid"], "result": result}

    if op == "export":
        args = req.get("arguments") or {}
        fmt = (args.get("format") or req.get("format") or "step").lower()
        path = args.get("path") or req.get("path")
        body_id = args.get("body_id") or req.get("body_id")
        if not path:
            return {"ok": False, "error": _err("PARSE_ERROR", "export requires a path.")}
        doc = _active_doc()
        if doc is None:
            return {"ok": False, "error": _err("NO_DOCUMENT", "No FreeCAD document is loaded. Call rebuild first.")}
        try:
            if fmt == "fcstd":
                result = export_fcstd(doc, path)
            elif fmt in ("step", "stp"):
                result = export_step(doc, path, SESSION["bodies"], body_id)
            elif fmt == "stl":
                result = export_stl(doc, path, SESSION["bodies"], body_id)
            elif fmt == "3mf":
                result = export_3mf(doc, path, SESSION["bodies"], body_id)
            else:
                return {"ok": False, "error": _err("EXPORT_FAILED", f"Unsupported format '{fmt}'.")}
        except Exception as err:
            return {"ok": False, "error": _err("EXPORT_FAILED", str(err), format=fmt, path=path)}
        return {"ok": True, "result": result}

    if op == "import":
        args = req.get("arguments") or {}
        path = args.get("path") or req.get("path")
        fmt = args.get("format") or req.get("format")
        if not path:
            return {"ok": False, "error": _err("PARSE_ERROR", "import requires a path.")}
        try:
            imported = import_path(str(path), str(fmt) if fmt else None)
        except RebuildError as err:
            return {"ok": False, "error": err.as_dict()}
        SESSION.update(
            {
                "mapping": imported.get("mapping") or {},
                "envelopes": {},
                "bodies": imported.get("bodies") or [],
                "features": imported.get("features") or [],
                "parameters": {},
                "issues": imported.get("issues") or [],
                "document_name": imported.get("document_name"),
            }
        )
        return {"ok": True, "result": imported}

    if op == "eval_python" and DEV_PYTHON:
        src = (req.get("arguments") or {}).get("code") or ""
        loc: dict[str, Any] = {"App": App, "session": SESSION}
        exec(src, loc, loc)  # noqa: S102
        return {"ok": True, "result": {"executed": True}}

    return {"ok": False, "error": _err("PRIVILEGED_DENIED", f"Unhandled operation '{op}'.")}


def main() -> None:
    log("worker_start", pid=os.getpid(), python=sys.version.split()[0])
    emit({"type": "ready", "ok": True, "result": hello()})
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            if not isinstance(req, dict):
                emit({"id": None, "ok": False, "error": _err("PARSE_ERROR", "Request must be a JSON object.")})
                continue
            req_id = req.get("id")
            op = req.get("operation") or req.get("op")
            t0 = time.time()
            log("request", id=req_id, operation=op)
            try:
                result = handle(req)
            except RebuildError as err:
                result = {"ok": False, "error": err.as_dict()}
            except Exception as err:
                result = {
                    "ok": False,
                    "error": _err(
                        "RECOMPUTE_FAILED",
                        str(err),
                        traceback="".join(traceback.format_exception(err)),
                    ),
                }
            duration_ms = int((time.time() - t0) * 1000)
            result["id"] = req_id
            result["duration_ms"] = duration_ms
            log("response", id=req_id, operation=op, ok=result.get("ok"), duration_ms=duration_ms)
            emit(result)
            if op == "shutdown":
                break
        except json.JSONDecodeError as err:
            emit({"id": req_id, "ok": False, "error": _err("PARSE_ERROR", f"Malformed JSON: {err}")})
        except Exception as err:
            emit({
                "id": req_id,
                "ok": False,
                "error": _err("WORKER_CRASHED", str(err), traceback="".join(traceback.format_exception(err))),
            })
    log("worker_exit", pid=os.getpid())


if __name__ == "__main__":
    main()
