import type { SkillRecord } from "../skills/mod.ts";
import { skillRecordToDefinition, executeSkill } from "../skills/mod.ts";
import { getAllSkills } from "../skills/repository.ts";
import type { MemoryRepository, MemoryCategory } from "../storage/memory/mod.ts";
import type { BraveSearchService } from "../brave/mod.ts";
import { getTaskRepository } from "../storage/scheduler/repository.ts";
import { validateCron, getNextOccurrence } from "../scheduler/cron.ts";
import type { TaskType, CreateTaskInput } from "../storage/scheduler/types.ts";

interface ScheduleTaskInput {
  type: string;
  message?: string;
  prompt?: string;
  skillName?: string;
  skillInput?: Record<string, unknown>;
  scheduledFor: string;
  recurrence?: string;
  storeInMemory?: boolean;
}

export interface Tool {
  type: "skill" | "builtin" | "mcp";
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolCall {
  tool: string;
  input: unknown;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output?: unknown;
  error?: string | undefined;
}

const BUILTIN_TOOLS: Tool[] = [
  {
    type: "builtin",
    name: "web_search",
    description: "Search the web for information. Use when you need to find current information, news, or research topics.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    type: "builtin",
    name: "get_time",
    description: "Get the current date and time.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "builtin",
    name: "calculate",
    description: "Perform mathematical calculations.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "The mathematical expression to evaluate" },
      },
      required: ["expression"],
    },
  },
  {
    type: "builtin",
    name: "remember",
    description: "Store information in memory for later recall.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember" },
        category: { 
          type: "string", 
          description: "Category for organization",
          enum: ["preference", "fact", "conversation", "task", "reminder", "note", "general"],
        },
      },
      required: ["content"],
    },
  },
  {
    type: "builtin",
    name: "recall",
    description: "Retrieve information from memory.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in memory" },
      },
      required: ["query"],
    },
  },
  {
    type: "builtin",
    name: "schedule_task",
    description: "Schedule a task to be executed at a future time. Can be one-time or recurring.",
    inputSchema: {
      type: "object",
      properties: {
        type: { 
          type: "string", 
          description: "Type of task: 'notification' (send message), 'skill' (execute skill), or 'agent' (self-prompt)",
          enum: ["notification", "skill", "agent"],
        },
        message: { type: "string", description: "Message to send (for notification type)" },
        prompt: { type: "string", description: "Prompt for agent to process (for agent type)" },
        skillName: { type: "string", description: "Name of skill to execute (for skill type)" },
        skillInput: { type: "object", description: "Input for the skill (for skill type)" },
        scheduledFor: { type: "string", description: "ISO datetime when to execute the task" },
        recurrence: { type: "string", description: "Cron expression for recurring tasks (optional, e.g., '0 9 * * *' for daily at 9am)" },
        storeInMemory: { type: "boolean", description: "Store task info in memory for recall (default: false)" },
      },
      required: ["type", "scheduledFor"],
    },
  },
  {
    type: "builtin",
    name: "list_scheduled_tasks",
    description: "List scheduled tasks, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { 
          type: "string", 
          description: "Filter by status: 'pending', 'completed', or 'all' (default: 'pending')",
          enum: ["pending", "completed", "all"],
        },
        limit: { type: "number", description: "Maximum number of tasks to return (default: 10)" },
      },
    },
  },
  {
    type: "builtin",
    name: "cancel_task",
    description: "Cancel a pending scheduled task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID of the task to cancel" },
      },
      required: ["taskId"],
    },
  },
];

export class ToolRegistry {
  private braveService: BraveSearchService | null = null;
  private memoryRepo: MemoryRepository | null = null;

  setBraveService(service: BraveSearchService | null): void {
    this.braveService = service;
  }

  setMemoryRepo(repo: MemoryRepository | null): void {
    this.memoryRepo = repo;
  }

  getAvailableTools(): Tool[] {
    const skillTools = this.getSkillTools();
    return [...BUILTIN_TOOLS, ...skillTools];
  }

