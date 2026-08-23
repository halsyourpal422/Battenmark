# Import

AgentCAD can ingest existing CAD files. Import is **not** the inverse of the parametric feature tree.

| format | what you get |
| --- | --- |
| STEP / STP / IGES | OpenCascade B-rep solid(s) |
| FCStd | shapes copied out of the document |
| STL / OBJ / 3MF | mesh; optional shell conversion |

The feature kind is `imported_solid`. It records source format, path, volume, bbox, and a capped tessellation for the viewport/preview. `parametric: false`.

```
agentcad import --project <id> --file plate.step --json
```

HTTP: `POST /api/v1/projects/{id}/import` `{ "path": "...", "format": "step" }`.

Paths must sit inside the AgentCAD workspace (or `/tmp`). The file is copied to `projects/<slug>/imports/` before the worker touches it.

Do not pretend an STL has sketches and constraints. Rebuild of an imported solid re-inserts the source file; it does not invent pads and pockets.
