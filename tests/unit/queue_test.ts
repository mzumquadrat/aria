import { assertEquals } from "@std/assert";
import { TaskQueue } from "../../src/queue/queue.ts";
import type { QueuedTask, TaskContext } from "../../src/queue/mod.ts";

function createTestContext(): TaskContext {
  return {
    chatId: 12345,
    userId: 67890,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("TaskQueue - enqueue adds task to pending queue", () => {
  const queue = new TaskQueue<string>();
  const context = createTestContext();

  const task = queue.enqueue("test", "payload", context);

  assertEquals(task.status, "pending");
  assertEquals(task.type, "test");
  assertEquals(task.payload, "payload");
  assertEquals(queue.size, 1);
});

Deno.test("TaskQueue - tasks are processed in priority order", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 1000 });
  const context = createTestContext();
  const executionOrder: string[] = [];

  queue.registerHandler("test", async (task) => {
    executionOrder.push(task.payload);
    await delay(10);
    return task.payload;
  });

  queue.enqueue("test", "low", context, "low");
  queue.enqueue("test", "normal", context, "normal");
  queue.enqueue("test", "high", context, "high");

  assertEquals(queue.size, 3);

  queue.start();

  await delay(150);

  assertEquals(executionOrder[0], "high");
  assertEquals(executionOrder[1], "normal");
  assertEquals(executionOrder[2], "low");
});

Deno.test("TaskQueue - respects maxConcurrent limit", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 2, defaultTimeout: 1000 });
  const context = createTestContext();
  let concurrentCount = 0;
  let maxConcurrent = 0;

  queue.registerHandler("test", async () => {
    concurrentCount++;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    await delay(50);
    concurrentCount--;
    return "done";
  });

  for (let i = 0; i < 5; i++) {
    queue.enqueue("test", `task-${i}`, context);
  }

  queue.start();

  await delay(300);

  assertEquals(maxConcurrent, 2);
});

Deno.test("TaskQueue - timeout handling works", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 30 });
  const context = createTestContext();

  queue.registerHandler("slow", async () => {
    await delay(100);
    return "should not reach";
  });

  const task = queue.enqueue("slow", "payload", context);
  queue.start();

  await delay(50);

  const completedTask = queue.getTask(task.id);
  assertEquals(completedTask?.status, "timeout");
  assertEquals(completedTask?.error, undefined);

  await delay(100);
});

Deno.test("TaskQueue - getStats returns correct counts", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 1000 });
  const context = createTestContext();

  queue.registerHandler("test", async () => {
    await delay(10);
    return "done";
  });

  assertEquals(queue.getStats().pending, 0);

  queue.enqueue("test", "task1", context);
  queue.enqueue("test", "task2", context);

  const statsAfterEnqueue = queue.getStats();
  assertEquals(statsAfterEnqueue.pending, 2);

  queue.start();

  await delay(50);

  const statsAfterProcess = queue.getStats();
  assertEquals(statsAfterProcess.pending, 0);
  assertEquals(statsAfterProcess.completed, 2);
  assertEquals(statsAfterProcess.totalProcessed, 2);
});

Deno.test("TaskQueue - dequeue removes and returns first task", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 10 });
  const context = createTestContext();

  const task1 = queue.enqueue("test", "first", context, "normal");
  const task2 = queue.enqueue("test", "second", context, "normal");

  assertEquals(queue.size, 2);

  const dequeued = queue.dequeue();
  assertEquals(dequeued?.id, task1.id);
  assertEquals(queue.size, 1);

  const remaining = queue.peek();
  assertEquals(remaining?.id, task2.id);
});

Deno.test("TaskQueue - peek returns first task without removing", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 10 });
  const context = createTestContext();

  queue.enqueue("test", "first", context);
  queue.enqueue("test", "second", context);

  assertEquals(queue.size, 2);

  const peeked = queue.peek();
  assertEquals(queue.size, 2);
  assertEquals(peeked?.payload, "first");
});

Deno.test("TaskQueue - updateStatus modifies task status", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1 });
  const context = createTestContext();

  const task = queue.enqueue("test", "payload", context);

  const success = queue.updateStatus(task.id, "failed", "custom error");
  assertEquals(success, true);

  const updated = queue.getTask(task.id);
  assertEquals(updated?.status, "failed");
  assertEquals(updated?.error, "custom error");
});

