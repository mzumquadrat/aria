import { getAsyncDatabase } from "../async.ts";
import { generateUUIDv4 } from "../uuid.ts";
import type {
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryCategory,
} from "./types.ts";

interface MemoryRow {
  id: string;
  content: string;
  category: string;
  importance: number;
  metadata: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  access_count: number;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category as MemoryCategory,
    importance: row.importance,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastAccessedAt: new Date(row.last_accessed_at),
    accessCount: row.access_count,
  };
}

export class AsyncMemoryRepository {
  async create(input: CreateMemoryInput): Promise<Memory> {
    const asyncDb = getAsyncDatabase();
    const id = generateUUIDv4();
    const now = new Date().toISOString();
    const category = input.category || "general";
    const importance = input.importance ?? 5;
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";

    await asyncDb.runSql(
      `INSERT INTO memories (id, content, category, importance, metadata, created_at, updated_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      id,
      input.content,
      category,
      importance,
      metadata,
      now,
      now,
      now
    );

    return {
      id,
      content: input.content,
      category,
      importance,
      metadata: input.metadata || {},
      createdAt: new Date(now),
      updatedAt: new Date(now),
      lastAccessedAt: new Date(now),
      accessCount: 0,
    };
  }

  async getById(id: string): Promise<Memory | null> {
    const asyncDb = getAsyncDatabase();
    const row = await asyncDb.queryOne<MemoryRow>(
      "SELECT * FROM memories WHERE id = ?",
      id
    );

    if (!row) return null;

    const newAccessCount = row.access_count + 1;
    await asyncDb.runSql(
      "UPDATE memories SET last_accessed_at = ?, access_count = ? WHERE id = ?",
      new Date().toISOString(),
      newAccessCount,
      id
    );

    const memory = rowToMemory(row);
    memory.accessCount = newAccessCount;
    memory.lastAccessedAt = new Date();
    return memory;
  }

  async getAll(options?: { category?: MemoryCategory; limit?: number }): Promise<Memory[]> {
    const asyncDb = getAsyncDatabase();
    let sql = "SELECT * FROM memories";
    const params: string[] = [];

    if (options?.category) {
      sql += " WHERE category = ?";
      params.push(options.category);
    }

    sql += " ORDER BY importance DESC, created_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(String(options.limit));
    }

    const rows = await asyncDb.query<MemoryRow>(sql, ...params);
    return rows.map(rowToMemory);
  }

  async update(id: string, input: UpdateMemoryInput): Promise<Memory | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (input.content !== undefined) {
      updates.push("content = ?");
      values.push(input.content);
    }

    if (input.category !== undefined) {
      updates.push("category = ?");
      values.push(input.category);
    }

    if (input.importance !== undefined) {
      updates.push("importance = ?");
      values.push(input.importance);
    }

    if (input.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(JSON.stringify({ ...existing.metadata, ...input.metadata }));
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const asyncDb = getAsyncDatabase();
    await asyncDb.runSql(
      `UPDATE memories SET ${updates.join(", ")} WHERE id = ?`,
      ...values
    );

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const asyncDb = getAsyncDatabase();
    const result = await asyncDb.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories WHERE id = ?",
      id
    );

    if (!result || result.count === 0) return false;

    await asyncDb.runSql("DELETE FROM memories WHERE id = ?", id);
    return true;
  }

  search(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    if (options.useFts !== false && options.query.trim()) {
      return this.ftsSearch(options);
    }

    return this.likeSearch(options);
  }

  private async ftsSearch(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const asyncDb = getAsyncDatabase();
    const limit = options.limit || 10;
    let sql = `
      SELECT m.*, bm25(memories_fts) as relevance
      FROM memories m
      JOIN memories_fts ON m.rowid = memories_fts.rowid
      WHERE memories_fts MATCH ?
    `;
    const params: (string | number)[] = [options.query];

    if (options.category) {
      sql += " AND m.category = ?";
      params.push(options.category);
    }

    if (options.minImportance !== undefined) {
      sql += " AND m.importance >= ?";
      params.push(options.minImportance);
    }

    sql += " ORDER BY relevance ASC, m.importance DESC LIMIT ?";
    params.push(limit);

    try {
      const rows = await asyncDb.query<MemoryRow & { relevance: number }>(sql, ...params);
      return rows.map((row) => ({
        memory: rowToMemory(row),
        relevanceScore: Math.abs(row.relevance),
      }));
    } catch {
      return this.likeSearch(options);
    }
  }

  private async likeSearch(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const asyncDb = getAsyncDatabase();
    const limit = options.limit || 10;
    let sql = "SELECT * FROM memories WHERE content LIKE ?";
    const params: (string | number)[] = [`%${options.query}%`];

    if (options.category) {
      sql += " AND category = ?";
      params.push(options.category);
    }

    if (options.minImportance !== undefined) {
      sql += " AND importance >= ?";
      params.push(options.minImportance);
    }

    sql += " ORDER BY importance DESC, created_at DESC LIMIT ?";
    params.push(limit);

    const rows = await asyncDb.query<MemoryRow>(sql, ...params);
    return rows.map((row) => ({
      memory: rowToMemory(row),
      relevanceScore: 1,
    }));
  }

  async getRecent(limit: number = 10): Promise<Memory[]> {
    const asyncDb = getAsyncDatabase();
    const rows = await asyncDb.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY created_at DESC LIMIT ?",
      limit
    );
    return rows.map(rowToMemory);
  }

  async getImportant(limit: number = 10): Promise<Memory[]> {
    const asyncDb = getAsyncDatabase();
    const rows = await asyncDb.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?",
      limit
    );
    return rows.map(rowToMemory);
  }

  async getFrequentlyAccessed(limit: number = 10): Promise<Memory[]> {
    const asyncDb = getAsyncDatabase();
    const rows = await asyncDb.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY access_count DESC, importance DESC LIMIT ?",
      limit
    );
    return rows.map(rowToMemory);
  }

  async getByCategory(category: MemoryCategory): Promise<Memory[]> {
    const asyncDb = getAsyncDatabase();
    const rows = await asyncDb.query<MemoryRow>(
      "SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, created_at DESC",
      category
    );
    return rows.map(rowToMemory);
  }

  async count(): Promise<number> {
    const asyncDb = getAsyncDatabase();
    const result = await asyncDb.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories"
    );
    return result?.count ?? 0;
  }

  async countByCategory(category: MemoryCategory): Promise<number> {
    const asyncDb = getAsyncDatabase();
    const result = await asyncDb.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories WHERE category = ?",
      category
    );
    return result?.count ?? 0;
  }
}

let asyncMemoryRepoInstance: AsyncMemoryRepository | null = null;

export function getAsyncMemoryRepository(): AsyncMemoryRepository {
  if (!asyncMemoryRepoInstance) {
    asyncMemoryRepoInstance = new AsyncMemoryRepository();
  }
  return asyncMemoryRepoInstance;
}
