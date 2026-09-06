# Battenmark Public Launch Copy

**Hold these drafts until the P0 promotion-readiness checklist is complete.**
They are intentionally evidence-first and avoid claiming unvalidated client
compatibility.

## Show HN

### Title

Show HN: Battenmark – backend-neutral CAD infrastructure for AI agents using FreeCAD/OpenCascade

### Body

Battenmark is an open-source CAD execution layer for AI agents and software.
Instead of having a model emit backend-specific FreeCAD feature commands, the
caller works through a typed CAD operation surface for creating, editing,
rebuilding, inspecting, validating and exporting geometry.

FreeCAD/OpenCascade is the authoritative B-rep backend today; JSCAD supports
preview/envelope workflows. The same canonical service is exposed over MCP,
HTTP, CLI and Python surfaces.

The client path we have actually proven end-to-end so far is ChatGPT Work on an
Apple Silicon Mac → Battenmark → FreeCAD 1.1.3/OpenCascade. That test produced
real parametric CAD, survived a worker restart, exported FCStd/STEP/STL/3MF,
and produced a physical 3D print. We are deliberately not claiming other LLM
clients are validated through Battenmark until we have equivalent evidence.

The repo also includes release/evaluation evidence, canonical demos, assembly
support for the current rigid subset, selector/gref work, backend capability
discovery and documented limitations.

I would especially value feedback from FreeCAD developers, CAD automation
users, mechanical engineers and people building agent toolchains. Reproducible
failure cases are useful too — the goal is to turn them into benchmark material
rather than hide them.

GitHub: https://github.com/halsyourpal422/Battenmark

## FreeCAD community post

### Title

Battenmark: an open-source, typed agent interface to FreeCAD/OpenCascade — looking for technical testers

### Body

I have been building Battenmark, an open-source CAD infrastructure project that
uses FreeCAD/OpenCascade as its authoritative B-rep backend while keeping the
agent-facing operation surface backend-neutral.

The design goal is not to replace FreeCAD or hide it behind a generic chatbot.
Battenmark sits between agents/software clients and the CAD backend, providing
typed operations, rebuild/validation, selectors, import/export, persistence and
multiple transports.

The end-to-end path validated on physical hardware so far is ChatGPT Work on
Apple Silicon macOS → Battenmark → FreeCAD 1.1.3/OpenCascade. We have exercised
real geometry creation, parametric rebuilds, recovery after worker restart,
FCStd/STEP/STL/3MF export and a successful physical print.

I am specifically interested in FreeCAD-oriented criticism: topology/selector
failure cases, model-history assumptions, import/export edge cases, assembly
limitations, and tasks that would expose places where the abstraction is wrong.

The project is pre-1.0 alpha, and the limitations are documented rather than
hidden. If anyone wants to try a reproducible mechanical task, I would be glad
to collect the result — success or failure — as public benchmark evidence.

GitHub: https://github.com/halsyourpal422/Battenmark

## CAD / engineering community post

### Title

I built an open-source layer that lets AI agents create and validate real FreeCAD/OpenCascade models

### Body

Battenmark is an experiment in treating CAD as an agent-accessible engineering
service rather than asking a model to write ad-hoc CAD scripts.

The agent sends typed operations such as creating solids, holes, fillets,
patterns, selectors and assembly constraints. Battenmark owns the project state,
rebuilds the model, validates geometry and exports normal CAD formats. FreeCAD
and OpenCascade provide the authoritative B-rep backend.

The current end-to-end proof is ChatGPT Work on macOS using Battenmark to build
and validate a real FreeCAD model, export FCStd/STEP/STL/3MF and produce a
physical print. I am now moving from simple proof parts into harder mechanical
and enclosure-style tests.

I am looking for tasks that are difficult enough to reveal abstraction or
reliability problems, not just visually impressive demos.

GitHub: https://github.com/halsyourpal422/Battenmark

## 3D-printing community post

### Title

Prompt → real FreeCAD model → STL/3MF → physical print, using an open-source CAD agent layer

### Body

I have been testing an open-source project called Battenmark that lets an AI
agent work through a typed CAD interface backed by FreeCAD/OpenCascade.

The point is to generate real editable/validatable CAD, not just a mesh from a
text-to-3D model. In the current proof, ChatGPT Work used Battenmark on my Mac to
create a 60 × 25 × 4 mm calibration coupon with nominal 3/4/5 mm through-holes,
rebuild and validate it, export normal CAD/print formats, and then I physically
printed it.

The next public tests are more complicated enclosure/mechanical parts. I am
interested in the kinds of practical parts people repeatedly need but hate
modeling from scratch — brackets, adapters, electronics enclosures, mounts,
fixtures, spacers, etc.

GitHub: https://github.com/halsyourpal422/Battenmark

## Early tester invitation

### Short version

Battenmark is looking for a small first group of technical testers. Give it a
real CAD task, preserve the exact prompt/task, and report whether the model
rebuilt, validated and exported correctly. Failed tasks are useful — they become
benchmark cases. Current authoritative backend: FreeCAD/OpenCascade. Current
published end-to-end client proof: ChatGPT Work on macOS.

### What to ask testers to return

- task/prompt;
- Battenmark commit/version;
- client/runtime;
- FreeCAD version;
- number of corrective turns;
- rebuild result;
- geometry validation result;
- requested export result;
- screenshots or files where shareable;
- what failed or surprised them.

## One-line descriptions

**Developer:** Open, backend-neutral CAD infrastructure for AI agents and software, with FreeCAD/OpenCascade as the authoritative B-rep backend.

**Maker:** A typed path from an AI task to real editable/validatable FreeCAD geometry and printable exports.

**Engineering:** An agent-facing CAD execution and validation layer built around authoritative B-rep geometry rather than ad-hoc CAD scripting.
