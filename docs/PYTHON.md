# Python SDK

Transport-only client for HTTP `/api/v1`. Same schema as MCP and the CLI.

```python
from agentcad import AgentCad

cad = AgentCad()  # http://127.0.0.1:8787  or AGENTCAD_URL
st = cad.status()
caps = cad.capabilities()
proj = cad.project_create("plate")
pid = proj["project_id"]
cad.create_box(pid, 80, 50, 12)
cad.validate(pid)
preview = cad.render_preview(pid, view="all")
step = cad.export(pid, "step")
print(step["data"]["artifact_id"])
```

Add `python/` to `PYTHONPATH`. No extra dependencies (stdlib `urllib`).

Auth: `AGENTCAD_API_TOKEN` or `AgentCad(token=...)`.
