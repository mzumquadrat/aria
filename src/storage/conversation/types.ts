export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCallId?: string | undefined;
  toolCalls?: ToolCallData[] | undefined;
  createdAt: Date;
}

export interface ToolCallData {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Conversation {
  id: string;
  chatId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCallId?: string | undefined;
  toolCalls?: ToolCallData[] | undefined;
}
