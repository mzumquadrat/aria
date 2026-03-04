import { assertEquals } from "@std/assert";
import { TaskQueue } from "../../src/queue/queue.ts";
import { enqueueMessage, getMessageQueue, initializeMessageQueue, getQueueStats } from "../../src/queue/scheduler.ts";
import type { Config } from "../../src/config/mod.ts";

function createMockBot(): { bot: unknown; calls: unknown[] } {
  const calls: unknown[] = [];
  const bot = {
    api: {
      sendChatAction: (chatId: number, action: string) => {
        calls.push({ type: "chatAction", chatId, action });
        return Promise.resolve();
      },
    },
  };
  return { bot, calls };
}

function createTestConfig(): Config {
  return {
    telegram: {
      botToken: "test-token",
    },
    openrouter: {
      apiKey: "test-key",
      defaultModel: "test-model",
      fallbackModel: "fallback-model",
      visionModel: "vision-model",
      maxTokens: 1000,
    },
    queue: {
      maxConcurrent: 2,
      defaultTimeout: 5000,
      shutdownTimeout: 10000,
    },
  };
}

type BotType = ReturnType<typeof import("../../src/bot/mod.ts").createBot>;

Deno.test("initializeMessageQueue - creates queue with config", () => {
  const { bot } = createMockBot();
  const config = createTestConfig();

  const queue = initializeMessageQueue(config, bot as BotType);

  assertEquals(queue instanceof TaskQueue, true);
  assertEquals(queue.getStats().pending, 0);
});

Deno.test("getMessageQueue - returns initialized queue", () => {
  const { bot } = createMockBot();
  const config = createTestConfig();

  const queue1 = initializeMessageQueue(config, bot as BotType);
  const queue2 = getMessageQueue();

  assertEquals(queue1 === queue2, true);
});

Deno.test("enqueueMessage - creates task with correct data", () => {
  const { bot } = createMockBot();
  const config = createTestConfig();

  const queue = initializeMessageQueue(config, bot as BotType);
  queue.stop();

  const task = enqueueMessage("Hello", { chatId: 123, userId: 456 });

  assertEquals(task.type, "message");
  assertEquals(task.payload.text, "Hello");
  assertEquals(task.context.chatId, 123);
  assertEquals(task.status, "pending");
});

Deno.test("enqueueMessage - respects priority", () => {
  const { bot } = createMockBot();
  const config = createTestConfig();

  const queue = initializeMessageQueue(config, bot as BotType);
  queue.stop();

  enqueueMessage("low", { chatId: 1, userId: 1 }, "low");
  enqueueMessage("high", { chatId: 1, userId: 1 }, "high");
  enqueueMessage("normal", { chatId: 1, userId: 1 }, "normal");

  const pending = queue.getPending();
  assertEquals(pending[0].payload.text, "high");
  assertEquals(pending[1].payload.text, "normal");
  assertEquals(pending[2].payload.text, "low");
});

Deno.test("getQueueStats - returns queue statistics", () => {
  const { bot } = createMockBot();
  const config = createTestConfig();

  initializeMessageQueue(config, bot as BotType);

  const stats = getQueueStats();

  assertEquals(stats?.pending, 0);
  assertEquals(stats?.running, 0);
  assertEquals(stats?.completed, 0);
  assertEquals(stats?.failed, 0);
});
