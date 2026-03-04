import type { Bot } from "grammy";
import type { ToolResult } from "../agent/tools.ts";
import { getAgent } from "../agent/mod.ts";

export interface PendingContinuation {
  id: string;
  chatId: number;
  userId: number;
  messageId?: number;
  toolName: string;
  startedAt: Date;
  status: "running" | "completed" | "failed";
  result?: ToolResult;
  error?: string;
}

export interface ContinuationConfig {
  longRunningThreshold: number;
  maxConcurrent: number;
}

const DEFAULT_CONFIG: ContinuationConfig = {
  longRunningThreshold: 5000,
  maxConcurrent: 5,
};

export class ContinuationManager {
  private continuations: Map<string, PendingContinuation> = new Map();
  private config: ContinuationConfig;
  private bot: Bot | null = null;

  constructor(config: Partial<ContinuationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setBot(bot: Bot): void {
    this.bot = bot;
  }

  startContinuation(
    id: string,
    chatId: number,
    userId: number,
    toolName: string,
    messageId?: number
  ): PendingContinuation {
    const continuation: PendingContinuation = {
      id,
      chatId,
      userId,
      toolName,
      startedAt: new Date(),
      status: "running",
    };

    if (messageId !== undefined) {
      continuation.messageId = messageId;
    }

    this.continuations.set(id, continuation);
    console.log(`[CONTINUATION] Started ${id} for tool ${toolName} in chat ${chatId}`);

    return continuation;
  }

  completeContinuation(id: string, result: ToolResult): PendingContinuation | undefined {
    const continuation = this.continuations.get(id);
    if (!continuation) {
      console.warn(`[CONTINUATION] Unknown continuation ${id}`);
      return undefined;
    }

    continuation.status = result.success ? "completed" : "failed";
    continuation.result = result;

    console.log(`[CONTINUATION] Completed ${id} with status ${continuation.status}`);

    return continuation;
  }

  failContinuation(id: string, error: string): PendingContinuation | undefined {
    const continuation = this.continuations.get(id);
    if (!continuation) {
      return undefined;
    }

    continuation.status = "failed";
    continuation.error = error;

    console.log(`[CONTINUATION] Failed ${id}: ${error}`);

    return continuation;
  }

  getContinuation(id: string): PendingContinuation | undefined {
    return this.continuations.get(id);
  }

  getPendingContinuations(): PendingContinuation[] {
    return Array.from(this.continuations.values()).filter(
      (c) => c.status === "running"
    );
  }

  removeContinuation(id: string): boolean {
    return this.continuations.delete(id);
  }

  async sendFollowUp(continuation: PendingContinuation, summary: string): Promise<void> {
    if (!this.bot) {
      console.error("[CONTINUATION] Bot not set, cannot send follow-up");
      return;
    }

    try {
      await this.bot.api.sendMessage(continuation.chatId, summary, { parse_mode: "MarkdownV2" });
      console.log(`[CONTINUATION] Sent follow-up to chat ${continuation.chatId}`);
    } catch (error) {
      console.error(`[CONTINUATION] Failed to send follow-up: ${error}`);
    }
  }

  async continueConversation(
    continuation: PendingContinuation,
    prompt: string
  ): Promise<string | undefined> {
    const agent = getAgent();
    if (!agent) {
      console.error("[CONTINUATION] Agent not available");
      return undefined;
    }

    try {
      const response = await agent.processMessage(prompt, continuation.chatId);
      console.log(`[CONTINUATION] Continued conversation for ${continuation.id}`);
      return response;
    } catch (error) {
      console.error(`[CONTINUATION] Failed to continue conversation: ${error}`);
      return undefined;
    }
  }

  getStats(): { total: number; running: number; completed: number; failed: number } {
    const all = Array.from(this.continuations.values());
    return {
      total: all.length,
      running: all.filter((c) => c.status === "running").length,
      completed: all.filter((c) => c.status === "completed").length,
      failed: all.filter((c) => c.status === "failed").length,
    };
  }

  clear(): void {
    this.continuations.clear();
  }

  get longRunningThreshold(): number {
    return this.config.longRunningThreshold;
  }
}

let continuationManagerInstance: ContinuationManager | null = null;

export function initializeContinuationManager(
  config?: Partial<ContinuationConfig>
): ContinuationManager {
  continuationManagerInstance = new ContinuationManager(config);
  return continuationManagerInstance;
}

export function getContinuationManager(): ContinuationManager {
  if (!continuationManagerInstance) {
    continuationManagerInstance = new ContinuationManager();
  }
  return continuationManagerInstance;
}