  private getSkillTools(): Tool[] {
    const skills = getAllSkills(true);
    return skills.map((skill) => ({
      type: "skill" as const,
      name: `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`,
      description: skill.description,
      inputSchema: this.getSkillInputSchema(skill),
    }));
  }

  private getSkillInputSchema(skill: SkillRecord): Record<string, unknown> {
    try {
      const schema = JSON.parse(skill.schema);
      return schema.input || { type: "object", properties: {} };
    } catch {
      return { type: "object", properties: {} };
    }
  }

  async executeTool(call: ToolCall): Promise<ToolResult> {
    const { tool, input } = call;

    if (tool.startsWith("skill_")) {
      return await this.executeSkillTool(tool, input);
    }

    switch (tool) {
      case "web_search":
        return await this.executeWebSearch(input as { query: string });
      case "get_time":
        return this.executeGetTime();
      case "calculate":
        return this.executeCalculate(input as { expression: string });
      case "remember":
        return this.executeRemember(input as { content: string; category?: string });
      case "recall":
        return this.executeRecall(input as { query: string });
      case "schedule_task":
        return this.executeScheduleTask(input as ScheduleTaskInput);
      case "list_scheduled_tasks":
        return this.executeListTasks(input as { status?: string; limit?: number });
      case "cancel_task":
        return this.executeCancelTask(input as { taskId: string });
      default:
        return { tool, success: false, error: `Unknown tool: ${tool}` };
    }
  }

