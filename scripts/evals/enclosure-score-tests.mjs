#!/usr/bin/env node
import { loadScenario, scoreTrace } from "./score.mjs";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"} ${name.padEnd(44)} ${detail}`);
}

const scenario = await loadScenario("enclosure");
const fixture = scenario.fixture;
function call(name, args = {}, extra = {}) {
  return {
    id: extra.id,
    order: extra.order,
    name,
    args,
    ok: extra.ok ?? true,
    data: extra.data,
  };
}

function baseCalls() {
  return [
    call("project_create", { name: "eval-enclosure" }),
    call("define_parameter", { name: "pcb_length", value: fixture.pcb_l_mm }),
    call("define_parameter", { name: "pcb_width", value: fixture.pcb_w_mm }),
    call("define_parameter", { name: "pcb_height", value: fixture.pcb_h_mm }),
    call("define_parameter", { name: "clearance", value: fixture.clearance_mm }),
    call("define_parameter", { name: "wall", value: fixture.wall_mm }),
    call("create_box", {
      body_id: "outer",
      name: "OuterShell",
      length_mm: 77,
      width_mm: 57,
      height_mm: 15.5,
      origin: { x: 0, y: 0, z: 0 },
    }),
  ];
}

function cavityCalls({ booleanId, booleanFeatureId } = {}) {
  return [
    call("create_box", {
      body_id: "cavity-tool",
      name: "MainCavity",
      length_mm: 73,
      width_mm: 53,
      height_mm: 13.5,
      origin: { x: 2, y: 2, z: 2 },
    }),
    call(
      "boolean",
      {
        target_body_id: "outer",
        tool_body_id: "cavity-tool",
        operation: "subtract",
        name: "MainCavityCut",
      },
      { id: booleanId, data: { id: booleanFeatureId } },
    ),
  ];
}

function usbPocketCalls({ pocketId, pocketFeatureId } = {}) {
  return [
    call("create_sketch", {
      body_id: "outer",
      name: "USB Opening Sketch",
      plane: "YZ",
    }),
    call("add_rectangle", {
      sketch_id: "usb-sketch",
      x_mm: 0,
      y_mm: 3,
      width_mm: fixture.usb_w_mm,
      height_mm: fixture.usb_h_mm,
    }),
    call(
      "pocket",
      { sketch_id: "usb-sketch", depth_mm: fixture.wall_mm, name: "usb_opening" },
      { id: pocketId, data: { id: pocketFeatureId } },
    ),
  ];
}

function connectorBooleanCalls() {
  return [
    call("create_box", {
      body_id: "usb-tool",
      name: "USBOpeningTool",
      length_mm: 2,
      width_mm: fixture.usb_w_mm,
      height_mm: fixture.usb_h_mm,
    }),
    call("boolean", {
      target_body_id: "outer",
      tool_body_id: "usb-tool",
      operation: "subtract",
      name: "USBOpeningCut",
    }),
  ];
}

function trace(featureCalls, extraCalls = []) {
  const calls = [...baseCalls(), ...featureCalls, ...extraCalls].map((item, index) => ({
    ...item,
    id: item.id ?? `call-${index + 1}`,
    order: item.order ?? index + 1,
  }));
  return {
    tool_calls: calls,
    final_state: {
      project_id: "eval-enclosure",
      measurements_as_parameters: true,
      outer_shell_created: true,
      validated: true,
      preview_rendered: true,
      artifact_exported: true,
    },
    artifact_ids: ["enclosure-step"],
    notes: [],
    errors: [],
    completion_status: "complete",
  };
}

function scored(featureCalls, extraCalls = []) {
  return scoreTrace(scenario, trace(featureCalls, extraCalls));
}

{
  const result = scored(usbPocketCalls());
  check(
    "E1-one-usb-pocket-opening-only",
    result.checks.opening_present === true && result.checks.cavity_present === false,
    JSON.stringify(result.checks),
  );
}

{
  const result = scored(cavityCalls());
  check(
    "E2-cavity-only",
    result.checks.cavity_present === true && result.checks.opening_present === false,
    JSON.stringify(result.checks),
  );
}

