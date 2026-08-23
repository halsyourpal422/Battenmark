class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

const locks = new Map<string, Mutex>();

export function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  let mutex = locks.get(projectId);
  if (!mutex) {
    mutex = new Mutex();
    locks.set(projectId, mutex);
  }
  return mutex.run(fn);
}
