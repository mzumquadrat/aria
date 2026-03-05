import { Database, type RestBindParameters } from "@db/sqlite";
import { dirname } from "@std/path";
import { ensureDir } from "@std/fs";

export interface DatabaseConfig {
  path: string;
}

export class SQLiteDatabase {
  private db: Database | null = null;
  private path: string;

  constructor(config: DatabaseConfig) {
    this.path = config.path;
  }

  async initialize(): Promise<void> {
    const dbDir = dirname(this.path);
    await ensureDir(dbDir);

    this.db = new Database(this.path);
    this.runMigrations();
  }

  private runMigrations(): void {
    if (!this.db) throw new Error("Database not initialized");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id),
        role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        type TEXT CHECK(type IN ('notification', 'script', 'skill', 'api')),
        payload TEXT,
        scheduled_for DATETIME,
        recurrence TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        resource TEXT,
        details TEXT,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        description TEXT,
        code TEXT,
        schema TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        command TEXT,
        args TEXT,
        env TEXT,
        enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'stopped',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        importance INTEGER DEFAULT 5,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        category,
        content='memories',
        content_rowid='rowid'
      )
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, category) 
        VALUES (new.rowid, new.content, new.category);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, category) 
        VALUES('delete', old.rowid, old.content, old.category);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, category) 
        VALUES('delete', old.rowid, old.content, old.category);
        INSERT INTO memories_fts(rowid, content, category) 
        VALUES (new.rowid, new.content, new.category);
      END
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_scheduled_for ON scheduled_tasks(scheduled_for)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)
    `);
  }

  run(sql: string, ...params: RestBindParameters): void {
    if (!this.db) throw new Error("Database not initialized");
    this.db.run(sql, ...params);
  }

  query<T extends object = Record<string, unknown>>(
    sql: string,
    ...params: RestBindParameters
  ): T[] {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare<T>(sql);
    return stmt.all(...params);
  }

  queryOne<T extends object = Record<string, unknown>>(
    sql: string,
    ...params: RestBindParameters
  ): T | undefined {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare<T>(sql);
    return stmt.get(...params);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  get isOpen(): boolean {
    return this.db !== null;
  }
}

let dbInstance: SQLiteDatabase | null = null;

export function getDatabase(): SQLiteDatabase {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initializeDatabase first.");
  }
  return dbInstance;
}

export async function initializeDatabase(config: DatabaseConfig): Promise<SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = new SQLiteDatabase(config);
  await dbInstance.initialize();
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
