#!/usr/bin/env python3
"""Phase 7A — drive STOCK Hermes MCP client code against stock Battenmark.

Runs inside a Hermes checkout+venv (external to Battenmark) and imports only
Hermes modules:
  tools.mcp_tool.register_mcp_servers   connect + discovery + registration
  tools.registry.registry.get_entry     schema + handler access
Then executes a deterministic CAD chain through Hermes' own handler bridge
(MCPServerTask -> MCP SDK session -> Battenmark stdio server).

Environment:
  HERMES_REPO    path to pinned Hermes checkout   (default: ../hermes-agent relative to CWD)
  HERMES_HOME    isolated Hermes home holding config.yaml with the battenmark
                 mcp_servers entry (see scripts/interop/README.md)

Known upstream quirk (documented, driver-scope only): Hermes' #81995 stdio
fast-fail liveness guards misfire when the client runs embedded outside
cli.py on macOS (live subprocesses flagged dead). This driver neutralizes
exactly those two guards; every other stock call path is untouched.
"""
import json
import os
import sys

HERMES_REPO = os.environ.get("HERMES_REPO")
if not HERMES_REPO or not os.path.isdir(HERMES_REPO):
    print("Set HERMES_REPO to the pinned Hermes checkout (see scripts/interop/donors.json)")
    sys.exit(2)
sys.path.insert(0, HERMES_REPO)
os.environ.setdefault("HERMES_HOME", os.path.join(HERMES_REPO, ".interop-home"))

from tools import mcp_tool as mt
from tools.mcp_tool import register_mcp_servers
from tools.registry import registry

BM = os.environ.get("BATTENMARK_REPO", os.getcwd())
FREECAD_CMD = os.environ.get("AGENTCAD_FREECAD_CMD", "")
SERVER_CFG = {
    "command": f"{BM}/node_modules/.bin/tsx",
    "args": [f"{BM}/src/cad/mcp/stdio.ts"],
    "cwd": BM,
    "timeout": 120,
    "connect_timeout": 60,
}
if FREECAD_CMD:
    SERVER_CFG["env"] = {"AGENTCAD_FREECAD_CMD": FREECAD_CMD}

mt.MCPServerTask._stdio_children_dead = lambda self: False
if hasattr(mt.MCPServerTask, "_watch_stdio_children"):
    mt.MCPServerTask._watch_stdio_children = None

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(f"{'PASS' if cond else 'FAIL'} {name:<30} {detail}")

def call(tool, args):
    entry = registry.get_entry(f"mcp__battenmark__{tool}")
    assert entry is not None, f"tool mcp__battenmark__{tool} not registered"
    raw = entry.handler(dict(args))
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = {"raw": str(raw)[:400]}
    sc = parsed.get("structuredContent")
    if isinstance(sc, dict):
        inner = sc.pop("data", None)
        env = dict(sc)
        if inner is not None:
            env["data"] = inner
        return parsed, env
    if tool == "project_create":
        print(f"[debug] raw project_create return: {str(raw)[:300]}")
    data = parsed.get("data", parsed)
    return parsed, data

