export { generateUUIDv4 } from "./storage/uuid.ts";

export interface Conversation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: Date;
}

export interface ScheduledTask {
  id: string;
  type: "notification" | "script" | "skill" | "api";
  payload: Record<string, unknown>;
  scheduledFor: Date;
  recurrence: string | null;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  result: string;
  createdAt: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  code: string;
  schema: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
}

export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: "stopped" | "running" | "error";
  createdAt: Date;
}
