import { runAcceptanceTests } from "./tests";

const results = runAcceptanceTests();
let failed = 0;
for (const r of results) {
  const mark = r.passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.id.padEnd(16)} ${r.name} — ${r.detail}`);
  if (!r.passed) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} cad tests passed`);
if (failed) process.exit(1);
