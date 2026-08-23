#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const script = resolve(root, "src/cad/cli/main.ts");
const tsx = resolve(root, "node_modules/tsx/dist/cli.mjs");
const child = spawn(process.execPath, [tsx, "--tsconfig", resolve(root, "tsconfig.json"), script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
