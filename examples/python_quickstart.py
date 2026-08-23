#!/usr/bin/env python3
"""Battenmark golden-model quickstart via the Python client.

Requires a running Battenmark HTTP server:
    AGENTCAD_API_TOKEN=secret-token npx agentcad serve --port 8787

Environment:
    AGENTCAD_URL          default http://127.0.0.1:8787
    AGENTCAD_API_TOKEN    bearer token configured on the server
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from agentcad import AgentCad  # noqa: E402


def main() -> int:
    client = AgentCad(
        base_url=os.environ.get("AGENTCAD_URL", "http://127.0.0.1:8787"),
        token=os.environ.get("AGENTCAD_API_TOKEN"),
    )

    project_id = client.project_create("python-golden-box")["project_id"]
    client.create_box(project_id, 80, 50, 12)
    result = client.rebuild(project_id)["data"]

    volume = result["volume_mm3"]
    bbox = result["bounding_box"]
    dx = bbox["max"]["x"] - bbox["min"]["x"]
    dy = bbox["max"]["y"] - bbox["min"]["y"]
    dz = bbox["max"]["z"] - bbox["min"]["z"]

    print(f"project_id = {project_id}")
    print(f"valid      = {result['valid']}")
    print(f"volume_mm3 = {volume}")
    print(f"bounds     = {dx:g} x {dy:g} x {dz:g}")

    assert result["valid"], "rebuild reported an invalid document"
    assert abs(volume - 48000) < 1, f"expected 48000 mm3, got {volume}"
    print("GOLDEN MODEL OK (Python transport)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
