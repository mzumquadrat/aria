export type MemoryCategory = 
  | "preference"
  | "fact"
  | "conversation"
  | "task"
  | "reminder"
  | "note"
  | "general";

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

export interface CreateMemoryInput {
  content: string;
  category?: MemoryCategory;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryInput {
  content?: string;
  category?: MemoryCategory;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  memory: Memory;
  relevanceScore: number;
}

export interface MemorySearchOptions {
  query: string;
  category?: MemoryCategory;
  minImportance?: number;
  limit?: number;
  useFts?: boolean;
}
