import type { Config } from "../config/mod.ts";
import { toolRegistry, type ToolResult } from "./tools.ts";
import { loadSoul, formatSoulForPrompt } from "../soul/mod.ts";
import { getLockManager, Mutex } from "./lock.ts";
import type { MessageContent } from "../vision/types.ts";

export type ToolCallCallback = (toolName: string) => void;

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  name?: string;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
}

interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCallMessage[];
  finish_reason: string;
}

interface ToolCallResult {
  toolCall: ToolCallMessage;
  result: ToolResult;
}

const SYSTEM_PROMPT = `You are Aria, a helpful personal assistant with access to tools and skills.

You have access to tools that can help you accomplish tasks. When a user asks you to do something:
1. Consider if any tools would help accomplish the task
2. If tools are needed, call them immediately - do not just say you will do something
3. Use the results to provide a helpful response

CRITICAL: You must actually CALL the tools to perform actions. NEVER just say you will do something without calling the appropriate tool. For example:
- If asked to set a reminder, call the schedule_task tool - don't just say "I'll set a reminder"
- If asked to remember something, call the remember tool - don't just say "I'll remember that"
- If asked to search, call the web_search tool - don't just say "I'll search for that"

Actions are performed by calling tools, not by stating intentions. Always execute, never just describe.

Be conversational and helpful. After performing actions with tools, briefly confirm what you did.

TELEGRAM MARKDOWN FORMATTING:
Your responses are sent via Telegram using MarkdownV2 format. You can use these formatting styles:
- *bold text*
- _italic text_
- __underline__
- ~strikethrough~
- ||spoiler||
- [link](url)
- \`inline code\`
- \`\`\`code block\`\`\`

Do NOT manually escape special characters - the system handles escaping automatically. Just write naturally and use formatting when helpful.`;

export class Agent {
  private config: Config;
  private conversationHistories: Map<number, Message[]> = new Map();
  private historyMutexes: Map<number, Mutex> = new Map();
  private maxHistoryLength: number = 20;
  private onToolCall: ToolCallCallback | null = null;
  private pendingImages: Map<number, Array<{ imageData: string; mimeType: string; description?: string }>> = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  setToolCallCallback(callback: ToolCallCallback): void {
    this.onToolCall = callback;
  }

  addPendingImage(chatId: number, imageData: string, mimeType: string, description?: string): void {
    if (!this.pendingImages.has(chatId)) {
      this.pendingImages.set(chatId, []);
    }
    const entry: { imageData: string; mimeType: string; description?: string } = { imageData, mimeType };
    if (description !== undefined) {
      entry.description = description;
    }
    this.pendingImages.get(chatId)!.push(entry);
  }

  getPendingImages(chatId: number): Array<{ imageData: string; mimeType: string; description?: string }> {
    return this.pendingImages.get(chatId) ?? [];
  }

  clearPendingImages(chatId: number): void {
    this.pendingImages.delete(chatId);
  }

  private getHistory(chatId: number): Message[] {
    let history = this.conversationHistories.get(chatId);
    if (!history) {
      history = [];
      this.conversationHistories.set(chatId, history);
    }
    return history;
  }

  private getMutex(chatId: number): Mutex {
    let mutex = this.historyMutexes.get(chatId);
    if (!mutex) {
      mutex = new Mutex();
      this.historyMutexes.set(chatId, mutex);
    }
    return mutex;
  }

  processMessage(userMessage: string, chatId?: number): Promise<string> {
    const effectiveChatId = chatId ?? 0;
    const mutex = this.getMutex(effectiveChatId);

    return mutex.withLock(() => this.processMessageInternal(userMessage, effectiveChatId));
  }

  private async processMessageInternal(userMessage: string, chatId: number): Promise<string> {
    const history = this.getHistory(chatId);
    const tools = this.getToolsSchema();
    const soul = await loadSoul();
    const soulPrompt = formatSoulForPrompt(soul.content);

    const systemMessage = `${SYSTEM_PROMPT}\n\n${soulPrompt}\n\nAvailable tools:\n${JSON.stringify(tools, null, 2)}`;

    this.addToHistory(history, { role: "system", content: systemMessage });

    const pendingImages = this.pendingImages.get(chatId) ?? [];
    if (pendingImages.length > 0) {
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: userMessage },
      ];

