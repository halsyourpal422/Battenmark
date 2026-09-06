# Battenmark Flagship Demo Video Script

**Purpose:** 60–90 second public proof of Battenmark as the CAD execution layer.

**Current evidence rule:** show only client paths that have actually been
validated through Battenmark. As of 2026-09-06:

- ChatGPT Work on macOS has a full-fidelity Orange Pi benchmark plus physical-print proof;
- Claude has Battenmark MCP interoperability proof and completed the original 50-revision enclosure workflow;
- Hermes has stock-client MCP interoperability evidence.

## Core message

Battenmark is not a screenshot generator or a CAD chatbot. It is open,
backend-neutral CAD infrastructure that gives agents a typed path to create,
modify, rebuild, validate and export authoritative CAD.

The launch demo should tell the **PARTIAL → correction → PASS** story rather than
showing only the final render.

## Preferred launch version — corrected Orange Pi 4 Pro enclosure

### 0:00–0:06 — Hook

**Visual:** corrected two-piece Orange Pi enclosure model, then a quick cut to the
final 3MF showing base + lid as separate objects.

**On-screen text:**

`AI task → Battenmark → FreeCAD/OpenCascade → verified CAD`

**Voiceover:**

> "This enclosure did not pass on the first try — and that is exactly why this is a useful CAD benchmark."

### 0:06–0:16 — Show the execution layer

**Visual:** animated flow:

```text
Claude / ChatGPT Work
        ↓
     Battenmark
        ↓
FreeCAD / OpenCascade
        ↓
FCStd · STEP · STL · 3MF
```

**Voiceover:**

> "Battenmark sits between AI agents and FreeCAD/OpenCascade, giving them a typed CAD operation surface instead of ad-hoc backend scripts."

### 0:16–0:28 — Show the initial PARTIAL result

**Visual:** highlight the earlier lid geometry.

**Overlay:**

- solid lid plug — WRONG
- blind vents — WRONG
- valid/exportable geometry ≠ correct design

**Voiceover:**

> "The first 50-revision enclosure rebuilt and exported, but the lid was mechanically wrong: a solid plug and blind ventilation. We classified it PARTIAL instead of calling valid geometry a success."

### 0:28–0:43 — Correction through Battenmark

**Visual:** show the corrected rim and vent operations/history.

**Overlay:**

- rim outer: 90.6 × 57.6 mm
- opening: 85.8 × 52.8 mm
- wall: 2.4 mm
- 6 × through-vents: 2.4 × 55 mm

**Voiceover:**

> "The same persistent Battenmark project was reopened and corrected: the solid plug became a hollow 2.4 millimeter friction rim, and all six vents were rebuilt as true through-cuts."

### 0:43–0:58 — Independent export proof

**Visual:** final 3MF forensic results beside the model.

**Overlay:**

- 2 objects
- 0 boundary edges
- 0 non-manifold mesh edges
- lid analytical: 13,138.56 mm³
- lid 3MF: 13,138.560000 mm³

**Voiceover:**

> "The final 3MF contains exactly two watertight manifold objects. The lid's exported mesh volume matches its analytical design essentially exactly."

### 0:58–1:08 — Persistence + failure honesty

**Visual:** fresh MCP reopen / revision IDs, then briefly show issue #26 title.

**Voiceover:**

> "A fresh MCP process reopened the project and recovered the same final state. The run also exposed a real worker-sync bug, which is tracked publicly instead of being hidden by the successful recovery."

### 1:08–1:18 — Physical secondary proof

**Visual:** printed 60 × 25 × 4 mm calibration coupon and calipers/printer.

**Voiceover:**

> "And Battenmark has already crossed from CAD to hardware: an earlier calibration model was physically printed from the same FreeCAD-backed workflow."

### 1:18–1:28 — CTA

**Visual:** Battenmark lockup, architecture diagram, GitHub repo.

**Voiceover:**

> "Battenmark is open source, backend-neutral, and built to make agent-driven CAD auditable."

**On-screen text:**

`github.com/halsyourpal422/Battenmark`

## Short 30-second cut

1. Orange Pi final model — 3 sec.
2. Show initial solid plug/blind vents — 5 sec.
3. Show corrected rim/through vents — 7 sec.
4. Show 2-object watertight 3MF + analytical volume match — 6 sec.
5. Show printed coupon — 4 sec.
6. Battenmark logo + GitHub — 5 sec.

## Production notes

- **Primary format:** 1920×1080, 16:9, 30 fps.
- **Short-form crop:** preserve center-safe framing for 9:16 clips.
- **Length:** 60–90 seconds for flagship; derive 15–30 second clips afterward.
- **Style:** technical, restrained, evidence-first.
- **Brand:** use the approved geometric Battenmark B and horizontal lockup from `media/brand/`.
- **Do not fake typing or hide failed modeling steps.** Moderate time compression is fine when labeled.
- Keep validation/export numbers visible long enough to read.
- Prefer real FreeCAD/Battenmark screen capture over recreated animations whenever possible.

## Claims to use

- "Open, backend-neutral CAD infrastructure."
- "Authoritative FreeCAD/OpenCascade B-rep backend."
- "Typed CAD operations rather than backend-specific feature commands."
- "Create, rebuild, validate and export real CAD."
- "Corrected Orange Pi 4 Pro hard benchmark: PASS."
- "Final 3MF: two watertight manifold objects."
- "Corrected lid analytical volume matches exported mesh essentially exactly."
- "ChatGPT Work validated through Battenmark on macOS."
- "Claude validated through Battenmark MCP."

## Claims to avoid

- "Works with every LLM."
- "Fully autonomous mechanical engineering."
- "Production ready" while the project remains pre-1.0 alpha.
- Claims that direct FreeCAD control proves Battenmark interoperability.
- Claims that the final PASS means no platform bugs remain.
