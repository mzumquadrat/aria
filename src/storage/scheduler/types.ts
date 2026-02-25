export type TaskType = "notification" | "skill" | "agent";
export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface NotificationPayload {
  message: string;
}

export interface SkillPayload {
  skillName: string;
  input: unknown;
}

export interface AgentPayload {
  prompt: string;
  context?: string;
}

export type TaskPayload = NotificationPayload | SkillPayload | AgentPayload;

export interface ScheduledTask {
  id: string;
  type: TaskType;
  payload: TaskPayload;
  scheduledFor: Date;
  recurrence: string | null;
  status: TaskStatus;
  error?: string;
  createdAt: Date;
}

export interface CreateTaskInput {
  type: TaskType;
  payload: TaskPayload;
  scheduledFor: Date;
  recurrence?: string;
}

export interface TaskQueryOptions {
  status?: TaskStatus;
  type?: TaskType;
  scheduledBefore?: Date;
  scheduledAfter?: Date;
  limit?: number;
}
