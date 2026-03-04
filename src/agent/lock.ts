export class Mutex {
  private locked: boolean = false;
  private queue: Array<() => void> = [];

  acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class LockManager<K = number> {
  private locks: Map<K, Mutex> = new Map();

  getLock(key: K): Mutex {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(key, lock);
    }
    return lock;
  }

  withLock<T>(key: K, fn: () => Promise<T>): Promise<T> {
    const lock = this.getLock(key);
    return lock.withLock(fn);
  }

  hasLock(key: K): boolean {
    return this.locks.has(key);
  }

  clear(): void {
    this.locks.clear();
  }
}

let lockManagerInstance: LockManager | null = null;

export function getLockManager(): LockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new LockManager();
  }
  return lockManagerInstance;
}
