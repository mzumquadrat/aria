export type TaskPriority = "high" | "normal" | "low";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface TaskContext {
  chatId: number;
  userId: number;
  messageId?: number;
  metadata?: Record<string, unknown>;
}

export interface QueuedTask<T = unknown> {
  id: string;
  type: string;
  payload: T;
  context: TaskContext;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: unknown;
}

export interface QueueConfig {
  maxConcurrent: number;
  defaultTimeout: number;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

export type TaskHandler<T = unknown, R = unknown> = (
  task: QueuedTask<T>,
) => Promise<R>;

const PRIORITY_VALUES: Record<TaskPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

export function getPriorityValue(priority: TaskPriority): number {
  return PRIORITY_VALUES[priority];
}
