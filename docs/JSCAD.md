# JSCAD role

```text
FreeCAD / OpenCascade  =  authoritative B-rep / manufacturing geometry
JSCAD                  =  interactive preview / envelope / fallback visualization
```

JSCAD must not silently become authoritative for:

- STEP / FCStd export
- hole/fillet validity that OCC can answer
- manufacturing volumes used as a source of truth when FreeCAD is available

The viewport mesh is CSG. Fillet/chamfer in JSCAD are visual approximations. Envelope selectors (`top_perimeter` on a box) are exact for primitives and approximate after booleans; authoritative topology comes from the FreeCAD worker.

`render.preview` is advertised on the JSCAD backend, not on FreeCAD.