Deno.test("TaskQueue - clear removes all pending tasks", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 10 });
  const context = createTestContext();

  queue.enqueue("test", "1", context);
  queue.enqueue("test", "2", context);
  queue.enqueue("test", "3", context);

  assertEquals(queue.size, 3);

  queue.clear();

  assertEquals(queue.size, 0);
  assertEquals(queue.getStats().pending, 0);
});

Deno.test("TaskQueue - getPending returns copy of pending tasks", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 10 });
  const context = createTestContext();

  queue.enqueue("test", "1", context);
  queue.enqueue("test", "2", context);

  const pending = queue.getPending();
  assertEquals(pending.length, 2);

  pending.pop();
  assertEquals(queue.size, 2);
});

Deno.test("TaskQueue - failed tasks are tracked separately", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 1000 });
  const context = createTestContext();

  queue.registerHandler("fail", async () => {
    await delay(5);
    throw new Error("Intentional failure");
  });

  queue.enqueue("fail", "will-fail", context);
  queue.start();

  await delay(50);

  const failed = queue.getFailed();
  assertEquals(failed.length, 1);
  assertEquals(failed[0].status, "failed");
  assertEquals(failed[0].error, "Intentional failure");
});

Deno.test("TaskQueue - availableSlots reflects remaining capacity", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 3, defaultTimeout: 1000 });
  const context = createTestContext();

  assertEquals(queue.availableSlots, 3);

  queue.registerHandler("slow", async () => {
    await delay(30);
    return "done";
  });

  queue.enqueue("slow", "1", context);
  queue.enqueue("slow", "2", context);
  queue.start();

  await delay(5);

  assertEquals(queue.availableSlots, 1);

  await delay(100);
});

Deno.test("TaskQueue - task has correct timestamps", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 1000 });
  const context = createTestContext();
  const beforeEnqueue = new Date();

  queue.registerHandler("test", async () => {
    await delay(10);
    return "done";
  });

  const task = queue.enqueue("test", "payload", context);

  assertEquals(task.createdAt instanceof Date, true);
  assertEquals(task.createdAt.getTime() >= beforeEnqueue.getTime(), true);
  assertEquals(task.startedAt, undefined);
  assertEquals(task.completedAt, undefined);

  queue.start();

  await delay(50);

  const completed = queue.getTask(task.id) as QueuedTask<string>;
  assertEquals(completed.startedAt instanceof Date, true);
  assertEquals(completed.completedAt instanceof Date, true);
  assertEquals(
    completed.completedAt!.getTime() >= completed.startedAt!.getTime(),
    true,
  );
});

Deno.test("TaskQueue - tasks without handler fail immediately when started", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1 });
  const context = createTestContext();

  const task = queue.enqueue("no-handler", "payload", context);

  assertEquals(task.status, "pending");

  queue.start();

  await delay(10);

  const failed = queue.getTask(task.id);
  assertEquals(failed?.status, "failed");
  assertEquals(failed?.error?.includes("No handler registered"), true);
});

Deno.test("TaskQueue - start/stop controls processing", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 1, defaultTimeout: 1000 });
  const context = createTestContext();
  let executed = false;

  queue.registerHandler("test", async () => {
    await delay(5);
    executed = true;
    return "done";
  });

  queue.enqueue("test", "payload", context);

  await delay(20);
  assertEquals(executed, false);

  queue.start();
  await delay(30);
  assertEquals(executed, true);
});

Deno.test("TaskQueue - high priority tasks go first", () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 10 });
  const context = createTestContext();

  queue.enqueue("test", "low", context, "low");
  queue.enqueue("test", "high", context, "high");
  queue.enqueue("test", "normal", context, "normal");

  const pending = queue.getPending();
  assertEquals(pending[0].payload, "high");
  assertEquals(pending[1].payload, "normal");
  assertEquals(pending[2].payload, "low");
});

Deno.test("TaskQueue - getRunning returns currently executing tasks", async () => {
  const queue = new TaskQueue<string>({ maxConcurrent: 2, defaultTimeout: 1000 });
  const context = createTestContext();

  queue.registerHandler("slow", async () => {
    await delay(30);
    return "done";
  });

  queue.enqueue("slow", "1", context);
  queue.enqueue("slow", "2", context);
  queue.enqueue("slow", "3", context);

  queue.start();
  await delay(5);

  const running = queue.getRunning();
  assertEquals(running.length, 2);
  assertEquals(queue.size, 1);

  await delay(100);
});
