import { ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { discoverFreeCad, type FreeCadDiscovery } from "./discover.server";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const WORKER_SCRIPT = resolve(process.cwd(), "freecad-worker/bootstrap.py");
const READY_MS = 45_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export class CadWorkerError extends Error {
  code: string;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "CadWorkerError";
    this.code = code;
    this.extra = extra;
  }
}

interface Pending {
  resolve: (value: WorkerResponse) => void;
  reject: (err: CadWorkerError) => void;
  timer: ReturnType<typeof setTimeout>;
  operation: string;
}

class FreeCadWorkerClient {
  private child: ChildProcess | null = null;
  private pending = new Map<string, Pending>();
  private starting: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private discovery: FreeCadDiscovery | null = null;
  private seq = 0;
  private pid: number | null = null;

  constructor() {
    const die = () => {
      try {
        if (this.pid) process.kill(-this.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };
    process.on("exit", die);
    process.on("SIGTERM", die);
    process.on("SIGINT", die);
  }

  getDiscovery() {
    if (!this.discovery) this.discovery = discoverFreeCad();
    return this.discovery;
  }

  private spawnProcess(): Promise<void> {
    const info = this.getDiscovery();
    if (!info.available || !info.executable) {
      return Promise.reject(
        new CadWorkerError("KERNEL_UNAVAILABLE", info.detail, { mode: info.mode }),
      );
    }
    return new Promise((resolveReady, rejectReady) => {
      const args = [...info.argsPrefix, WORKER_SCRIPT];
      const userHome = `/tmp/freecad-user-agentcad-${Date.now().toString(36)}`;
      const child = spawn(info.executable!, args, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: "offscreen",
          PYTHONUNBUFFERED: "1",
          FREECAD_USER_HOME: process.env.FREECAD_USER_HOME || userHome,
          HOME: process.env.FREECAD_USER_HOME || userHome,
        },
      });
      this.child = child;
      this.pid = child.pid ?? null;
      let ready = false;
      const failStart = (err: CadWorkerError) => {
        if (ready) return;
        ready = true;
        rejectReady(err);
      };
      const startTimer = setTimeout(() => {
        failStart(new CadWorkerError("OPERATION_TIMEOUT", "FreeCAD worker did not become ready.", { pid: this.pid }));
        this.kill("SIGKILL");
      }, READY_MS);

      const onLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) return;
        let msg: WorkerResponse;
        try {
          msg = JSON.parse(trimmed) as WorkerResponse;
        } catch {
          return;
        }
        if (!ready && (msg.type === "ready" || msg.result)) {
          ready = true;
          clearTimeout(startTimer);
          resolveReady();
          return;
        }
        const id = msg.id;
        if (id && this.pending.has(id)) {
          const p = this.pending.get(id)!;
          this.pending.delete(id);
          clearTimeout(p.timer);
          p.resolve(msg);
        }
      };

      if (child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on("line", onLine);
      }
      if (child.stderr) {
        const errl = createInterface({ input: child.stderr });
        errl.on("line", (line) => {
          if (process.env.AGENTCAD_FREECAD_DEBUG === "1") {
            console.error("[freecad-worker]", line);
          }
        });
      }

      child.on("exit", (code, signal) => {
        const crash = new CadWorkerError(
          "WORKER_CRASHED",
          `FreeCAD worker exited (code ${code}, signal ${signal}).`,
          { pid: this.pid, code, signal },
        );
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(crash);
          this.pending.delete(id);
        }
        // Concurrency invariant: a killed worker's exit event can arrive after
        // its replacement has spawned; only clear registration for THIS child.
        if (this.child === child) {
          this.child = null;
          this.pid = null;
        }
        if (!ready) failStart(crash);
      });

      child.on("error", (err) => {
        failStart(new CadWorkerError("KERNEL_UNAVAILABLE", err.message));
      });
    });
  }

  async ensureStarted() {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.spawnProcess().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    const pid = this.pid;
    if (pid) {
      try {
        process.kill(-pid, signal);
      } catch {
        /* process group may already be gone */
      }
    }
    try {
      this.child?.kill(signal);
    } catch {
      /* ignore */
    }
    this.child = null;
    this.pid = null;
  }

  async restart() {
    this.kill("SIGKILL");
    await this.ensureStarted();
  }

  request<T = unknown>(operation: WorkerRequest["operation"], extra: Partial<WorkerRequest> = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const run = async (): Promise<WorkerResponse<T>> => {
      await this.ensureStarted();
      const id = extra.id ?? `req_${++this.seq}_${Date.now().toString(36)}`;
      const payload: WorkerRequest = { id, operation, ...extra };
      return new Promise<WorkerResponse<T>>((resolveP, rejectP) => {
        if (!this.child?.stdin) {
          rejectP(new CadWorkerError("WORKER_CRASHED", "Worker stdin is not available."));
          return;
        }
        const timer = setTimeout(() => {
          this.pending.delete(id);
          this.kill("SIGKILL");
          rejectP(
            new CadWorkerError("OPERATION_TIMEOUT", `FreeCAD operation '${operation}' timed out after ${timeoutMs} ms.`, {
              operation,
              timeout_ms: timeoutMs,
              pid: this.pid,
            }),
          );
        }, timeoutMs);
        this.pending.set(id, {
          resolve: (v) => resolveP(v as WorkerResponse<T>),
          reject: rejectP,
          timer,
          operation,
        });
        try {
          this.child.stdin.write(JSON.stringify(payload) + "\n");
        } catch (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          rejectP(
            new CadWorkerError("WORKER_CRASHED", err instanceof Error ? err.message : String(err), { operation }),
          );
        }
      });
    };
    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  getPid() {
    return this.pid;
  }
}

const singleton = new FreeCadWorkerClient();

export function getFreeCadWorker() {
  return singleton;
}

export async function withDocumentLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
  void docId;
  // Phase 2: a single serialized worker is the lock. Per-document locks can wrap this later.
  return fn();
}
