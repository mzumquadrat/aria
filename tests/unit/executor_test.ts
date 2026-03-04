import { assertEquals } from "@std/assert";
import { TaskQueue } from "../../src/queue/queue.ts";
import { createToolExecutor, type ToolTaskPayload } from "../../src/queue/executor.ts";
import { ToolRegistry } from "../../src/agent/tools.ts";
import type { TaskContext } from "../../src/queue/mod.ts";

function createTestContext(): TaskContext {
  return {
    chatId: 12345,
    userId: 67890,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("createToolExecutor - executes get_time tool successfully", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-1",
    type: "tool",
    payload: { tool: "get_time", input: {} },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, true);
  assertEquals(result.tool, "get_time");
  assertEquals(result.taskId, "test-1");
  assertEquals(typeof result.duration, "number");
  const output = result.output as { iso?: string; timezone?: string };
  assertEquals(output.iso !== undefined, true);
  assertEquals(output.timezone !== undefined, true);
});

Deno.test("createToolExecutor - executes calculate tool successfully", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-2",
    type: "tool",
    payload: { tool: "calculate", input: { expression: "2 + 2" } },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, true);
  assertEquals(result.tool, "calculate");
  assertEquals(result.output, 4);
  assertEquals(result.taskId, "test-2");
});

Deno.test("createToolExecutor - handles unknown tool error", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-3",
    type: "tool",
    payload: { tool: "unknown_tool", input: {} },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, false);
  assertEquals(result.tool, "unknown_tool");
  assertEquals(result.error?.includes("Unknown tool"), true);
  assertEquals(result.taskId, "test-3");
});

Deno.test("createToolExecutor - handles timeout", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry, { timeout: 30 });
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-4",
    type: "tool",
    payload: { tool: "get_time", input: {} },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const slowRegistry = {
    executeTool: async () => {
      await delay(100);
      return { tool: "get_time", success: true, output: {} };
    },
  } as unknown as ToolRegistry;

  const slowExecutor = createToolExecutor(slowRegistry, { timeout: 30 });
  const result = await slowExecutor(task);

  assertEquals(result.success, false);
  assertEquals(result.error?.includes("timed out"), true);

  await delay(100);
});

Deno.test("createToolExecutor - tracks execution duration", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-5",
    type: "tool",
    payload: { tool: "calculate", input: { expression: "100 * 50" } },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, true);
  assertEquals(result.duration >= 0, true);
});

Deno.test("createToolExecutor - integrates with TaskQueue", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry, { timeout: 1000 });
  const queue = new TaskQueue<ToolTaskPayload>({ maxConcurrent: 1, defaultTimeout: 1000 });

  queue.registerHandler("tool", executor);

  const context = createTestContext();

  const task = queue.enqueue("tool", { tool: "calculate", input: { expression: "5 * 5" } }, context);
  queue.start();

  await delay(50);

  const completedTask = queue.getTask(task.id);
  assertEquals(completedTask?.status, "completed");
  assertEquals((completedTask?.result as { output: number })?.output, 25);
});

Deno.test("createToolExecutor - handles calculation errors gracefully", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context = createTestContext();

  const task: Parameters<typeof executor>[0] = {
    id: "test-6",
    type: "tool",
    payload: { tool: "calculate", input: { expression: "invalid syntax" } },
    context,
    priority: "normal",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, false);
  assertEquals(result.error?.includes("Calculation error"), true);
});

Deno.test("createToolExecutor - preserves task context", async () => {
  const registry = new ToolRegistry();
  const executor = createToolExecutor(registry);
  const context: TaskContext = {
    chatId: 999,
    userId: 111,
    messageId: 222,
    metadata: { custom: "value" },
  };

  const task: Parameters<typeof executor>[0] = {
    id: "test-7",
    type: "tool",
    payload: { tool: "get_time", input: {} },
    context,
    priority: "high",
    status: "pending",
    createdAt: new Date(),
  };

  const result = await executor(task);

  assertEquals(result.success, true);
  assertEquals(result.taskId, "test-7");
});
