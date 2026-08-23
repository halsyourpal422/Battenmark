import {
  discoverFreeCad,
  freeCadSearchPlan,
  macosBundleExecutables,
  macosBundleRoots,
  macosHomebrewExecutables,
  linuxSystemExecutables,
  windowsExecutables,
  type DiscoverContext,
} from "./discover.server";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface T {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

function run(id: string, name: string, fn: () => string | void): T {
  try {
    return { id, name, passed: true, detail: fn() ?? "ok" };
  } catch (err) {
    return { id, name, passed: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function ctx(partial: Partial<DiscoverContext> & { existing?: string[] }): DiscoverContext {
  const existing = new Set(partial.existing ?? []);
  return {
    platform: partial.platform ?? "linux",
    arch: partial.arch ?? "x64",
    homedir: partial.homedir ?? "/Users/dev",
    env: partial.env ?? {},
    exists: partial.exists ?? ((p) => existing.has(p)),
    which: partial.which ?? (() => null),
    probeVersion: partial.probeVersion ?? (() => "1.0.2"),
  };
}

const results: T[] = [];

results.push(
  run("bundle-paths", "macOS bundle executable candidates", () => {
    const exes = macosBundleExecutables("/Applications/FreeCAD.app");
    assert(exes.includes("/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"), "Resources/bin");
    assert(exes.includes("/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd"), "MacOS/FreeCADCmd");
    assert(exes.includes("/Applications/FreeCAD.app/Contents/MacOS/FreeCAD"), "MacOS/FreeCAD");
    const roots = macosBundleRoots("/Users/dev");
    assert(roots.includes("/Applications/FreeCAD.app"), "system Applications");
    assert(roots.includes("/Users/dev/Applications/FreeCAD.app"), "user Applications");
    return `${exes.length} executables × ${roots.length} roots`;
  }),
);

results.push(
  run("env-wins", "AGENTCAD_FREECAD_CMD beats bundle", () => {
    const d = discoverFreeCad(
      ctx({
        platform: "darwin",
        arch: "arm64",
        existing: ["/custom/FreeCADCmd", "/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd"],
        env: { AGENTCAD_FREECAD_CMD: "/custom/FreeCADCmd" },
      }),
    );
    assert(d.mode === "env", d.mode);
    assert(d.executable === "/custom/FreeCADCmd", String(d.executable));
    assert(d.available, "not available");
    return d.detail;
  }),
);

results.push(
  run("macos-bundle", "discovers FreeCAD.app on Apple Silicon", () => {
    const exe = "/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd";
    const d = discoverFreeCad(ctx({ platform: "darwin", arch: "arm64", existing: [exe] }));
    assert(d.available && d.mode === "macos-bundle", d.mode);
    assert(d.executable === exe, String(d.executable));
    assert(d.platform === "darwin" && d.arch === "arm64", `${d.platform}/${d.arch}`);
    return d.executable!;
  }),
);

results.push(
  run("homebrew", "Homebrew is fallback after bundle", () => {
    const brew = "/opt/homebrew/bin/FreeCADCmd";
    const d = discoverFreeCad(ctx({ platform: "darwin", arch: "arm64", existing: [brew] }));
    assert(d.mode === "homebrew", d.mode);
    assert(d.executable === brew, String(d.executable));
    return brew;
  }),
);

results.push(
  run("linux-appimage", "Linux extracted AppImage", () => {
    const extract = "/opt/freecad/squashfs-root";
    const d = discoverFreeCad(
      ctx({
        platform: "linux",
        arch: "x64",
        env: { FREECAD_PREFIX: "/opt/freecad" },
        existing: [`${extract}/AppRun`, `${extract}/usr/bin/freecadcmd`],
      }),
    );
    assert(d.mode === "appimage-extracted", d.mode);
    assert(d.executable === `${extract}/AppRun`, String(d.executable));
    assert(d.argsPrefix[0] === "freecadcmd", d.argsPrefix.join(" "));
    return d.mode;
  }),
);

results.push(
  run("linux-system", "Linux system FreeCADCmd", () => {
    const d = discoverFreeCad(ctx({ platform: "linux", existing: ["/usr/bin/FreeCADCmd"] }));
    assert(d.mode === "system", d.mode);
    return d.executable!;
  }),
);

results.push(
  run("missing-mac", "missing on darwin explains .app + env override", () => {
    const d = discoverFreeCad(ctx({ platform: "darwin", arch: "arm64", existing: [] }));
    assert(!d.available && d.mode === "missing", d.mode);
    assert(d.detail.includes("/Applications"), d.detail);
    assert(d.detail.includes("AGENTCAD_FREECAD_CMD"), d.detail);
    assert(d.detail.includes("docs/MACOS.md"), d.detail);
    return "hinted";
  }),
);

results.push(
  run("plan-darwin", "darwin search plan skips Linux system paths", () => {
    const plan = freeCadSearchPlan({ platform: "darwin", homedir: "/Users/dev", env: {} });
    assert(plan.macosBundles.length > 0, "no bundles");
    assert(plan.homebrew.length === macosHomebrewExecutables().length, "homebrew");
    assert(plan.system.length === 0, "linux paths on darwin");
    assert(linuxSystemExecutables().length > 0, "linux helpers exist");
    return `bundles=${plan.macosBundles.length}`;
  }),
);

results.push(
  run("windows-unverified", "Windows candidates exist but are not claimed installed", () => {
    const d = discoverFreeCad(ctx({ platform: "win32", arch: "x64", existing: [] }));
    assert(!d.available, "falsely available");
    assert(windowsExecutables().length >= 2, "no windows stubs");
    const plan = freeCadSearchPlan({ platform: "win32", homedir: "C:\\Users\\dev", env: {} });
    assert(plan.system.length === windowsExecutables().length, "windows system list");
    return "unsupported/unverified";
  }),
);

let failed = 0;
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(16)} ${r.name} — ${r.detail}`);
  if (!r.passed) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} discover tests passed`);
process.exit(failed ? 1 : 0);
