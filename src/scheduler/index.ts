import type { Bot } from "grammy";
import type { Config } from "../config/mod.ts";
import { getTaskRepository } from "../storage/scheduler/repository.ts";
import { executeTask, initializeExecutor } from "./executor.ts";
import { getNextOccurrence } from "./cron.ts";
import type { ScheduledTask } from "../storage/scheduler/types.ts";

export interface SchedulerConfig {
  checkInterval: number;
  maxConcurrent: number;
}

export class SchedulerService {
  private config: SchedulerConfig;
  private running: boolean = false;
  private intervalId: number | null = null;
  private activeTasks: Set<string> = new Set();
  private taskRepo = getTaskRepository();

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  initialize(bot: Bot, appConfig: Config): void {
    initializeExecutor({ bot, config: appConfig });
  }

  start(): void {
    if (this.running) {
      console.log("Scheduler already running");
      return;
    }

    this.running = true;
    console.log(`Scheduler started (checkInterval: ${this.config.checkInterval}ms, maxConcurrent: ${this.config.maxConcurrent})`);

    this.intervalId = setInterval(() => {
      this.checkAndExecute();
    }, this.config.checkInterval);

    this.checkAndExecute();
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("Scheduler stopped");
  }

  private async checkAndExecute(): Promise<void> {
    if (!this.running) return;

    const availableSlots = this.config.maxConcurrent - this.activeTasks.size;
    if (availableSlots <= 0) return;

    const dueTasks = this.taskRepo.getDueTasks(new Date());
    const tasksToExecute = dueTasks.slice(0, availableSlots);

    for (const task of tasksToExecute) {
      this.executeTaskAsync(task);
    }
  }

  private async executeTaskAsync(task: ScheduledTask): Promise<void> {
    if (this.activeTasks.has(task.id)) return;

    this.activeTasks.add(task.id);
    this.taskRepo.updateStatus(task.id, "running");

    try {
      const result = await executeTask(task);

      if (result.success) {
        this.taskRepo.updateStatus(task.id, "completed");
        console.log(`Task ${task.id} completed successfully`);
      } else {
        this.taskRepo.updateStatus(task.id, "failed", result.error);
        console.error(`Task ${task.id} failed: ${result.error}`);
      }

      if (task.recurrence) {
        await this.scheduleNextRecurrence(task);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.taskRepo.updateStatus(task.id, "failed", errorMsg);
      console.error(`Task ${task.id} error: ${errorMsg}`);
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  private async scheduleNextRecurrence(task: ScheduledTask): Promise<void> {
    if (!task.recurrence) return;

    const nextTime = getNextOccurrence(task.recurrence, task.scheduledFor);
    
    if (!nextTime) {
      console.error(`Failed to calculate next occurrence for task ${task.id}`);
      return;
    }

    const newTask = this.taskRepo.create({
      type: task.type,
      payload: task.payload,
      scheduledFor: nextTime,
      recurrence: task.recurrence,
    });

    console.log(`Scheduled next occurrence of task ${task.id} as ${newTask.id} for ${nextTime.toISOString()}`);
  }

  getStats(): { running: boolean; activeTasks: number; pendingTasks: number } {
    return {
      running: this.running,
      activeTasks: this.activeTasks.size,
      pendingTasks: this.taskRepo.countByStatus("pending"),
    };
  }
}

let schedulerInstance: SchedulerService | null = null;

export function initializeScheduler(config: SchedulerConfig): SchedulerService {
  schedulerInstance = new SchedulerService(config);
  return schedulerInstance;
}

export function getScheduler(): SchedulerService | null {
  return schedulerInstance;
}
