import { existsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export type DiscoveryMode = "env" | "macos-bundle" | "homebrew" | "appimage-extracted" | "system" | "path" | "missing";

export interface FreeCadDiscovery {
  available: boolean;
  executable: string | null;
  argsPrefix: string[];
  version: string | null;
  mode: DiscoveryMode;
  platform: NodeJS.Platform;
  arch: string;
  extractRoot?: string;
  detail: string;
  candidates: string[];
}

const APPIMAGE_ROOT = process.env.FREECAD_PREFIX || "/opt/freecad";

export interface DiscoverContext {
  platform: NodeJS.Platform;
  arch: string;
  homedir: string;
  env: NodeJS.ProcessEnv;
  exists: (path: string) => boolean;
  which?: (cmd: string) => string | null;
  probeVersion?: (executable: string, argsPrefix: string[]) => string | null;
}

export function defaultDiscoverContext(): DiscoverContext {
  return {
    platform: process.platform,
    arch: process.arch,
    homedir: osHomedir(),
    env: process.env,
    exists: isExec,
    which: whichCmd,
  };
}

function isExec(p: string | undefined | null): p is string {
  return Boolean(p && existsSync(p));
}

function whichCmd(cmd: string): string | null {
  try {
    const result = spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [cmd] : ["-v", cmd], {
      encoding: "utf8",
      timeout: 5_000,
    });
    const line = (result.stdout || "").trim().split("\n")[0];
    return line || null;
  } catch {
    return null;
  }
}

/** Realistic FreeCAD.app executable locations (conda and official .dmg layouts). */
export function macosBundleExecutables(bundleRoot: string): string[] {
  return [
    join(bundleRoot, "Contents/Resources/bin/FreeCADCmd"),
    join(bundleRoot, "Contents/MacOS/FreeCADCmd"),
    join(bundleRoot, "Contents/MacOS/FreeCAD"),
  ];
}

export function macosBundleRoots(homedir: string): string[] {
  return [
    "/Applications/FreeCAD.app",
    "/Applications/FreeCAD 1.0.app",
    "/Applications/FreeCAD 1.1.app",
    join(homedir, "Applications/FreeCAD.app"),
    join(homedir, "Applications/FreeCAD 1.0.app"),
    join(homedir, "Applications/FreeCAD 1.1.app"),
  ];
}

export function macosHomebrewExecutables(): string[] {
  return [
    "/opt/homebrew/bin/FreeCADCmd",
    "/opt/homebrew/bin/freecadcmd",
    "/usr/local/bin/FreeCADCmd",
    "/usr/local/bin/freecadcmd",
  ];
}

export function linuxSystemExecutables(): string[] {
  return [
    "/usr/bin/FreeCADCmd",
    "/usr/bin/freecadcmd",
    "/usr/lib/freecad/bin/FreeCADCmd",
    "/opt/freecad/bin/FreeCADCmd",
    "/usr/local/bin/FreeCADCmd",
  ];
}

export function windowsExecutables(): string[] {
  return [
    "C:\\Program Files\\FreeCAD 1.0\\bin\\FreeCADCmd.exe",
    "C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCADCmd.exe",
    "C:\\Program Files\\FreeCAD\\bin\\FreeCADCmd.exe",
  ];
}

export interface SearchPlan {
  env: string[];
  macosBundles: string[];
  homebrew: string[];
  appImage: { appRun: string; cmd: string; extractRoot: string };
  system: string[];
}

export function freeCadSearchPlan(ctx: Pick<DiscoverContext, "platform" | "homedir" | "env">): SearchPlan {
  const envCmd = ctx.env.AGENTCAD_FREECAD_CMD || ctx.env.FREECAD_CMD;
  const extract = join(ctx.env.FREECAD_PREFIX || APPIMAGE_ROOT, "squashfs-root");
  return {
    env: envCmd ? [envCmd] : [],
    macosBundles: ctx.platform === "darwin" ? macosBundleRoots(ctx.homedir).flatMap(macosBundleExecutables) : [],
    homebrew: ctx.platform === "darwin" ? macosHomebrewExecutables() : [],
    appImage: {
      appRun: join(extract, "AppRun"),
      cmd: join(extract, "usr/bin/freecadcmd"),
      extractRoot: extract,
    },
    system:
      ctx.platform === "win32"
        ? windowsExecutables()
        : ctx.platform === "darwin"
          ? []
          : linuxSystemExecutables(),
  };
}