for (const [name, features] of [
  ["E3-cavity-and-independent-usb", [...cavityCalls(), ...usbPocketCalls()]],
  ["E7-opening-before-cavity", [...usbPocketCalls(), ...cavityCalls()]],
  ["E8-cavity-before-opening", [...cavityCalls(), ...usbPocketCalls()]],
]) {
  const result = scored(features);
  check(
    name,
    result.checks.cavity_present === true &&
      result.checks.opening_present === true &&
      result.metrics.enclosure_evidence.evidence_distinct === true &&
      result.metrics.enclosure_evidence.cavity_evidence_id !==
        result.metrics.enclosure_evidence.opening_evidence_id,
    JSON.stringify(result.metrics.enclosure_evidence),
  );
}

{
  const result = scored(connectorBooleanCalls());
  check(
    "E4-one-connector-boolean-not-both",
    result.checks.opening_present === true && result.checks.cavity_present === false,
    JSON.stringify(result.checks),
  );
}

{
  const smallPockets = [
    call("create_sketch", { body_id: "outer", name: "Port A", plane: "YZ" }),
    call("add_rectangle", { sketch_id: "port-a", x_mm: 0, y_mm: 2, width_mm: 10, height_mm: 5 }),
    call("pocket", { sketch_id: "port-a", depth_mm: 2, name: "port_a" }),
    call("create_sketch", { body_id: "outer", name: "Port B", plane: "YZ" }),
    call("add_rectangle", { sketch_id: "port-b", x_mm: 0, y_mm: 5, width_mm: 8, height_mm: 4 }),
    call("pocket", { sketch_id: "port-b", depth_mm: 2, name: "port_b" }),
  ];
  const result = scored(smallPockets);
  check(
    "E5-two-small-pockets-not-cavity",
    result.checks.cavity_present === false,
    JSON.stringify(result.checks),
  );
}

{
  const result = scored([...cavityCalls(), ...connectorBooleanCalls()]);
  check(
    "E6-cavity-and-connector-boolean",
    result.checks.cavity_present === true &&
      result.checks.opening_present === true &&
      result.metrics.enclosure_evidence.evidence_distinct === true,
    JSON.stringify(result.metrics.enclosure_evidence),
  );
}

{
  const result = scored([
    ...cavityCalls({ booleanId: "duplicate-evidence" }),
    ...usbPocketCalls({ pocketId: "duplicate-evidence" }),
  ]);
  check(
    "E9-duplicate-evidence-id-not-double-counted",
    !(result.checks.cavity_present && result.checks.opening_present),
    JSON.stringify(result.checks),
  );
}

{
  const result = scored(
    [...cavityCalls({ booleanFeatureId: "cavity-feature" }), ...usbPocketCalls()],
    [call("delete_feature", { feature_id: "cavity-feature" })],
  );
  check(
    "E10-deleted-cavity-not-credited",
    result.checks.cavity_present === false && result.checks.opening_present === true,
    JSON.stringify(result.checks),
  );
}

{
  const observedPhase7C4Pattern = [
    call("create_sketch", { body_id: "Body", name: "USB Opening Sketch", plane: "YZ" }),
    call("add_rectangle", {
      sketch_id: "sketch_id",
      x_mm: "(70 + 2 * 1.5 + 2 * 2.0) / 2 - 6",
      y_mm: "3",
      width_mm: 12,
      height_mm: 6,
    }),
    call("pocket", { sketch_id: "sketch_id", depth_mm: 2 }),
  ];
  const result = scored(observedPhase7C4Pattern);
  check(
    "real-trace-usb-pocket-not-cavity",
    result.checks.opening_present === true &&
      result.checks.cavity_present === false &&
      result.score < 100,
    `score=${result.score} ${JSON.stringify(result.checks)}`,
  );
}

if (failures) {
  console.error(`\n${failures} enclosure scorer integrity test(s) failed`);
  process.exit(1);
}

console.log("\nAll enclosure scorer integrity tests passed");
