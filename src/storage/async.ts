import type { RestBindParameters } from "@db/sqlite";
import type { SQLiteDatabase } from "./sqlite.ts";

export type DbOperation<T> = (db: SQLiteDatabase) => T;

interface QueuedOperation<T> {
  operation: DbOperation<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class AsyncDatabase {
  private db: SQLiteDatabase;
  private queue: QueuedOperation<unknown>[] = [];
  private processing: boolean = false;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  run<T = void>(operation: DbOperation<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        operation: operation as DbOperation<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    const processNext = (): void => {
      const item = this.queue.shift();
      if (!item) {
        this.processing = false;
        return;
      }

      try {
        const result = item.operation(this.db);
        item.resolve(result);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      if (this.queue.length > 0) {
        setTimeout(processNext, 0);
      } else {
        this.processing = false;
      }
    };

    processNext();
  }

  runSql(sql: string, ...params: RestBindParameters): Promise<void> {
    return this.run((db) => {
      db.run(sql, ...params);
    });
  }

  query<T extends object = Record<string, unknown>>(
    sql: string,
    ...params: RestBindParameters
  ): Promise<T[]> {
    return this.run((db) => db.query<T>(sql, ...params));
  }

  queryOne<T extends object = Record<string, unknown>>(
    sql: string,
    ...params: RestBindParameters
  ): Promise<T | undefined> {
    return this.run((db) => db.queryOne<T>(sql, ...params));
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }
}

let asyncDbInstance: AsyncDatabase | null = null;

export function initializeAsyncDatabase(db: SQLiteDatabase): AsyncDatabase {
  asyncDbInstance = new AsyncDatabase(db);
  return asyncDbInstance;
}

export function getAsyncDatabase(): AsyncDatabase {
  if (!asyncDbInstance) {
    throw new Error("AsyncDatabase not initialized. Call initializeAsyncDatabase first.");
  }
  return asyncDbInstance;
}

export function asyncRun(sql: string, ...params: RestBindParameters): Promise<void> {
  const asyncDb = getAsyncDatabase();
  return asyncDb.runSql(sql, ...params);
}

export function asyncQuery<T extends object = Record<string, unknown>>(
  sql: string,
  ...params: RestBindParameters
): Promise<T[]> {
  const asyncDb = getAsyncDatabase();
  return asyncDb.query<T>(sql, ...params);
}

export function asyncQueryOne<T extends object = Record<string, unknown>>(
  sql: string,
  ...params: RestBindParameters
): Promise<T | undefined> {
  const asyncDb = getAsyncDatabase();
  return asyncDb.queryOne<T>(sql, ...params);
}
