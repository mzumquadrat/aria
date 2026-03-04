import type { Bot } from "grammy";
import type { Config, QueueConfig } from "../config/mod.ts";
import { TaskQueue, type QueuedTask, type TaskContext } from "../queue/mod.ts";
import { getAgent } from "../agent/mod.ts";

export interface MessagePayload {
  text: string;
}

export interface MessageResult {
  response: string;
  toolReactions: string[];
}

let queueInstance: TaskQueue<MessagePayload> | null = null;
let botInstance: Bot | null = null;
let shutdownTimeout: number = 30000;

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrent: 3,
  defaultTimeout: 60000,
  shutdownTimeout: 30000,
};

export function initializeMessageQueue(config: Config, bot: Bot): TaskQueue<MessagePayload> {
  const queueConfig: QueueConfig = config.queue ?? DEFAULT_QUEUE_CONFIG;
  shutdownTimeout = queueConfig.shutdownTimeout;

  queueInstance = new TaskQueue<MessagePayload>({
    maxConcurrent: queueConfig.maxConcurrent,
    defaultTimeout: queueConfig.defaultTimeout,
  });

  botInstance = bot;

  queueInstance.registerHandler("message", createMessageHandler());

  queueInstance.start();

  console.log(`[MESSAGE QUEUE] Initialized (maxConcurrent: ${queueConfig.maxConcurrent}, timeout: ${queueConfig.defaultTimeout}ms, shutdownTimeout: ${shutdownTimeout}ms)`);

  return queueInstance;
}

export function getMessageQueue(): TaskQueue<MessagePayload> {
  if (!queueInstance) {
    throw new Error("Message queue not initialized. Call initializeMessageQueue first.");
  }
  return queueInstance;
}

function createMessageHandler() {
  return async (task: QueuedTask<MessagePayload>): Promise<MessageResult> => {
    const agent = getAgent();
    if (!agent) {
      throw new Error("Agent not initialized");
    }

    const toolReactions: string[] = [];

    agent.setToolCallCallback((toolName: string) => {
      toolReactions.push(toolName);
      if (botInstance && task.context.chatId) {
        botInstance.api.sendChatAction(task.context.chatId, "typing").catch(() => {});
      }
    });

    try {
      const response = await agent.processMessage(task.payload.text, task.context.chatId);
      return { response, toolReactions };
    } finally {
      agent.setToolCallCallback(() => {});
    }
  };
}

export function enqueueMessage(
  text: string,
  context: TaskContext,
  priority: "high" | "normal" | "low" = "normal"
): QueuedTask<MessagePayload> {
  const queue = getMessageQueue();
  return queue.enqueue("message", { text }, context, priority);
}

export function getQueueStats() {
  if (!queueInstance) {
    return null;
  }
  return queueInstance.getStats();
}

export async function waitForQueueCompletion(timeoutMs?: number): Promise<void> {
  if (!queueInstance) {
    return;
  }

  const timeout = timeoutMs ?? shutdownTimeout;
  const startTime = Date.now();

  queueInstance.stop();

  const stats = queueInstance.getStats();
  if (stats.running === 0) {
    return;
  }

  console.log(`[MESSAGE QUEUE] Waiting for ${stats.running} running task(s) to complete (timeout: ${timeout}ms)`);

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const currentStats = queueInstance?.getStats();
      const elapsed = Date.now() - startTime;

      if (!currentStats || currentStats.running === 0 || elapsed >= timeout) {
        clearInterval(checkInterval);
        if (currentStats && currentStats.running > 0) {
          console.log(`[MESSAGE QUEUE] Shutdown timeout reached, ${currentStats.running} task(s) still running`);
        } else {
          console.log(`[MESSAGE QUEUE] All tasks completed`);
        }
        resolve();
      }
    }, 100);
  });
}
