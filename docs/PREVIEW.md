# Visual feedback

Agents need to see the solid, not only JSON volumes.

`render_preview` rasterizes the current JSCAD evaluation (the same mesh as the viewport) into deterministic PNG views:

| view | camera |
| --- | --- |
| `isometric` | engineering isometric, Z up |
| `front` | looking −Y |
| `top` | looking −Z |
| `right` / `side` | looking −X |
| `thumbnail` | 256² isometric |
| `all` | isometric + front + top + right |

PNGs are written to `projects/<slug>/previews/<view>.png` and stored as artifacts (`artifact_id`). MCP attaches the PNG as image content so vision-capable clients can inspect them.

The renderer is a software z-buffer (no GUI, no GPU). Lighting is Lambert with a crease pass so box faces read as distinct planes.

FreeCAD does **not** need to be running for previews of parametric AgentCAD documents. Imported B-rep uses the tessellation captured at import time when present.
