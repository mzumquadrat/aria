import type { QueuedTask, TaskHandler } from "./mod.ts";
import type { ToolRegistry, ToolResult } from "../agent/tools.ts";
import { getContinuationManager, type PendingContinuation } from "../agent/continuation.ts";
import type { Bot } from "grammy";

export interface ToolTaskPayload {
  tool: string;
  input: unknown;
  background?: boolean;
}

export interface ToolTaskResult extends ToolResult {
  taskId: string;
  duration: number;
  continuationId?: string;
  background?: boolean;
}

export interface BackgroundExecutorOptions {
  timeout: number;
  longRunningThreshold: number;
  enableBackground: boolean;
}

const DEFAULT_OPTIONS: BackgroundExecutorOptions = {
  timeout: 30000,
  longRunningThreshold: 5000,
  enableBackground: true,
};

export function createToolExecutor(
  registry: ToolRegistry,
  options: Partial<BackgroundExecutorOptions> = {}
): TaskHandler<ToolTaskPayload, ToolTaskResult> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (task: QueuedTask<ToolTaskPayload>): Promise<ToolTaskResult> => {
    const startTime = Date.now();
    const { tool, input } = task.payload;

    console.log(`[EXECUTOR] Starting task ${task.id}: tool=${tool}`);

    let timeoutId: number | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Tool ${tool} timed out after ${config.timeout}ms`));
      }, config.timeout);
    });

    try {
      const result = await Promise.race([
        registry.executeTool({ tool, input }),
        timeoutPromise,
      ]);

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      console.log(`[EXECUTOR] Task ${task.id} completed in ${duration}ms`);

      return {
        ...result,
        taskId: task.id,
        duration,
      };
    } catch (error) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[EXECUTOR] Task ${task.id} failed: ${errorMsg}`);

      return {
        tool,
        success: false,
        error: errorMsg,
        taskId: task.id,
        duration,
      };
    }
  };
}

export function createBackgroundToolExecutor(
  registry: ToolRegistry,
  bot: Bot,
  options: Partial<BackgroundExecutorOptions> = {}
): TaskHandler<ToolTaskPayload, ToolTaskResult> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const continuationManager = getContinuationManager();
  continuationManager.setBot(bot);

  return (task: QueuedTask<ToolTaskPayload>): Promise<ToolTaskResult> => {
    const { background } = task.payload;

    if (background && config.enableBackground) {
      return executeInBackground(task, registry, continuationManager, config);
    }

    return executeForeground(task, registry, config);
  };
}

async function executeForeground(
  task: QueuedTask<ToolTaskPayload>,
  registry: ToolRegistry,
  config: BackgroundExecutorOptions
): Promise<ToolTaskResult> {
  const startTime = Date.now();
  const { tool, input } = task.payload;

  console.log(`[EXECUTOR] Foreground task ${task.id}: tool=${tool}`);

  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tool ${tool} timed out after ${config.timeout}ms`));
    }, config.timeout);
  });

  try {
    const result = await Promise.race([
      registry.executeTool({ tool, input }),
      timeoutPromise,
    ]);

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    const duration = Date.now() - startTime;
    console.log(`[EXECUTOR] Task ${task.id} completed in ${duration}ms`);

    return {
      ...result,
      taskId: task.id,
      duration,
    };
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[EXECUTOR] Task ${task.id} failed: ${errorMsg}`);

    return {
      tool,
      success: false,
      error: errorMsg,
      taskId: task.id,
      duration,
    };
  }
}

function executeInBackground(
  task: QueuedTask<ToolTaskPayload>,
  registry: ToolRegistry,
  continuationManager: ReturnType<typeof getContinuationManager>,
  config: BackgroundExecutorOptions
): Promise<ToolTaskResult> {
  const startTime = Date.now();
  const { tool, input } = task.payload;
  const continuationId = `${task.id}-bg`;

  console.log(`[EXECUTOR] Background task ${task.id}: tool=${tool}`);

  continuationManager.startContinuation(
    continuationId,
    task.context.chatId,
    task.context.userId,
    tool,
    task.context.messageId
  );

  (async () => {
    let timeoutId: number | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Background tool ${tool} timed out after ${config.timeout}ms`));
      }, config.timeout);
    });

    try {
      const result = await Promise.race([
        registry.executeTool({ tool, input }),
        timeoutPromise,
      ]);

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      console.log(`[EXECUTOR] Background task ${task.id} completed in ${duration}ms`);

      const completed = continuationManager.completeContinuation(continuationId, result);

      if (completed) {
        await sendCompletionNotification(completed, result, duration, continuationManager);
      }
    } catch (error) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[EXECUTOR] Background task ${task.id} failed: ${errorMsg}`);

      continuationManager.failContinuation(continuationId, errorMsg);
    }
  })();

  return Promise.resolve({
    tool,
    success: true,
    output: {
      status: "started",
      message: `${tool} started in background`,
      continuationId,
    },
    taskId: task.id,
    duration: 0,
    continuationId,
    background: true,
  });
}

async function sendCompletionNotification(
  continuation: PendingContinuation,
  result: ToolResult,
  duration: number,
  manager: ReturnType<typeof getContinuationManager>
): Promise<void> {
  const output = result.output as { stdout?: string; stderr?: string } | undefined;
  const durationSec = (duration / 1000).toFixed(1);

  let summary = `*${continuation.toolName}* completed in ${durationSec}s\\.\n`;

  if (result.success && output) {
    if (output.stdout) {
      const truncated = output.stdout.length > 500
        ? output.stdout.slice(0, 500) + "\\\\.\\.\\."
        : output.stdout;
      summary += `\n\`\`\`\n${escapeMarkdown(truncated)}\n\`\`\``;
    }
    if (output.stderr) {
      const truncated = output.stderr.length > 200
        ? output.stderr.slice(0, 200) + "\\\\.\\.\\."
        : output.stderr;
      summary += `\n*stderr:*\n\`\`\`\n${escapeMarkdown(truncated)}\n\`\`\``;
    }
  } else if (result.error) {
    summary += `\n*Error:* ${escapeMarkdown(result.error)}`;
  }

  await manager.sendFollowUp(continuation, summary);
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

export type { ToolRegistry };
