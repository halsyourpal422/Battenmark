# Real-World Battenmark Proof Template

Use this template for any public Battenmark demo intended to support an
interoperability or capability claim.

## 1. Claim under test

State one narrow claim. Example:

> GPT Work can use Battenmark on macOS to create, revise, validate and export a
> mechanically meaningful FreeCAD/OpenCascade model without bypassing Battenmark.

Do not use direct FreeCAD control as proof of Battenmark interoperability.

## 2. Environment

- Date:
- Battenmark branch/tag:
- Battenmark commit SHA:
- Client/runtime:
- OS / hardware:
- FreeCAD version:
- OpenCascade version if exposed:
- Transport used:
- Printer/slicer if physical print is part of proof:

## 3. Exact task / prompt

Paste the exact task or prompt here. Do not rewrite it after the result.

## 4. Acceptance criteria

Define pass/fail before execution.

Suggested minimum criteria for a hard mechanical/enclosure test:

- model is created through Battenmark;
- requested primary dimensions are represented parametrically where supported;
- at least one meaningful edit is made after the initial model;
- rebuild succeeds after the edit;
- geometry validation passes;
- no unintended extra solids or self-intersections are reported;
- FCStd export succeeds;
- STEP export succeeds;
- STL and/or 3MF export succeeds when the part is printable;
- generated part opens in FreeCAD independently of the active worker session;
- if a worker restart is in scope, the workflow recovers and revalidates;
- screenshots/renders are preserved;
- physical print is completed when practical.

## 5. Execution log

Record the major Battenmark operations in order. Keep corrective turns and
failures; do not collapse the record into a clean-room success narrative.

## 6. Validation results

- rebuild:
- geometry valid:
- solid count:
- volume / bounding box if relevant:
- critical dimensions checked:
- selector/gref issues:
- worker recovery result:
- warnings:

## 7. Export results

| Format | Result | File | Notes |
| --- | --- | --- | --- |
| FCStd |  |  |  |
| STEP |  |  |  |
| STL |  |  |  |
| 3MF |  |  |  |

## 8. Physical result

- Printed: yes / no
- Material:
- Slicer:
- Critical measured dimensions:
- Fit/function result:
- Photos/evidence location:

A print that exposes dimensional error is still useful evidence. Record the
nominal CAD dimension, measured result and measurement method rather than
silently adjusting the claim.

## 9. Result

**PASS / PARTIAL / FAIL**

Explain why in one paragraph.

## 10. Public claim permitted by this test

Write the narrow statement this evidence supports. Do not generalize from one
client or platform to all LLMs/platforms.

## 11. Follow-up benchmark cases

Convert meaningful failures, ambiguity, extra corrective turns, selector
problems or export problems into reproducible future test cases.
