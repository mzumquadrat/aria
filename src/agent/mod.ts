import type { Config } from "../config/mod.ts";
import { toolRegistry, type PhotoService, type ToolResult } from "./tools.ts";
import { formatSoulForPrompt, loadSoul } from "../soul/mod.ts";
import { getLockManager, Mutex } from "./lock.ts";
import type { MessageContent } from "../vision/types.ts";
import {
  getConversationRepository,
  type CreateMessageInput,
  type Message as StoredMessage,
  type ToolCallData,
} from "../storage/conversation/mod.ts";

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
  private photoService: PhotoService | null = null;
  private pendingImages: Map<
    number,
    Array<{ imageData: string; mimeType: string; description?: string }>
  > = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  setToolCallCallback(callback: ToolCallCallback): void {
    this.onToolCall = callback;
  }

  setPhotoService(service: PhotoService | null): void {
    this.photoService = service;
  }

  addPendingImage(chatId: number, imageData: string, mimeType: string, description?: string): void {
    if (!this.pendingImages.has(chatId)) {
      this.pendingImages.set(chatId, []);
    }
    const entry: { imageData: string; mimeType: string; description?: string } = {
      imageData,
      mimeType,
    };
    if (description !== undefined) {
      entry.description = description;
    }
    this.pendingImages.get(chatId)!.push(entry);
  }

  getPendingImages(
    chatId: number,
  ): Array<{ imageData: string; mimeType: string; description?: string }> {
    return this.pendingImages.get(chatId) ?? [];
  }

  clearPendingImages(chatId: number): void {
    this.pendingImages.delete(chatId);
  }

  /**
   * Process tool result to detect and send image data automatically.
   * When a tool returns image data (data + mimeType), sends it as a photo
   * and returns a simplified result to avoid large base64 in conversation history.
   */
  private async processImageResult(result: ToolResult, chatId: number): Promise<ToolResult> {
    // Check if the result contains image data
    if (
      result.success &&
      result.output &&
      typeof result.output === "object"
    ) {
      const output = result.output as Record<string, unknown>;
      
      // Check for image data pattern: { data: string, mimeType: "image/..." }
      if (
        typeof output.data === "string" &&
        typeof output.mimeType === "string" &&
        output.mimeType.startsWith("image/")
      ) {
        // We have image data - send it as a photo if service is available
        if (this.photoService && chatId !== 0) {
          try {
            const caption = output.caption as string | undefined;
            const sent = await this.photoService.sendPhoto(
              chatId,
              output.data,
              caption,
            );
            
            if (sent) {
              console.log(`[AGENT] Auto-sent image from tool ${result.tool}`);
              
              // Return a simplified result without the large base64 data
              const simplifiedOutput: Record<string, unknown> = {
                imageSent: true,
                mimeType: output.mimeType,
              };
              
              // Preserve other metadata like width/height if present
              if (typeof output.width === "number") simplifiedOutput.width = output.width;
              if (typeof output.height === "number") simplifiedOutput.height = output.height;
              
              return {
                ...result,
                output: simplifiedOutput,
              };
            }
          } catch (error) {
            console.error(`[AGENT] Failed to auto-send image: ${error}`);
          }
        }
      }
    }
    
    return result;
  }

  private getHistory(chatId: number): Message[] {
    let history = this.conversationHistories.get(chatId);
    if (!history) {
      const repo = getConversationRepository();
      const storedMessages = repo.getRecentMessages(chatId, this.maxHistoryLength);
      history = storedMessages.map((m) => this.storedToLLMMessage(m));
      this.conversationHistories.set(chatId, history);
    }
    return history;
  }

  private storedToLLMMessage(m: StoredMessage): Message {
    const msg: Message = {
      role: m.role,
      content: m.content,
    };
    if (m.toolCallId) {
      msg.tool_call_id = m.toolCallId;
    }
    if (m.toolCalls) {
      msg.tool_calls = m.toolCalls;
    }
    return msg;
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
    const soul = await loadSoul();
    const soulPrompt = formatSoulForPrompt(soul.content);

    const systemMessage = `${SYSTEM_PROMPT}\n\n${soulPrompt}`;

    const hasSystemMessage = history.some((m) => m.role === "system");
    if (!hasSystemMessage) {
      this.addToHistory(history, { role: "system", content: systemMessage }, chatId);
    }

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

      this.addToHistory(history, { role: "user", content: userContent as MessageContent }, chatId);
      this.clearPendingImages(chatId);
    } else {
      this.addToHistory(history, { role: "user", content: userMessage }, chatId);
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
        }, chatId);

        const toolResults = await this.executeToolCallsParallel(llmResponse.tool_calls);

        for (const { toolCall, result } of toolResults) {
          const processedResult = await this.processImageResult(result, chatId);
          
          this.addToHistory(history, {
            role: "tool",
            content: JSON.stringify(processedResult),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          }, chatId);
        }

        continue;
      }

      if (llmResponse.content) {
        response = llmResponse.content;
        console.log(`[ARIA] ${response}`);
        this.addToHistory(history, { role: "assistant", content: response }, chatId);
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

  private addToHistory(history: Message[], message: Message, chatId: number): void {
    history.push(message);

    const repo = getConversationRepository();
    const conversation = repo.getOrCreateConversation(chatId);

    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

    const input: CreateMessageInput = {
      conversationId: conversation.id,
      role: message.role,
      content,
      toolCallId: message.tool_call_id,
      toolCalls: message.tool_calls?.map((tc): ToolCallData => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      })),
    };
    repo.createMessage(input);

    if (history.length > this.maxHistoryLength + 1) {
      const lastSystemMessage = history.filter((m) => m.role === "system").at(-1);
      const otherMessages = history.filter((m) => m.role !== "system");
      history.length = 0;
      if (lastSystemMessage) {
        history.push(lastSystemMessage);
      }
      history.push(...otherMessages.slice(-this.maxHistoryLength));
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
    const repo = getConversationRepository();
    if (chatId !== undefined) {
      this.conversationHistories.delete(chatId);
      this.historyMutexes.delete(chatId);
      repo.clearConversation(chatId);
    } else {
      this.conversationHistories.clear();
      this.historyMutexes.clear();
      repo.clearAllConversations();
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
  type ContinuationConfig,
  getContinuationManager,
  initializeContinuationManager,
  type PendingContinuation,
} from "./continuation.ts";
