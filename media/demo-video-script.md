# Battenmark Flagship Demo Video Script

**Purpose:** 60–90 second public proof of Battenmark as the CAD execution layer.

**Current evidence rule:** show only client paths that have actually been
validated through Battenmark. As of 2026-09-06, the published end-to-end client
proof is **ChatGPT Work on macOS → Battenmark → FreeCAD 1.1.3 / OpenCascade**.

## Core message

Battenmark is not a screenshot generator or a CAD chatbot. It is open,
backend-neutral CAD infrastructure that gives agents a typed path to create,
modify, rebuild, validate and export authoritative CAD.

## Version A — can be produced from current verified evidence

### 0:00–0:05 — Hook

**Visual:** final printed calibration coupon in hand, then cut to its FreeCAD model.

**On-screen text:**

`Prompt → Battenmark → FreeCAD/OpenCascade → printable CAD`

**Voiceover:**

> "This part started as an AI task and ended as a real 3D print. Battenmark is the CAD layer in between."

### 0:05–0:15 — Show the path

**Visual:** simple animated flow:

```text
ChatGPT Work
    ↓
Battenmark
    ↓
FreeCAD / OpenCascade
    ↓
FCStd · STEP · STL · 3MF
```

**Voiceover:**

> "On this Mac, ChatGPT Work used Battenmark to drive FreeCAD and OpenCascade directly through Battenmark's typed CAD interface."

### 0:15–0:30 — Build and rebuild

**Visual:** screen recording of the calibration coupon model and operation history.
Show the 60 × 25 × 4 mm body and nominal 3 / 4 / 5 mm through-holes.

**Overlay:**

- create geometry
- rebuild
- validate
- export

**Voiceover:**

> "The model is real CAD: geometry creation, parametric rebuilds, validation and export are all part of the same workflow."

### 0:30–0:40 — Recovery proof

**Visual:** brief terminal/diagnostic clip showing the FreeCAD worker restart and
successful continuation.

**Voiceover:**

> "The workflow was also tested across a worker restart, then continued and revalidated."

### 0:40–0:55 — Export proof

**Visual:** file list or side-by-side icons for FCStd, STEP, STL and 3MF, followed
by the FreeCAD model.

**Voiceover:**

> "Battenmark produced native and interchange outputs including FCStd, STEP, STL and 3MF."

### 0:55–1:05 — Physical close

**Visual:** printed coupon next to calipers and/or the printer.

**Voiceover:**

> "And the result left the screen: the generated part was physically printed."

### 1:05–1:15 — Architecture / CTA

**Visual:** Battenmark architecture diagram, then GitHub repo.

**Voiceover:**

> "Battenmark is open source and backend-neutral. FreeCAD/OpenCascade is the authoritative B-rep path today, with a transport surface built for agents and software."

**On-screen text:**

`github.com/halsyourpal422/Battenmark`

## Version B — preferred launch version after the hard real-world test

Replace the calibration coupon as the opening hero with the harder validated
part (for example, an electronics enclosure) after it passes the same evidence
bar:

- exact task/prompt preserved;
- created through Battenmark, not direct FreeCAD control;
- real FreeCAD/OpenCascade model;
- rebuild and geometry validation;
- FCStd + STEP + STL/3MF outputs as applicable;
- screenshots/video captured;
- physical print where useful;
- any corrections or limitations documented.

Use the calibration coupon as a quick secondary proof shot in Version B.

## Production notes

- **Primary format:** 1920×1080, 16:9, 30 fps.
- **Short-form crop:** preserve center-safe framing for 9:16 clips.
- **Length:** 60–90 seconds for flagship; derive 15–30 second clips afterward.
- **Style:** technical, restrained, evidence-first.
- **Brand:** use the approved dimensioned geometric Battenmark B once the exact
  source asset is in `media/brand/`.
- **Do not fake typing or accelerate CAD creation so aggressively that the demo
  becomes impossible to audit.** Moderate time compression is fine when labeled.
- Keep validation/export filenames visible long enough to read.

## Claims to use

- "Open, backend-neutral CAD infrastructure."
- "Authoritative FreeCAD/OpenCascade B-rep backend."
- "Typed CAD operations rather than backend-specific feature commands."
- "Create, rebuild, validate and export real CAD."
- "Verified end-to-end with ChatGPT Work on macOS."

## Claims to avoid until separately validated

- "Works with every LLM."
- "Claude uses Battenmark" or equivalent client claims without Battenmark-path evidence.
- "Fully autonomous mechanical engineering."
- "Production ready" while the project remains pre-1.0 alpha.
- Claims that direct FreeCAD control proves Battenmark interoperability.
