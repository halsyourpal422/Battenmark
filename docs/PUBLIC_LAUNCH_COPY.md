# Battenmark Public Launch Copy

These drafts are intentionally evidence-first. They distinguish client
interoperability, CAD execution, specification fidelity and export fidelity.

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

The strongest current proof is a corrected two-piece Orange Pi 4 Pro enclosure.
The workflow stayed inside Battenmark, went through FreeCAD 1.1.3/OpenCascade,
and ended with fresh FCStd/STEP/STL/3MF exports plus persistence/reopen proof.

The final lid has a 90.6×57.6 mm hollow friction rim with an 85.8×52.8 mm opening
and 2.4 mm walls, plus six true 2.4×55 mm through-vents. Independent parsing of
the final 3MF found exactly two watertight manifold objects. The lid mesh volume
is 13,138.560000 mm³, matching the corrected analytical design of 13,138.56
mm³ essentially exactly. Combined mesh volume is 41,281.246683 mm³, only
0.109317 mm³ / 0.000265% from Battenmark's export-volume result.

The benchmark did not begin as a success. Claude completed the original
50-revision Battenmark-only workflow, which exposed a solid lid plug and blind
vents. Those failures were published as PARTIAL instead of being hidden. The
same persistent project was then reopened and corrected through Battenmark in
ChatGPT Work, producing the final PASS.

Battenmark also has a physical-output proof: ChatGPT Work created and exported a
60×25×4 mm calibration coupon with nominal 3/4/5 mm holes that was physically
printed.

One real platform defect remains from the enclosure correction: editing an
existing pocket's depth could update metadata without reliably rebuilding the
worker geometry. Recreating the stale pocket through Battenmark fixed the model;
that synchronization issue is being tracked separately.

I would especially value feedback from FreeCAD developers, CAD automation users,
mechanical engineers and people building agent toolchains. Reproducible failures
are useful benchmark material.

GitHub: https://github.com/halsyourpal422/Battenmark

## FreeCAD community post

### Title

Battenmark: an open-source typed agent interface to FreeCAD/OpenCascade — corrected Orange Pi benchmark PASS

### Body

I have been building Battenmark, an open-source CAD infrastructure project that
uses FreeCAD/OpenCascade as its authoritative B-rep backend while keeping the
agent-facing operation surface backend-neutral.

The design goal is not to replace FreeCAD or hide it behind a generic chatbot.
Battenmark sits between agents/software clients and the CAD backend, providing
typed operations, rebuild/validation, selectors, import/export, persistence and
multiple transports.

Claude first completed a 50-revision two-piece Orange Pi 4 Pro enclosure workflow
through Battenmark only. That run was intentionally published as PARTIAL because
it exposed a solid lid plug and blind ventilation slots.

The same Battenmark project was later reopened and corrected. The final model now
has a hollow 2.4 mm perimeter friction rim and six true through-vents. Fresh
FCStd/STEP/STL/3MF exports were generated through Battenmark, and independent 3MF
inspection found exactly two watertight manifold objects with no stale or phantom
geometry. The corrected lid volume matches its analytical design essentially
exactly, and persistence/reopen passed through a fresh stdio MCP process.

The full benchmark now passes, while the original failure history remains in the
repo. The correction also exposed a worker synchronization bug involving edited
pocket depth, which is being kept as a regression target rather than hidden.

I am specifically interested in FreeCAD-oriented criticism: topology/selector
failure cases, model-history assumptions, import/export edge cases, assembly
limitations and tasks that expose places where the abstraction is wrong.

GitHub: https://github.com/halsyourpal422/Battenmark

## CAD / engineering community post

### Title

An AI-agent CAD benchmark that went PARTIAL → corrected PASS in real FreeCAD/OpenCascade

### Body

Battenmark treats CAD as an agent-accessible engineering service rather than
asking a model to write ad-hoc CAD scripts.

The interesting part of the latest benchmark is the failure/correction loop. A
two-piece Orange Pi 4 Pro enclosure initially produced valid exportable geometry,
but the lid design was wrong: it used a solid plug and blind vent slots. That run
was labeled PARTIAL even though the geometry rebuilt and exported.

The same persistent Battenmark project was then reopened and corrected entirely
through Battenmark. Final checks verified the hollow perimeter rim, six true
through-vents, two watertight 3MF objects, analytical/mesh volume agreement,
fresh FCStd/STEP/STL/3MF exports and persistence/reopen. The overall benchmark is
now PASS.

That distinction — valid B-rep versus correct design versus faithful export — is
one of the things Battenmark's benchmark format is intended to measure.

GitHub: https://github.com/halsyourpal422/Battenmark

## 3D-printing community post

### Title

Prompt → corrected FreeCAD enclosure → 2-object watertight 3MF, through an open-source AI CAD layer

### Body

Battenmark lets AI agents work through a typed CAD interface backed by
FreeCAD/OpenCascade, with the goal of producing normal editable/validatable CAD
rather than only text-to-3D meshes.

The latest hard test is a two-piece Orange Pi 4 Pro enclosure. The first version
was not good enough to print: the lid had a solid plug and blind vents. That was
published as a PARTIAL result.

The same model was then corrected through Battenmark. The final lid now has a
2.4 mm hollow friction rim and six through-vents. The exported 3MF contains
exactly two watertight manifold objects, and the corrected lid mesh volume matches
its analytical design essentially exactly. Base and lid are ready for slicer
inspection; the intended print orientations are base floor-down/open-rim-up and
lid cap-down.

Battenmark also has an earlier physical-print proof from a 60×25×4 mm calibration
coupon.

GitHub: https://github.com/halsyourpal422/Battenmark

## Early tester invitation

Battenmark is looking for a small first group of technical testers. Give it a
real CAD task, preserve the exact prompt/task, and report whether the model
rebuilt, validated **and matched the requested specification**. Failed tasks are
useful — they become benchmark cases.

Please return:

- task/prompt;
- Battenmark commit/version or project revision IDs;
- client/runtime;
- FreeCAD version;
- number of corrective turns;
- rebuild result;
- geometry validation result;
- dimensional/specification-fidelity result;
- requested export result;
- screenshots/files where shareable;
- what failed or surprised you.

## One-line descriptions

**Developer:** Open, backend-neutral CAD infrastructure for AI agents and software, with FreeCAD/OpenCascade as the authoritative B-rep backend.

**Maker:** A typed path from an AI task to real editable/validatable FreeCAD geometry and printable exports.

**Engineering:** An agent-facing CAD execution and validation layer built around authoritative B-rep geometry rather than ad-hoc CAD scripting.
