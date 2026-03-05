import { getDatabase } from "../sqlite.ts";
import { generateUUIDv4 } from "../uuid.ts";
import type {
  CreateTaskInput,
  ScheduledTask,
  TaskPayload,
  TaskQueryOptions,
  TaskStatus,
  TaskType,
} from "./types.ts";

interface TaskRow {
  id: string;
  type: string;
  payload: string;
  scheduled_for: string;
  recurrence: string | null;
  status: string;
  created_at: string;
}

function rowToTask(row: TaskRow): ScheduledTask {
  let payload: TaskPayload;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = { message: row.payload } as TaskPayload;
  }

  return {
    id: row.id,
    type: row.type as TaskType,
    payload,
    scheduledFor: new Date(row.scheduled_for),
    recurrence: row.recurrence,
    status: row.status as TaskStatus,
    createdAt: new Date(row.created_at),
  };
}

export class TaskRepository {
  create(input: CreateTaskInput): ScheduledTask {
    const db = getDatabase();
    const id = generateUUIDv4();
    const now = new Date().toISOString();
    const scheduledFor = input.scheduledFor.toISOString();
    const payload = JSON.stringify(input.payload);
    const recurrence = input.recurrence || null;

    db.run(
      `INSERT INTO scheduled_tasks (id, type, payload, scheduled_for, recurrence, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      id,
      input.type,
      payload,
      scheduledFor,
      recurrence,
      now,
    );

    return {
      id,
      type: input.type,
      payload: input.payload,
      scheduledFor: input.scheduledFor,
      recurrence: recurrence,
      status: "pending",
      createdAt: new Date(now),
    };
  }

  getById(id: string): ScheduledTask | null {
    const db = getDatabase();
    const row = db.queryOne<TaskRow>(
      "SELECT * FROM scheduled_tasks WHERE id = ?",
      id,
    );
    return row ? rowToTask(row) : null;
  }

  updateStatus(id: string, status: TaskStatus, error?: string): boolean {
    const db = getDatabase();

    if (error) {
      const existing = this.getById(id);
      if (!existing) return false;

      const payload = {
        ...existing.payload,
        _error: error,
      };

      db.run(
        "UPDATE scheduled_tasks SET status = ?, payload = ? WHERE id = ?",
        status,
        JSON.stringify(payload),
        id,
      );
    } else {
      db.run(
        "UPDATE scheduled_tasks SET status = ? WHERE id = ?",
        status,
        id,
      );
    }

    return true;
  }

  delete(id: string): boolean {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM scheduled_tasks WHERE id = ?",
      id,
    );

    if (!result || result.count === 0) return false;

    db.run("DELETE FROM scheduled_tasks WHERE id = ?", id);
    return true;
  }

  getDueTasks(now: Date): ScheduledTask[] {
    const db = getDatabase();
    const rows = db.query<TaskRow>(
      `SELECT * FROM scheduled_tasks 
       WHERE status = 'pending' 
       AND scheduled_for <= ? 
       ORDER BY scheduled_for ASC`,
      now.toISOString(),
    );
    return rows.map(rowToTask);
  }

  query(options: TaskQueryOptions): ScheduledTask[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    if (options.type) {
      conditions.push("type = ?");
      params.push(options.type);
    }

    if (options.scheduledBefore) {
      conditions.push("scheduled_for <= ?");
      params.push(options.scheduledBefore.toISOString());
    }

    if (options.scheduledAfter) {
      conditions.push("scheduled_for >= ?");
      params.push(options.scheduledAfter.toISOString());
    }

    let sql = "SELECT * FROM scheduled_tasks";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY scheduled_for ASC";

    if (options.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = db.query<TaskRow>(sql, ...params);
    return rows.map(rowToTask);
  }

  getPending(limit?: number): ScheduledTask[] {
    const options: TaskQueryOptions = { status: "pending" };
    if (limit !== undefined) options.limit = limit;
    return this.query(options);
  }

  getCompleted(limit?: number): ScheduledTask[] {
    const options: TaskQueryOptions = { status: "completed" };
    if (limit !== undefined) options.limit = limit;
    return this.query(options);
  }

  count(): number {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM scheduled_tasks",
    );
    return result?.count ?? 0;
  }

  countByStatus(status: TaskStatus): number {
    const db = getDatabase();
    const result = db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM scheduled_tasks WHERE status = ?",
      status,
    );
    return result?.count ?? 0;
  }
}

let taskRepoInstance: TaskRepository | null = null;

export function getTaskRepository(): TaskRepository {
  if (!taskRepoInstance) {
    taskRepoInstance = new TaskRepository();
  }
  return taskRepoInstance;
}