      for (const img of pendingImages) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.imageData}`,
          },
        });
      }

      this.addToHistory(history, { role: "user", content: userContent as MessageContent });
      this.clearPendingImages(chatId);
    } else {
      this.addToHistory(history, { role: "user", content: userMessage });
    }

    let response: string | null = null;
    let iterations = 0;
    const maxIterations = 5;

    while (!response && iterations < maxIterations) {
      iterations++;

      const llmResponse = await this.callLLM(history);

      if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        this.addToHistory(history, {
          role: "assistant",
          content: llmResponse.content || "",
          tool_calls: llmResponse.tool_calls,
        });

        const toolResults = await this.executeToolCallsParallel(llmResponse.tool_calls);

        for (const { toolCall, result } of toolResults) {
          this.addToHistory(history, {
            role: "tool",
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          });
        }

        continue;
      }

      if (llmResponse.content) {
        response = llmResponse.content;
        console.log(`[ARIA] ${response}`);
        this.addToHistory(history, { role: "assistant", content: response });
      }
    }

    return response ?? "I apologize, but I couldn't process your request. Please try again.";
  }

  private executeToolCallsParallel(toolCalls: ToolCallMessage[]): Promise<ToolCallResult[]> {
    const promises = toolCalls.map((toolCall) => {
      if (this.onToolCall) {
        this.onToolCall(toolCall.function.name);
      }

      return this.executeToolCall(toolCall).then((result) => ({ toolCall, result }));
    });

    return Promise.all(promises);
  }

  private addToHistory(history: Message[], message: Message): void {
    history.push(message);
    if (history.length > this.maxHistoryLength + 1) {
      const systemMessages = history.filter((m) => m.role === "system");
      const otherMessages = history.filter((m) => m.role !== "system");
      history.length = 0;
      history.push(
        ...systemMessages,
        ...otherMessages.slice(-this.maxHistoryLength),
      );
    }
  }

  private hasImagesInHistory(history: Message[]): boolean {
    for (const msg of history) {
      if (typeof msg.content !== "string" && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === "object" && "type" in part && part.type === "image_url") {
            return true;
          }
        }
      }
    }
    return false;
  }

  private async callLLM(history: Message[]): Promise<LLMResponse> {
    const hasImages = this.hasImagesInHistory(history);
    const model = hasImages
      ? (this.config.openrouter.visionModel ?? this.config.openrouter.defaultModel)
      : this.config.openrouter.defaultModel;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.openrouter.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.config.openrouter.httpReferer ?? "https://aria.local",
      },
      body: JSON.stringify({
        model,
        messages: history,
        tools: this.getToolsSchema(),
        tool_choice: "auto",
        max_tokens: this.config.openrouter.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[LLM ERROR] Status: ${response.status}, Body: ${errorBody}`);
      throw new Error(`LLM request failed: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message?.content ?? null,
      tool_calls: choice.message?.tool_calls,
      finish_reason: choice.finish_reason,
    };
  }

  private getToolsSchema(): unknown[] {
    const tools = toolRegistry.getAvailableTools();
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || { type: "object", properties: {} },
      },
    }));
  }

  private executeToolCall(toolCall: ToolCallMessage): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    let input: unknown;

    try {
      input = JSON.parse(toolCall.function.arguments);
    } catch {
      input = {};
    }

    console.log(`[TOOL CALL] ${toolName}`);
    console.log(`[TOOL INPUT] ${JSON.stringify(input, null, 2)}`);

    return toolRegistry.executeTool({ tool: toolName, input });
  }

  clearHistory(chatId?: number): void {
    if (chatId !== undefined) {
      this.conversationHistories.delete(chatId);
      this.historyMutexes.delete(chatId);
    } else {
      this.conversationHistories.clear();
      this.historyMutexes.clear();
    }
  }
}

let agentInstance: Agent | null = null;

export function initializeAgent(config: Config): Agent {
  agentInstance = new Agent(config);
  return agentInstance;
}

export function getAgent(): Agent | null {
  return agentInstance;
}

export { getLockManager };
export {
  getContinuationManager,
  initializeContinuationManager,
  type PendingContinuation,
  type ContinuationConfig,
} from "./continuation.ts";
