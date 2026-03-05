import { assertEquals } from "@std/assert";
import { LockManager, Mutex } from "../../src/agent/lock.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("Mutex - acquires and releases lock", async () => {
  const mutex = new Mutex();
  let acquired = false;

  await mutex.acquire();
  acquired = true;
  assertEquals(acquired, true);

  mutex.release();
  assertEquals(mutex["locked"], false);
});

Deno.test("Mutex - queues waiting acquirers", async () => {
  const mutex = new Mutex();
  const order: number[] = [];

  await mutex.acquire();

  const p1 = mutex.acquire().then(() => {
    order.push(1);
    mutex.release();
  });

  const p2 = mutex.acquire().then(() => {
    order.push(2);
    mutex.release();
  });

  assertEquals(order.length, 0);

  mutex.release();

  await Promise.all([p1, p2]);

  assertEquals(order, [1, 2]);
});

Deno.test("Mutex - withLock executes function with lock", async () => {
  const mutex = new Mutex();
  const order: string[] = [];

  const p1 = mutex.withLock(async () => {
    order.push("start1");
    await delay(20);
    order.push("end1");
  });

  const p2 = mutex.withLock(async () => {
    order.push("start2");
    await delay(10);
    order.push("end2");
  });

  await Promise.all([p1, p2]);

  assertEquals(order[0], "start1");
  assertEquals(order[1], "end1");
  assertEquals(order[2], "start2");
  assertEquals(order[3], "end2");
});

Deno.test("Mutex - withLock releases lock on error", async () => {
  const mutex = new Mutex();

  try {
    await mutex.withLock(() => Promise.reject(new Error("test error")));
  } catch {
    // expected
  }

  assertEquals(mutex["locked"], false);

  await mutex.withLock(() => Promise.resolve());
  assertEquals(mutex["locked"], false);
});

Deno.test("LockManager - creates lock per key", () => {
  const manager = new LockManager<string>();

  const lock1 = manager.getLock("chat1");
  const lock2 = manager.getLock("chat2");
  const lock1Again = manager.getLock("chat1");

  assertEquals(lock1 === lock1Again, true);
  assertEquals(lock1 === lock2, false);
});

Deno.test("LockManager - withLock executes with lock", async () => {
  const manager = new LockManager<number>();
  const order: string[] = [];

  const p1 = manager.withLock(1, async () => {
    order.push("start1");
    await delay(20);
    order.push("end1");
  });

  const p2 = manager.withLock(1, async () => {
    order.push("start2");
    await delay(10);
    order.push("end2");
  });

  await Promise.all([p1, p2]);

  assertEquals(order, ["start1", "end1", "start2", "end2"]);
});

Deno.test("LockManager - different keys don't block each other", async () => {
  const manager = new LockManager<number>();
  const order: string[] = [];

  const p1 = manager.withLock(1, async () => {
    order.push("start1");
    await delay(30);
    order.push("end1");
  });

  const p2 = manager.withLock(2, async () => {
    order.push("start2");
    await delay(10);
    order.push("end2");
  });

  await Promise.all([p1, p2]);

  assertEquals(order.indexOf("start1") < order.indexOf("end1"), true);
  assertEquals(order.indexOf("start2") < order.indexOf("end2"), true);
  assertEquals(order.indexOf("end2") < order.indexOf("end1"), true);
});

Deno.test("LockManager - hasLock returns correct state", () => {
  const manager = new LockManager<number>();

  assertEquals(manager.hasLock(1), false);

  manager.getLock(1);
  assertEquals(manager.hasLock(1), true);
});

Deno.test("LockManager - clear removes all locks", () => {
  const manager = new LockManager<number>();

  manager.getLock(1);
  manager.getLock(2);
  manager.getLock(3);

  assertEquals(manager.hasLock(1), true);
  assertEquals(manager.hasLock(2), true);

  manager.clear();

  assertEquals(manager.hasLock(1), false);
  assertEquals(manager.hasLock(2), false);
  assertEquals(manager.hasLock(3), false);
});
