import type { Config } from "../config/mod.ts";
import { toolRegistry, type ToolResult } from "./tools.ts";
import { loadSoul, formatSoulForPrompt } from "../soul/mod.ts";

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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

Be conversational and helpful. After performing actions with tools, briefly confirm what you did.`;

export class Agent {
  private config: Config;
  private conversationHistory: Message[] = [];
  private maxHistoryLength: number = 20;

  constructor(config: Config) {
    this.config = config;
  }

  async processMessage(userMessage: string): Promise<string> {
    const tools = this.getToolsSchema();
    const soul = await loadSoul();
    const soulPrompt = formatSoulForPrompt(soul.content);

    const systemMessage = `${SYSTEM_PROMPT}\n\n${soulPrompt}\n\nAvailable tools:\n${JSON.stringify(tools, null, 2)}`;

    this.addToHistory({ role: "system", content: systemMessage });
    this.addToHistory({ role: "user", content: userMessage });

    let response: string | null = null;
    let iterations = 0;
    const maxIterations = 5;

    while (!response && iterations < maxIterations) {
      iterations++;

      const llmResponse = await this.callLLM();

      if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        this.addToHistory({
          role: "assistant",
          content: llmResponse.content || "",
          tool_calls: llmResponse.tool_calls,
        });

        for (const toolCall of llmResponse.tool_calls) {
          const result = await this.executeToolCall(toolCall);
          this.addToHistory({
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
        this.addToHistory({ role: "assistant", content: response });
      }
    }

    return response ?? "I apologize, but I couldn't process your request. Please try again.";
  }

  private addToHistory(message: Message): void {
    this.conversationHistory.push(message);
    if (this.conversationHistory.length > this.maxHistoryLength + 1) {
      const systemMessages = this.conversationHistory.filter((m) => m.role === "system");
      const otherMessages = this.conversationHistory.filter((m) => m.role !== "system");
      this.conversationHistory = [
        ...systemMessages,
        ...otherMessages.slice(-this.maxHistoryLength),
      ];
    }
  }

  private async callLLM(): Promise<LLMResponse> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.openrouter.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.config.openrouter.httpReferer ?? "https://aria.local",
      },
      body: JSON.stringify({
        model: this.config.openrouter.defaultModel,
        messages: this.conversationHistory,
        tools: this.getToolsSchema(),
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
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

    return toolRegistry.executeTool({ tool: toolName, input });
  }

  clearHistory(): void {
    this.conversationHistory = [];
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
