import { assertEquals } from "@std/assert";
import { ContinuationManager, type PendingContinuation } from "../../src/agent/continuation.ts";
import type { Bot } from "grammy";

interface MockApi {
  sendMessage: (chatId: number, text: string, options?: unknown) => Promise<{ message_id: number }>;
}

function createMockBot(): { bot: Bot; sentMessages: Array<{ chatId: number; text: string }> } {
  const sentMessages: Array<{ chatId: number; text: string }> = [];
  const api: MockApi = {
    sendMessage: (chatId: number, text: string) => {
      sentMessages.push({ chatId, text });
      return Promise.resolve({ message_id: 1 });
    },
  };
  return { bot: { api } as unknown as Bot, sentMessages };
}

Deno.test("ContinuationManager - startContinuation creates pending continuation", () => {
  const manager = new ContinuationManager();

  const continuation = manager.startContinuation("test-1", 123, 456, "shell");

  assertEquals(continuation.id, "test-1");
  assertEquals(continuation.chatId, 123);
  assertEquals(continuation.userId, 456);
  assertEquals(continuation.toolName, "shell");
  assertEquals(continuation.status, "running");
  assertEquals(continuation.startedAt instanceof Date, true);
});

Deno.test("ContinuationManager - startContinuation with optional messageId", () => {
  const manager = new ContinuationManager();

  const continuation = manager.startContinuation("test-2", 123, 456, "shell", 789);

  assertEquals(continuation.messageId, 789);
});

Deno.test("ContinuationManager - completeContinuation updates status", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-3", 123, 456, "shell");

  const result = { tool: "shell", success: true, output: { stdout: "done" } };
  const completed = manager.completeContinuation("test-3", result);

  assertEquals(completed?.status, "completed");
  assertEquals(completed?.result, result);
});

Deno.test("ContinuationManager - completeContinuation sets failed status on error", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-4", 123, 456, "shell");

  const result = { tool: "shell", success: false, error: "command failed" };
  const completed = manager.completeContinuation("test-4", result);

  assertEquals(completed?.status, "failed");
});

Deno.test("ContinuationManager - failContinuation sets failed status", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-5", 123, 456, "shell");
  const failed = manager.failContinuation("test-5", "timeout");

  assertEquals(failed?.status, "failed");
  assertEquals(failed?.error, "timeout");
});

Deno.test("ContinuationManager - getContinuation retrieves by id", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-6", 123, 456, "shell");
  const continuation = manager.getContinuation("test-6");

  assertEquals(continuation?.id, "test-6");
});

Deno.test("ContinuationManager - getContinuation returns undefined for unknown", () => {
  const manager = new ContinuationManager();

  const continuation = manager.getContinuation("unknown");

  assertEquals(continuation, undefined);
});

Deno.test("ContinuationManager - getPendingContinuations returns only running", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("running-1", 123, 456, "shell");
  manager.startContinuation("running-2", 123, 456, "shell");
  manager.startContinuation("to-complete", 123, 456, "shell");
  manager.completeContinuation("to-complete", { tool: "shell", success: true });

  const pending = manager.getPendingContinuations();

  assertEquals(pending.length, 2);
  assertEquals(pending.every((c) => c.status === "running"), true);
});

Deno.test("ContinuationManager - removeContinuation deletes continuation", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-7", 123, 456, "shell");
  const removed = manager.removeContinuation("test-7");

  assertEquals(removed, true);
  assertEquals(manager.getContinuation("test-7"), undefined);
});

Deno.test("ContinuationManager - getStats returns correct counts", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("running", 123, 456, "shell");
  manager.startContinuation("to-complete", 123, 456, "shell");
  manager.completeContinuation("to-complete", { tool: "shell", success: true });
  manager.startContinuation("to-fail", 123, 456, "shell");
  manager.failContinuation("to-fail", "error");

  const stats = manager.getStats();

  assertEquals(stats.total, 3);
  assertEquals(stats.running, 1);
  assertEquals(stats.completed, 1);
  assertEquals(stats.failed, 1);
});

Deno.test("ContinuationManager - clear removes all continuations", () => {
  const manager = new ContinuationManager();

  manager.startContinuation("test-8", 123, 456, "shell");
  manager.startContinuation("test-9", 123, 456, "shell");

  manager.clear();

  assertEquals(manager.getStats().total, 0);
});

Deno.test("ContinuationManager - sendFollowUp sends message via bot", async () => {
  const { bot, sentMessages } = createMockBot();
  const manager = new ContinuationManager();
  manager.setBot(bot);

  const continuation: PendingContinuation = {
    id: "test-10",
    chatId: 123,
    userId: 456,
    toolName: "shell",
    startedAt: new Date(),
    status: "completed",
  };

  await manager.sendFollowUp(continuation, "Task completed\\!");

  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].chatId, 123);
  assertEquals(sentMessages[0].text, "Task completed\\!");
});

Deno.test("ContinuationManager - longRunningThreshold returns config value", () => {
  const manager = new ContinuationManager({ longRunningThreshold: 10000 });

  assertEquals(manager.longRunningThreshold, 10000);
});