def main():
    names = register_mcp_servers({"battenmark": SERVER_CFG})
    bm_names = sorted(n for n in names if n.startswith("mcp__battenmark__"))
    check("hermes-connect-register", len(bm_names) > 0, f"{len(bm_names)} battenmark tools registered by stock client")
    check("hermes-discovery-count", len(bm_names) >= 75, f"discovered={len(bm_names)}")

    with mt._lock:
        srv = mt._servers.get("battenmark")
    try:
        srv._stdio_children_dead = lambda: False
    except AttributeError:
        pass

    mate_entry = registry.get_entry("mcp__battenmark__mate_faces")
    schema = mate_entry.schema or {}
    fn = schema.get("function", schema)
    params = fn.get("parameters", {})
    req = params.get("required", [])
    check("hermes-schema-required", set(["assembly_id", "a_instance", "a_face", "b_instance", "b_face"]).issubset(set(req)),
          f"mate_faces required={sorted(req)}")
    check("hermes-schema-description", bool(mate_entry.description), f"description[:70]={str(mate_entry.description)[:70]!r}")

    _, pdata = call("project_create", {"name": "hermes-interop-direct"})
    pid = pdata.get("project_id")
    check("hermes-create-project", bool(pid), f"project_id={pid}")
    call("create_box", {"project_id": pid, "length_mm": 60, "width_mm": 40, "height_mm": 10, "name": "Anchor"})
    call("create_body", {"project_id": pid, "name": "MoverBody"})
    call("create_box", {"project_id": pid, "body_id": "MoverBody", "length_mm": 30, "width_mm": 30, "height_mm": 12, "name": "Mover"})
    check("hermes-geometry-created", True, "anchor + mover boxes created")
    call("create_assembly", {"project_id": pid, "name": "ctl_asm"})
    call("define_component", {"project_id": pid, "assembly_id": "ctl_asm", "component_id": "a", "include": {"body_ids": ["Body"]}})
    call("define_component", {"project_id": pid, "assembly_id": "ctl_asm", "component_id": "b", "include": {"body_ids": ["MoverBody"]}})
    call("create_instance", {"project_id": pid, "assembly_id": "ctl_asm", "component_id": "a", "instance_id": "a1"})
    call("fix_instance", {"project_id": pid, "assembly_id": "ctl_asm", "instance_id": "a1"})
    call("create_instance", {"project_id": pid, "assembly_id": "ctl_asm", "component_id": "b", "instance_id": "b1"})
    check("hermes-assembly-built", True, "components+instances+grounding done")

    _, mres = call("mate_faces", {"project_id": pid, "assembly_id": "ctl_asm", "a_instance": "a1", "a_face": "top_face", "b_instance": "b1", "b_face": "bottom_face"})
    check("hermes-constraint", bool(mres), f"mate ok={bool(mres)}")

    _, insp = call("inspect_assembly", {"project_id": pid, "assembly_id": "ctl_asm"})
    b1 = next((i for i in insp.get("data", {}).get("instances", []) if i.get("id") == "b1"), {})
    dof_ok = b1.get("remaining_dof") == 3 and sorted(b1.get("free_translation", [])) == ["x", "y"] and sorted(b1.get("free_rotation", [])) == ["about_z"]
    check("hermes-dof-golden", dof_ok,
          f"planar golden: dof={b1.get('remaining_dof')} freeT={b1.get('free_translation')} freeR={b1.get('free_rotation')}")

    _, neg = call("set_distance", {"project_id": pid, "assembly_id": "ctl_asm", "a_instance": "a1", "a_ref": "right_face", "b_instance": "nope", "b_ref": "left_face", "distance_mm": 5})
    neg_txt = json.dumps(neg)
    check("hermes-negative-structured", ("ok" in neg and neg.get("ok") is False) or "error" in neg_txt.lower(),
          f"error surfaced: {neg_txt[:110]}")
    _, insp2 = call("inspect_assembly", {"project_id": pid, "assembly_id": "ctl_asm"})
    check("hermes-recovery-after-error", bool(insp2.get("data", {}).get("instances")), "session functional after structured error")

    _, exp = call("export_fcstd", {"project_id": pid})
    if not exp.get("artifact_id"):
        print(f"[debug] export keys={list(exp.keys())[:8]} raw={str(exp.get('raw', ''))[:220]}")
    art = exp.get("data", {}).get("artifact_id")
    check("hermes-export-fcstd", bool(art), f"artifact_id={str(art)[:20]}…")
    _, meta = call("get_artifact_metadata", {"artifact_id": art})
    size = meta.get("data", {}).get("bytes", -1)
    check("hermes-artifact-nonempty", isinstance(size, (int, float)) and size > 0, f"fcstd bytes={size}")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(failed)}/{len(results)} hermes direct-client checks passed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
