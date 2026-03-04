import { generateUUIDv4 } from "../storage/uuid.ts";
import type {
  QueuedTask,
  QueueConfig,
  QueueStats,
  TaskContext,
  TaskPriority,
  TaskStatus,
  TaskHandler,
} from "./types.ts";
import { getPriorityValue } from "./types.ts";

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 3,
  defaultTimeout: 30000,
};

export class TaskQueue<T = unknown> {
  private config: QueueConfig;
  private pending: QueuedTask<T>[] = [];
  private running: Map<string, QueuedTask<T>> = new Map();
  private completed: QueuedTask<T>[] = [];
  private failed: QueuedTask<T>[] = [];
  private totalProcessed: number = 0;
  private handlers: Map<string, TaskHandler<T>> = new Map();
  private processing: boolean = false;
  private timeoutIds: Map<string, number> = new Map();
  private started: boolean = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerHandler(type: string, handler: TaskHandler<T>): void {
    this.handlers.set(type, handler);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.processQueue();
  }

  stop(): void {
    this.started = false;
  }

  enqueue(
    type: string,
    payload: T,
    context: TaskContext,
    priority: TaskPriority = "normal"
  ): QueuedTask<T> {
    const task: QueuedTask<T> = {
      id: generateUUIDv4(),
      type,
      payload,
      context,
      priority,
      status: "pending",
      createdAt: new Date(),
    };

    this.insertByPriority(task);
    if (this.started) {
      this.processQueue();
    }

    return task;
  }

  private insertByPriority(task: QueuedTask<T>): void {
    const priorityValue = getPriorityValue(task.priority);
    let inserted = false;

    for (let i = 0; i < this.pending.length; i++) {
      if (getPriorityValue(this.pending[i].priority) < priorityValue) {
        this.pending.splice(i, 0, task);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.pending.push(task);
    }
  }

  dequeue(): QueuedTask<T> | undefined {
    return this.pending.shift();
  }

  peek(): QueuedTask<T> | undefined {
    return this.pending[0];
  }

  getTask(id: string): QueuedTask<T> | undefined {
    const running = this.running.get(id);
    if (running) return running;

    return this.pending.find((t) => t.id === id) ??
      this.completed.find((t) => t.id === id) ??
      this.failed.find((t) => t.id === id);
  }

  updateStatus(id: string, status: TaskStatus, error?: string): boolean {
    const task = this.getTask(id);
    if (!task) return false;

    task.status = status;
    if (error) task.error = error;

    return true;
  }

  private processQueue(): void {
    if (this.processing) return;

    this.processing = true;

    while (this.pending.length > 0 && this.running.size < this.config.maxConcurrent) {
      const task = this.dequeue();
      if (!task) break;

      this.executeTask(task);
    }

    this.processing = false;
  }

  private async executeTask(task: QueuedTask<T>): Promise<void> {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = "failed";
      task.error = `No handler registered for task type: ${task.type}`;
      task.completedAt = new Date();
      this.failed.push(task);
      this.totalProcessed++;
      return;
    }

    task.status = "running";
    task.startedAt = new Date();
    this.running.set(task.id, task);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      const t = this.running.get(task.id);
      if (t) t.status = "timeout";
    }, this.config.defaultTimeout);
    this.timeoutIds.set(task.id, timeoutId);

    try {
      const result = await handler(task);

      if (!timedOut) {
        task.status = "completed";
        task.result = result;
        task.completedAt = new Date();
        this.completed.push(task);
      }
    } catch (error) {
      if (!timedOut) {
        task.status = "failed";
        task.error = error instanceof Error ? error.message : "Unknown error";
        task.completedAt = new Date();
        this.failed.push(task);
      }
    } finally {
      const tid = this.timeoutIds.get(task.id);
      if (tid !== undefined) {
        clearTimeout(tid);
        this.timeoutIds.delete(task.id);
      }

      if (timedOut) {
        task.completedAt = new Date();
        this.failed.push(task);
      }

      this.running.delete(task.id);
      this.totalProcessed++;
      this.processQueue();
    }
  }

  getStats(): QueueStats {
    return {
      pending: this.pending.length,
      running: this.running.size,
      completed: this.completed.length,
      failed: this.failed.length,
      totalProcessed: this.totalProcessed,
    };
  }

  getPending(): QueuedTask<T>[] {
    return [...this.pending];
  }

  getRunning(): QueuedTask<T>[] {
    return Array.from(this.running.values());
  }

  getCompleted(): QueuedTask<T>[] {
    return [...this.completed];
  }

  getFailed(): QueuedTask<T>[] {
    return [...this.failed];
  }

  clear(): void {
    this.pending = [];
    this.completed = [];
    this.failed = [];
  }

  get availableSlots(): number {
    return this.config.maxConcurrent - this.running.size;
  }

  get size(): number {
    return this.pending.length;
  }
}

let queueInstance: TaskQueue | null = null;

export function initializeQueue(config?: Partial<QueueConfig>): TaskQueue {
  queueInstance = new TaskQueue(config);
  return queueInstance;
}

export function getQueue(): TaskQueue {
  if (!queueInstance) {
    queueInstance = new TaskQueue();
  }
  return queueInstance;
}