function probeVersion(executable: string, argsPrefix: string[]): string | null {
  try {
    const result = spawnSync(executable, [...argsPrefix, "--version"], {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        QT_QPA_PLATFORM: "offscreen",
        PYTHONUNBUFFERED: "1",
      },
    });
    const text = `${result.stdout || ""}\n${result.stderr || ""}`;
    const m = text.match(/FreeCAD\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
    return m?.[1] ?? (text.trim().split("\n")[0] || null);
  } catch {
    return null;
  }
}

function versionOf(executable: string, argsPrefix: string[], ctx: DiscoverContext): string | null {
  if (ctx.probeVersion) return ctx.probeVersion(executable, argsPrefix);
  return probeVersion(executable, argsPrefix);
}

function hit(
  partial: Omit<FreeCadDiscovery, "platform" | "arch" | "candidates">,
  ctx: DiscoverContext,
  candidates: string[],
): FreeCadDiscovery {
  return {
    ...partial,
    platform: ctx.platform,
    arch: ctx.arch,
    candidates,
  };
}

export function discoverFreeCad(ctx: DiscoverContext = defaultDiscoverContext()): FreeCadDiscovery {
  const plan = freeCadSearchPlan(ctx);
  const candidates = [
    ...plan.env,
    ...plan.macosBundles,
    ...plan.homebrew,
    plan.appImage.appRun,
    plan.appImage.cmd,
    ...plan.system,
  ];

  for (const p of plan.env) {
    if (ctx.exists(p)) {
      return hit(
        {
          available: true,
          executable: p,
          argsPrefix: [],
          version: versionOf(p, [], ctx),
          mode: "env",
          detail: ctx.env.AGENTCAD_FREECAD_CMD ? "AGENTCAD_FREECAD_CMD" : "FREECAD_CMD",
        },
        ctx,
        candidates,
      );
    }
  }

  for (const p of plan.macosBundles) {
    if (ctx.exists(p)) {
      return hit(
        {
          available: true,
          executable: p,
          argsPrefix: [],
          version: versionOf(p, [], ctx),
          mode: "macos-bundle",
          detail: p,
        },
        ctx,
        candidates,
      );
    }
  }

  for (const p of plan.homebrew) {
    if (ctx.exists(p)) {
      return hit(
        {
          available: true,
          executable: p,
          argsPrefix: [],
          version: versionOf(p, [], ctx),
          mode: "homebrew",
          detail: p,
        },
        ctx,
        candidates,
      );
    }
  }

  if (ctx.exists(plan.appImage.appRun) && ctx.exists(plan.appImage.cmd)) {
    return hit(
      {
        available: true,
        executable: plan.appImage.appRun,
        argsPrefix: ["freecadcmd"],
        version: versionOf(plan.appImage.appRun, ["freecadcmd"], ctx) ?? "1.0.2",
        mode: "appimage-extracted",
        extractRoot: plan.appImage.extractRoot,
        detail: `Extracted AppImage at ${plan.appImage.extractRoot}`,
      },
      ctx,
      candidates,
    );
  }

  for (const c of plan.system) {
    if (ctx.exists(c)) {
      return hit(
        {
          available: true,
          executable: c,
          argsPrefix: [],
          version: versionOf(c, [], ctx),
          mode: "system",
          detail: c,
        },
        ctx,
        candidates,
      );
    }
  }

  const onPath = ctx.which?.("FreeCADCmd") || ctx.which?.("freecadcmd");
  if (onPath && ctx.exists(onPath)) {
    return hit(
      {
        available: true,
        executable: onPath,
        argsPrefix: [],
        version: versionOf(onPath, [], ctx),
        mode: "path",
        detail: onPath,
      },
      ctx,
      candidates,
    );
  }

  const macHint =
    ctx.platform === "darwin"
      ? " On macOS install the official FreeCAD.app into /Applications, or set AGENTCAD_FREECAD_CMD to Contents/Resources/bin/FreeCADCmd. Homebrew is optional. See docs/MACOS.md."
      : "";
  const linuxHint =
    ctx.platform === "linux" ? " On Linux run scripts/install-freecad.sh or set AGENTCAD_FREECAD_CMD." : "";

  return hit(
    {
      available: false,
      executable: null,
      argsPrefix: [],
      version: null,
      mode: "missing",
      detail: `FreeCADCmd was not found.${macHint}${linuxHint}`,
    },
    ctx,
    candidates,
  );
}
