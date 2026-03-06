import { getDatabase } from "../sqlite.ts";
import { generateUUIDv4 } from "../uuid.ts";
import type {
  Conversation,
  CreateMessageInput,
  Message,
  ToolCallData,
} from "./types.ts";

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_call_id: string | null;
  tool_calls: string | null;
  created_at: string;
}

interface ConversationRow {
  id: string;
  chat_id: number | null;
  created_at: string;
  updated_at: string;
}

function rowToMessage(row: MessageRow): Message {
  const message: Message = {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    createdAt: new Date(row.created_at),
  };

  if (row.tool_call_id) {
    message.toolCallId = row.tool_call_id;
  }

  if (row.tool_calls) {
    message.toolCalls = JSON.parse(row.tool_calls) as ToolCallData[];
  }

  return message;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    chatId: row.chat_id ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class ConversationRepository {
  getOrCreateConversation(chatId: number): Conversation {
    const db = getDatabase();

    let conversation = db.queryOne<ConversationRow>(
      "SELECT * FROM conversations WHERE chat_id = ?",
      chatId,
    );

    if (!conversation) {
      const id = generateUUIDv4();
      const now = new Date().toISOString();
      db.run(
        "INSERT INTO conversations (id, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
        id,
        chatId,
        now,
        now,
      );
      conversation = {
        id,
        chat_id: chatId,
        created_at: now,
        updated_at: now,
      };
    }

    return rowToConversation(conversation);
  }

  getConversationByChatId(chatId: number): Conversation | null {
    const db = getDatabase();
    const row = db.queryOne<ConversationRow>(
      "SELECT * FROM conversations WHERE chat_id = ?",
      chatId,
    );
    return row ? rowToConversation(row) : null;
  }

  updateConversationTimestamp(conversationId: string): void {
    const db = getDatabase();
    db.run(
      "UPDATE conversations SET updated_at = ? WHERE id = ?",
      new Date().toISOString(),
      conversationId,
    );
  }

  createMessage(input: CreateMessageInput): Message {
    const db = getDatabase();
    const id = generateUUIDv4();
    const now = new Date().toISOString();
    const toolCallsJson = input.toolCalls ? JSON.stringify(input.toolCalls) : null;

    db.run(
      `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.conversationId,
      input.role,
      input.content,
      input.toolCallId ?? null,
      toolCallsJson,
      now,
    );

    this.updateConversationTimestamp(input.conversationId);

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolCallId: input.toolCallId,
      toolCalls: input.toolCalls,
      createdAt: new Date(now),
    };
  }

  getMessages(conversationId: string, limit?: number): Message[] {
    const db = getDatabase();
    let sql = "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC";
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const rows = db.query<MessageRow>(sql, conversationId);
    return rows.map(rowToMessage);
  }

  getRecentMessages(chatId: number, limit: number = 20): Message[] {
    const conversation = this.getConversationByChatId(chatId);
    if (!conversation) return [];
    return this.getMessages(conversation.id, limit);
  }

  clearConversation(chatId: number): void {
    const db = getDatabase();
    const conversation = this.getConversationByChatId(chatId);
    if (conversation) {
      db.run("DELETE FROM messages WHERE conversation_id = ?", conversation.id);
      db.run("DELETE FROM conversations WHERE id = ?", conversation.id);
    }
  }

  clearAllConversations(): void {
    const db = getDatabase();
    db.run("DELETE FROM messages");
    db.run("DELETE FROM conversations");
  }
}

let instance: ConversationRepository | null = null;

export function getConversationRepository(): ConversationRepository {
  if (!instance) {
    instance = new ConversationRepository();
  }
  return instance;
}
