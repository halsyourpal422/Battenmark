"""Minimal urllib client for AgentCAD HTTP /api/v1.

The Python SDK is a transport, not a second CAD engine.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


class AgentCadError(RuntimeError):
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        err = payload.get("error") or {}
        super().__init__(err.get("message") or payload.get("message") or "AgentCAD error")
        self.code = err.get("error")


class AgentCad:
    def __init__(self, base_url: str | None = None, token: str | None = None, timeout: float = 60.0):
        self.base_url = (base_url or os.environ.get("AGENTCAD_URL") or "http://127.0.0.1:8787").rstrip("/")
        self.token = token if token is not None else os.environ.get("AGENTCAD_API_TOKEN")
        self.timeout = timeout

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}/api/v1{path}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"accept": "application/json"}
        if data is not None:
            headers["content-type"] = "application/json"
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8") if err.fp else "{}"
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"ok": False, "error": {"error": "MALFORMED_REQUEST", "message": raw}}
            raise AgentCadError(payload) from err
        payload = json.loads(raw) if raw else {}
        if payload.get("ok") is False:
            raise AgentCadError(payload)
        return payload

    def status(self) -> dict[str, Any]:
        return self._request("GET", "/status")

    def capabilities(self) -> dict[str, Any]:
        return self._request("GET", "/capabilities")

    def create_hole(self, project_id: str, body_id: str, diameter_mm: float, **kw: Any) -> dict[str, Any]:
        return self.call(project_id, "create_hole", body_id=body_id, diameter_mm=diameter_mm, **kw)

    def project_create(self, name: str, slug: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name}
        if slug:
            body["slug"] = slug
        return self._request("POST", "/projects", body)

    def project_list(self) -> dict[str, Any]:
        return self._request("GET", "/projects")

    def inspect(self, project_id: str) -> dict[str, Any]:
        return self._request("GET", f"/projects/{project_id}/document")

    def call(self, project_id: str, operation: str, **arguments: Any) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/projects/{project_id}/operations",
            {"operation": operation, "arguments": arguments},
        )

    def call_backend(self, project_id: str, operation: str, backend: str, **arguments: Any) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/projects/{project_id}/operations",
            {"operation": operation, "arguments": arguments, "backend": backend},
        )

    def create_box(self, project_id: str, length_mm: float, width_mm: float, height_mm: float, **kw: Any) -> dict[str, Any]:
        return self.call(project_id, "create_box", length_mm=length_mm, width_mm=width_mm, height_mm=height_mm, **kw)

    def validate(self, project_id: str, kernel: str = "jscad") -> dict[str, Any]:
        return self._request("POST", f"/projects/{project_id}/validate", {"kernel": kernel})

    def rebuild(self, project_id: str) -> dict[str, Any]:
        return self._request("POST", f"/projects/{project_id}/rebuild")

    def render_preview(self, project_id: str, view: str = "isometric") -> dict[str, Any]:
        return self._request("POST", f"/projects/{project_id}/preview", {"view": view})

    def export(self, project_id: str, format: str = "step") -> dict[str, Any]:
        return self._request("POST", f"/projects/{project_id}/exports", {"format": format})

    def import_file(self, project_id: str, path: str, format: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"path": path}
        if format:
            body["format"] = format
        return self._request("POST", f"/projects/{project_id}/import", body)

    def query_geometry(self, project_id: str, selector: str | dict[str, Any], entity: str = "edge", **kw: Any) -> dict[str, Any]:
        return self.call(project_id, "query_geometry", selector=selector, entity=entity, **kw)

    def inspect_faces(self, project_id: str, selector: str | dict[str, Any] | None = None, **kw: Any) -> dict[str, Any]:
        args: dict[str, Any] = {}
        if selector is not None:
            args["selector"] = selector
        args.update(kw)
        return self.call(project_id, "inspect_faces", **args)

    def inspect_edges(self, project_id: str, selector: str | dict[str, Any] | None = None, **kw: Any) -> dict[str, Any]:
        args: dict[str, Any] = {}
        if selector is not None:
            args["selector"] = selector
        args.update(kw)
        return self.call(project_id, "inspect_edges", **args)

    def inspect_dependencies(self, project_id: str, name: str) -> dict[str, Any]:
        return self.call(project_id, "inspect_dependencies", name=name)

    def set_parameter(self, project_id: str, name: str, value: float) -> dict[str, Any]:
        return self.call(project_id, "set_parameter", name=name, value=value)

    def artifact(self, artifact_id: str, download: bool = False) -> bytes | dict[str, Any]:
        suffix = "" if download else "?download=meta"
        if not download:
            return self._request("GET", f"/artifacts/{artifact_id}{suffix}")
        url = f"{self.base_url}/api/v1/artifacts/{artifact_id}"
        headers = {}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return resp.read()
