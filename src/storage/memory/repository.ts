import { getDatabase } from "../sqlite.ts";
import { generateUUIDv4 } from "../uuid.ts";
import type {
  CreateMemoryInput,
  Memory,
  MemoryCategory,
  MemorySearchOptions,
  MemorySearchResult,
  UpdateMemoryInput,
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

export class MemoryRepository {
  create(input: CreateMemoryInput): Memory {
    const db = getDatabase();
    const id = generateUUIDv4();
    const now = new Date().toISOString();
    const category = input.category || "general";
    const importance = input.importance ?? 5;
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";

    db.run(
      `INSERT INTO memories (id, content, category, importance, metadata, created_at, updated_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      id,
      input.content,
      category,
      importance,
      metadata,
      now,
      now,
      now,
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

  getById(id: string): Memory | null {
    const db = getDatabase();
    const row = db.queryOne<MemoryRow>(
      "SELECT * FROM memories WHERE id = ?",
      id,
    );

    if (!row) return null;

    const newAccessCount = row.access_count + 1;
    db.run(
      "UPDATE memories SET last_accessed_at = ?, access_count = ? WHERE id = ?",
      new Date().toISOString(),
      newAccessCount,
      id,
    );

    const memory = rowToMemory(row);
    memory.accessCount = newAccessCount;
    memory.lastAccessedAt = new Date();
    return memory;
  }

  getAll(options?: { category?: MemoryCategory; limit?: number }): Memory[] {
    const db = getDatabase();
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

    const rows = db.query<MemoryRow>(sql, ...params);
    return rows.map(rowToMemory);
  }

  update(id: string, input: UpdateMemoryInput): Memory | null {
    const db = getDatabase();
    const existing = this.getById(id);
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

    db.run(
      `UPDATE memories SET ${updates.join(", ")} WHERE id = ?`,
      ...values,
    );

    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories WHERE id = ?",
      id,
    );

    if (!result || result.count === 0) return false;

    db.run("DELETE FROM memories WHERE id = ?", id);
    return true;
  }

  search(options: MemorySearchOptions): MemorySearchResult[] {
    if (options.useFts !== false && options.query.trim()) {
      return this.ftsSearch(options);
    }

    return this.likeSearch(options);
  }

  private ftsSearch(options: MemorySearchOptions): MemorySearchResult[] {
    const db = getDatabase();
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
      const rows = db.query<MemoryRow & { relevance: number }>(sql, ...params);
      return rows.map((row) => ({
        memory: rowToMemory(row),
        relevanceScore: Math.abs(row.relevance),
      }));
    } catch {
      return this.likeSearch(options);
    }
  }

  private likeSearch(options: MemorySearchOptions): MemorySearchResult[] {
    const db = getDatabase();
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

    const rows = db.query<MemoryRow>(sql, ...params);
    return rows.map((row) => ({
      memory: rowToMemory(row),
      relevanceScore: 1,
    }));
  }

  getRecent(limit: number = 10): Memory[] {
    const db = getDatabase();
    const rows = db.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY created_at DESC LIMIT ?",
      limit,
    );
    return rows.map(rowToMemory);
  }

  getImportant(limit: number = 10): Memory[] {
    const db = getDatabase();
    const rows = db.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?",
      limit,
    );
    return rows.map(rowToMemory);
  }

  getFrequentlyAccessed(limit: number = 10): Memory[] {
    const db = getDatabase();
    const rows = db.query<MemoryRow>(
      "SELECT * FROM memories ORDER BY access_count DESC, importance DESC LIMIT ?",
      limit,
    );
    return rows.map(rowToMemory);
  }

  getByCategory(category: MemoryCategory): Memory[] {
    const db = getDatabase();
    const rows = db.query<MemoryRow>(
      "SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, created_at DESC",
      category,
    );
    return rows.map(rowToMemory);
  }

  count(): number {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories",
    );
    return result?.count ?? 0;
  }

  countByCategory(category: MemoryCategory): number {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM memories WHERE category = ?",
      category,
    );
    return result?.count ?? 0;
  }
}

let memoryRepoInstance: MemoryRepository | null = null;

export function getMemoryRepository(): MemoryRepository {
  if (!memoryRepoInstance) {
    memoryRepoInstance = new MemoryRepository();
  }
  return memoryRepoInstance;
}
