# Third-party notices for Battenmark

Battenmark's own code is licensed under the Apache License 2.0 (see `LICENSE`).
This file summarizes third-party components; it is informational and not
legal advice.

## Invoked at runtime as a separate process

- **FreeCAD** — LGPL-2.1-or-later. Battenmark launches the headless
  `FreeCADCmd` executable and communicates over stdin/stdout NDJSON. FreeCAD is
  not redistributed by this repository; users install their own build.
- **OpenCascade Technology (OCCT)** — LGPL-2.1-or-later with the exceptions
  published by Open Cascade SAS. Reached through FreeCAD.
- The Python files under `freecad-worker/` are FreeCADCmd-hosted macros that
  execute inside the FreeCAD process; treat them as companion code compatible
  with FreeCAD's LGPL terms.

## In-process dependencies (Node.js)

Selected notable packages (full list and versions: `package-lock.json`;
each package retains its own license notice):

- `@jscad/modeling` — MIT — in-process CSG preview modeling
- `@modelcontextprotocol/sdk` — MIT — MCP transport
- `zod` — MIT — request/response validation
- `kysely`, `pg`, `@electric-sql/pglite` — Apache-2.0/MIT — persistence layers
- React ecosystem packages (`react`, `react-dom`, Radix UI, TanStack stack,
  Tailwind-related runtime packages) — MIT — retained application dependencies

npm dependency licenses are predominantly MIT / Apache-2.0 / ISC / BSD-style;
run `npm ls` or inspect `package-lock.json` for the authoritative set when
redistributing.

## Python client

`python/agentcad` uses only the Python standard library (`urllib`, `json`);
no third-party runtime dependencies.

## Trademarks

"FreeCAD", "OpenCascade" and "JSCAD" are the marks of their respective
projects. This NOTICE grants no trademark rights in any name.