  private async executeSkillTool(tool: string, input: unknown): Promise<ToolResult> {
    const skillName = tool.replace("skill_", "").replace(/_/g, " ");
    const { getSkillByName } = await import("../skills/repository.ts");
    const skill = getSkillByName(skillName);

    if (!skill) {
      return { tool, success: false, error: `Skill not found: ${skillName}` };
    }

    const definition = skillRecordToDefinition(skill);
    const result = await executeSkill(definition, {
      input,
      env: {},
      timeout: 60000,
    });

    return {
      tool,
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  private async executeWebSearch(input: { query: string }): Promise<ToolResult> {
    if (!this.braveService) {
      return { tool: "web_search", success: false, error: "Web search not configured" };
    }

    try {
      const results = await this.braveService.search(input.query);
      return { tool: "web_search", success: true, output: results.results };
    } catch (error) {
      return { tool: "web_search", success: false, error: error instanceof Error ? error.message : "Search failed" };
    }
  }

  private executeGetTime(): ToolResult {
    const now = new Date();
    return {
      tool: "get_time",
      success: true,
      output: {
        iso: now.toISOString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }

  private executeCalculate(input: { expression: string }): ToolResult {
    try {
      const sanitized = input.expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return { tool: "calculate", success: true, output: result };
    } catch (error) {
      return { tool: "calculate", success: false, error: `Calculation error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }

  private executeRemember(input: { content: string; category?: string }): ToolResult {
    if (!this.memoryRepo) {
      return { tool: "remember", success: false, error: "Memory not available" };
    }

    try {
      const validCategories: MemoryCategory[] = ["preference", "fact", "conversation", "task", "reminder", "note", "general"];
      const category = input.category && validCategories.includes(input.category as MemoryCategory)
        ? input.category as MemoryCategory
        : "general";
      
      this.memoryRepo.create({ content: input.content, category });
      return { tool: "remember", success: true, output: "Memory stored successfully" };
    } catch (error) {
      return { tool: "remember", success: false, error: error instanceof Error ? error.message : "Failed to store memory" };
    }
  }

  private executeRecall(input: { query: string }): ToolResult {
    if (!this.memoryRepo) {
      return { tool: "recall", success: false, error: "Memory not available" };
    }

    try {
      const memories = this.memoryRepo.search({ query: input.query, limit: 5 });
      return { tool: "recall", success: true, output: memories };
    } catch (error) {
      return { tool: "recall", success: false, error: error instanceof Error ? error.message : "Failed to search memory" };
    }
  }

  private executeScheduleTask(input: ScheduleTaskInput): ToolResult {
    try {
      const scheduledFor = new Date(input.scheduledFor);
      if (isNaN(scheduledFor.getTime())) {
        return { tool: "schedule_task", success: false, error: "Invalid scheduledFor datetime" };
      }

      if (scheduledFor <= new Date()) {
        return { tool: "schedule_task", success: false, error: "scheduledFor must be in the future" };
      }

      if (input.recurrence) {
        const cronValidation = validateCron(input.recurrence);
        if (!cronValidation.valid) {
          return { tool: "schedule_task", success: false, error: `Invalid cron expression: ${cronValidation.error}` };
        }
      }

      let payload: CreateTaskInput["payload"];
      const taskType = input.type as TaskType;

      switch (taskType) {
        case "notification":
          if (!input.message) {
            return { tool: "schedule_task", success: false, error: "message is required for notification type" };
          }
          payload = { message: input.message };
          break;
        case "skill":
          if (!input.skillName) {
            return { tool: "schedule_task", success: false, error: "skillName is required for skill type" };
          }
          payload = { skillName: input.skillName, input: input.skillInput || {} };
          break;
        case "agent":
          if (!input.prompt) {
            return { tool: "schedule_task", success: false, error: "prompt is required for agent type" };
          }
          payload = { prompt: input.prompt };
          break;
        default:
          return { tool: "schedule_task", success: false, error: `Invalid task type: ${input.type}` };
      }

      const taskRepo = getTaskRepository();
      const createInput: CreateTaskInput = {
        type: taskType,
        payload,
        scheduledFor,
      };
      if (input.recurrence) {
        createInput.recurrence = input.recurrence;
      }
      const task = taskRepo.create(createInput);

      if (input.storeInMemory && this.memoryRepo) {
        const memoryContent = `Scheduled ${input.recurrence ? "recurring" : "one-time"} ${input.type} task for ${scheduledFor.toISOString()}${input.recurrence ? ` (cron: ${input.recurrence})` : ""}`;
        this.memoryRepo.create({ content: memoryContent, category: "task" });
      }

      const response = {
        taskId: task.id,
        type: task.type,
        scheduledFor: task.scheduledFor.toISOString(),
        recurrence: task.recurrence,
        nextOccurrence: input.recurrence ? getNextOccurrence(input.recurrence)?.toISOString() : null,
      };

      return { tool: "schedule_task", success: true, output: response };
    } catch (error) {
      return { tool: "schedule_task", success: false, error: error instanceof Error ? error.message : "Failed to schedule task" };
    }
  }

  private executeListTasks(input: { status?: string; limit?: number }): ToolResult {
    try {
      const taskRepo = getTaskRepository();
      const limit = input.limit || 10;
      let tasks;

      switch (input.status) {
        case "pending":
          tasks = taskRepo.getPending(limit);
          break;
        case "completed":
          tasks = taskRepo.getCompleted(limit);
          break;
        case "all":
        default:
          tasks = taskRepo.query({ limit });
      }

      const output = tasks.map((task) => ({
        id: task.id,
        type: task.type,
        scheduledFor: task.scheduledFor.toISOString(),
        recurrence: task.recurrence,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
      }));

      return { tool: "list_scheduled_tasks", success: true, output };
    } catch (error) {
      return { tool: "list_scheduled_tasks", success: false, error: error instanceof Error ? error.message : "Failed to list tasks" };
    }
  }

  private executeCancelTask(input: { taskId: string }): ToolResult {
    try {
      const taskRepo = getTaskRepository();
      const task = taskRepo.getById(input.taskId);

      if (!task) {
        return { tool: "cancel_task", success: false, error: "Task not found" };
      }

      if (task.status !== "pending") {
        return { tool: "cancel_task", success: false, error: `Cannot cancel task with status: ${task.status}` };
      }

      const deleted = taskRepo.delete(input.taskId);
      
      if (deleted) {
        return { tool: "cancel_task", success: true, output: { taskId: input.taskId, cancelled: true } };
      } else {
        return { tool: "cancel_task", success: false, error: "Failed to delete task" };
      }
    } catch (error) {
      return { tool: "cancel_task", success: false, error: error instanceof Error ? error.message : "Failed to cancel task" };
    }
  }
}

export const toolRegistry = new ToolRegistry();
