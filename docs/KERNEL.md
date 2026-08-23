# Kernel abstraction

`src/cad/kernel/` is the **backend adapter layer**. The public contract lives in `src/cad/schema.ts` + `src/cad/backend/`.

Business logic does not require callers to know FreeCAD types.

```ts
interface CadKernel {
  id: "jscad" | "freecad";
  available(): Promise<KernelStatus>;
  evaluate(doc: CadDocument): Promise<Evaluation>;
  inspect(doc: CadDocument): Promise<unknown>;
  validate(doc: CadDocument): Promise<unknown>;
  exportModel(doc: CadDocument, options: ExportOptions): Promise<KernelExport>;
}
```

| Kernel | Module | Role |
| --- | --- | --- |
| `JscadKernel` | `src/cad/kernel/jscad.ts` | Browser-safe CSG preview |
| `FreeCadKernel` | `src/cad/kernel/freecad.server.ts` | Authoritative B-rep via worker |

Document mutations (`create_box`, `set_parameter`, …) stay on `CadDocument`. Kernels **evaluate** that tree.

The agent-facing schema is kernel-independent. New tools `export_step`, `export_fcstd`, and `kernel_status` are the only additive operations in Phase 2.

## Worker protocol

Newline-delimited JSON on stdin/stdout. FreeCAD banners and OCCT progress are ignored if a line is not a JSON object.

Request:

```json
{ "id": "req_001", "operation": "rebuild", "document": { "...CadDocument" : true } }
```

Response:

```json
{ "id": "req_001", "ok": true, "result": { "valid": true, "volume_mm3": 48000, "shape_type": "Solid" } }
```

The TypeScript client (`src/cad/kernel/client.server.ts`) serializes requests, restarts on crash, and times out hung operations (`OPERATION_TIMEOUT` / `WORKER_CRASHED`).

## Worker model

- **One serialized FreeCAD worker** for the process. Requests chain on a single promise; there is no parallel OCC.
- Per-project async locks isolate document mutations at the service layer; OCC work still queues.
- On crash the client respawns `FreeCADCmd` and fails in-flight calls with `WORKER_CRASHED`.
- Timeouts are per-request (`OPERATION_TIMEOUT`).
- `FREECAD_USER_HOME` is unique per worker so concurrent tests do not share config.
- stdout from FreeCAD C++ progress is redirected; JSON-lines use a duplicated fd.
- A future worker pool is possible because the public API never exposes the process. Do not assume request affinity beyond `project_id`.
- File isolation: each project lives under `projects/<slug>/`.

Allowed operations: `hello`, `ping`, `rebuild`, `inspect`, `validate`, `export`, `import`, `query`, `shutdown`.

## Identity mapping

AgentCAD IDs (`feat_outer_box`, `body_base`) are stored as FreeCAD properties `AgentCadId` / `AgentCadKind` and returned in inspect payloads. Agents never see `Face17`.
