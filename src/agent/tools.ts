import type { SkillRecord } from "../skills/mod.ts";
import { executeSkill, skillRecordToDefinition } from "../skills/mod.ts";
import { getAllSkills } from "../skills/repository.ts";
import type { MemoryCategory, MemoryRepository } from "../storage/memory/mod.ts";
import type { BraveSearchService } from "../brave/mod.ts";
import type { CalendarService } from "../calendar/mod.ts";
import { getTaskRepository } from "../storage/scheduler/repository.ts";
import { getNextOccurrence, validateCron } from "../scheduler/cron.ts";
import type { CreateTaskInput, TaskType } from "../storage/scheduler/types.ts";
import { executeShellCommand, shellTool } from "../shell/mod.ts";
import type { ShellEnvironment, ShellToolInput } from "../shell/mod.ts";
import { BROWSER_TOOLS } from "../browser/tools.ts";
import type { BrowserService } from "../browser/mod.ts";
import type { VisionService } from "../vision/mod.ts";

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

export interface PhotoService {
  sendPhoto(chatId: number, imageData: string, caption?: string): Promise<boolean>;
  sendPhotoByUrl(chatId: number, url: string, caption?: string): Promise<boolean>;
}

const BUILTIN_TOOLS: Tool[] = [
  {
    type: "builtin",
    name: "web_search",
    description:
      "Search the web for information. Use when you need to find current information, news, or research topics.",
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
          description:
            "Type of task: 'notification' (send message), 'skill' (execute skill), or 'agent' (self-prompt)",
          enum: ["notification", "skill", "agent"],
        },
        message: { type: "string", description: "Message to send (for notification type)" },
        prompt: { type: "string", description: "Prompt for agent to process (for agent type)" },
        skillName: { type: "string", description: "Name of skill to execute (for skill type)" },
        skillInput: { type: "object", description: "Input for the skill (for skill type)" },
        scheduledFor: { type: "string", description: "ISO datetime when to execute the task" },
        recurrence: {
          type: "string",
          description:
            "Cron expression for recurring tasks (optional, e.g., '0 9 * * *' for daily at 9am)",
        },
        storeInMemory: {
          type: "boolean",
          description: "Store task info in memory for recall (default: false)",
        },
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
  {
    type: "builtin",
    name: "list_calendars",
    description: "List available calendars from the configured calendar service.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "builtin",
    name: "get_calendar_events",
    description:
      "Get calendar events within a date range. Defaults to next 7 days if no range specified.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date in ISO format (e.g., 2024-01-01T00:00:00)",
        },
        endDate: {
          type: "string",
          description: "End date in ISO format (e.g., 2024-01-07T23:59:59)",
        },
        days: { type: "number", description: "Number of days to fetch (default: 7)" },
        calendar: { type: "string", description: "Specific calendar to query (optional)" },
      },
    },
  },
  {
    type: "builtin",
    name: "create_calendar_event",
    description: "Create a new calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title/summary" },
        start: {
          type: "string",
          description: "Start time in ISO format (e.g., 2024-01-15T10:00:00)",
        },
        end: { type: "string", description: "End time in ISO format (e.g., 2024-01-15T11:00:00)" },
        description: { type: "string", description: "Event description (optional)" },
        location: { type: "string", description: "Event location (optional)" },
        timezone: {
          type: "string",
          description: "IANA timezone (e.g., Europe/Berlin, America/New_York)",
        },
        calendar: { type: "string", description: "Specific calendar to add event to (optional)" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    type: "builtin",
    name: "update_calendar_event",
    description:
      "Update an existing calendar event. Requires eventUrl and etag from a previous get_calendar_events call. Summary, start, and end are required.",
    inputSchema: {
      type: "object",
      properties: {
        eventUrl: {
          type: "string",
          description: "Event URL/ID from get_calendar_events (uid field)",
        },
        etag: {
          type: "string",
          description: "Event ETag from get_calendar_events (required for CalDAV updates)",
        },
        summary: { type: "string", description: "New event title/summary" },
        start: { type: "string", description: "New start time in ISO format" },
        end: { type: "string", description: "New end time in ISO format" },
        description: { type: "string", description: "New event description" },
        location: { type: "string", description: "New event location" },
        timezone: { type: "string", description: "IANA timezone" },
        calendar: { type: "string", description: "Calendar containing the event (optional)" },
      },
      required: ["eventUrl", "etag", "summary", "start", "end"],
    },
  },
  {
    type: "builtin",
    name: "delete_calendar_event",
    description:
      "Delete a calendar event. WARNING: This action is irreversible. Always confirm with the user before deleting events. Requires eventUrl and etag from a previous get_calendar_events call.",
    inputSchema: {
      type: "object",
      properties: {
        eventUrl: {
          type: "string",
          description: "Event URL/ID from get_calendar_events (uid field)",
        },
        etag: {
          type: "string",
          description: "Event ETag from get_calendar_events (required for CalDAV deletes)",
        },
        confirm: { type: "boolean", description: "Must be true to confirm deletion" },
      },
      required: ["eventUrl", "etag", "confirm"],
    },
  },
  shellTool,
  {
    type: "builtin",
    name: "analyze_image",
    description:
      "Analyze an image using vision AI. Can analyze images from base64 data or URLs. Use this to understand image content, extract text, describe scenes, or answer questions about images.",
    inputSchema: {
      type: "object",
      properties: {
        imageData: {
          type: "string",
          description: "Base64-encoded image data (without data URI prefix)",
        },
        imageUrl: {
          type: "string",
          description: "URL of the image to analyze (alternative to imageData)",
        },
        mimeType: {
          type: "string",
          description:
            "MIME type of the image (e.g., image/jpeg, image/png). Required if using imageData.",
        },
        prompt: {
          type: "string",
          description: "Specific question or instruction about the image",
        },
      },
    },
  },
  {
    type: "builtin",
    name: "send_photo",
    description:
      "Send a photo to the user. Use this to share images, screenshots, or visual content. The photo can be provided as base64 data or a URL.",
    inputSchema: {
      type: "object",
      properties: {
        imageData: {
          type: "string",
          description: "Base64-encoded image data (without data URI prefix)",
        },
        imageUrl: {
          type: "string",
          description: "URL of the image to send (alternative to imageData)",
        },
        caption: {
          type: "string",
          description: "Optional caption for the photo",
        },
      },
    },
  },
  ...BROWSER_TOOLS,
];

export class ToolRegistry {
  private braveService: BraveSearchService | null = null;
  private calendarService: CalendarService | null = null;
  private memoryRepo: MemoryRepository | null = null;
  private shellEnvironment: ShellEnvironment | null = null;
  private browserService: BrowserService | null = null;
  private visionService: VisionService | null = null;
  private photoService: PhotoService | null = null;
  private currentChatId: number | null = null;

  setBraveService(service: BraveSearchService | null): void {
    this.braveService = service;
  }

  setCalendarService(service: CalendarService | null): void {
    this.calendarService = service;
  }

  setShellEnvironment(env: ShellEnvironment | null): void {
    this.shellEnvironment = env;
  }

  setBrowserService(service: BrowserService | null): void {
    this.browserService = service;
  }

  setVisionService(service: VisionService | null): void {
    this.visionService = service;
  }

  setPhotoService(service: PhotoService | null): void {
    this.photoService = service;
  }

  setCurrentChatId(chatId: number | null): void {
    this.currentChatId = chatId;
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
    console.log(`[SKILL TOOLS] Registered ${skills.length} skills: ${skills.map(s => s.name).join(", ")}`);
    return skills.map((skill) => {
      const toolName = `skill_${skill.name.toLowerCase().replace(/\s+/g, "_")}`;
      console.log(`[SKILL TOOLS] Tool name: "${toolName}" for skill "${skill.name}"`);
      return {
        type: "skill" as const,
        name: toolName,
        description: skill.description,
        inputSchema: this.getSkillInputSchema(skill),
      };
    });
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
    console.log(`[EXECUTE TOOL] Called with tool="${tool}", starts with skill_: ${tool.startsWith("skill_")}`);

    let result: ToolResult;

    if (tool.startsWith("skill_")) {
      console.log(`[EXECUTE TOOL] Detected skill tool, calling executeSkillTool`);
      result = await this.executeSkillTool(tool, input);
    } else {
      console.log(`[EXECUTE TOOL] Not a skill tool, using switch statement`);
      switch (tool) {
        case "web_search":
          result = await this.executeWebSearch(input as { query: string });
          break;
        case "get_time":
          result = this.executeGetTime();
          break;
        case "calculate":
          result = this.executeCalculate(input as { expression: string });
          break;
        case "remember":
          result = this.executeRemember(input as { content: string; category?: string });
          break;
        case "recall":
          result = this.executeRecall(input as { query: string });
          break;
        case "schedule_task":
          result = this.executeScheduleTask(input as ScheduleTaskInput);
          break;
        case "list_scheduled_tasks":
          result = this.executeListTasks(input as { status?: string; limit?: number });
          break;
        case "cancel_task":
          result = this.executeCancelTask(input as { taskId: string });
          break;
        case "list_calendars":
          result = await this.executeListCalendars();
          break;
        case "get_calendar_events":
          result = await this.executeGetCalendarEvents(
            input as { startDate?: string; endDate?: string; days?: number; calendar?: string },
          );
          break;
        case "create_calendar_event":
          result = await this.executeCreateCalendarEvent(
            input as {
              summary: string;
              start: string;
              end: string;
              description?: string;
              location?: string;
              timezone?: string;
              calendar?: string;
            },
          );
          break;
        case "update_calendar_event":
          result = await this.executeUpdateCalendarEvent(
            input as {
              eventUrl: string;
              etag: string;
              summary: string;
              start: string;
              end: string;
              description?: string;
              location?: string;
              timezone?: string;
              calendar?: string;
            },
          );
          break;
        case "delete_calendar_event":
          result = await this.executeDeleteCalendarEvent(
            input as { eventUrl: string; etag: string; confirm: boolean },
          );
          break;
        case "shell":
          result = await this.executeShell(input as ShellToolInput);
          break;
        case "analyze_image":
          result = await this.executeAnalyzeImage(
            input as { imageData?: string; imageUrl?: string; mimeType?: string; prompt?: string },
          );
          break;
        case "send_photo":
          result = await this.executeSendPhoto(
            input as { imageData?: string; imageUrl?: string; caption?: string },
          );
          break;
        default:
          console.log(`[EXECUTE TOOL] Hit default case for tool="${tool}"`);
          if (tool.startsWith("browser_")) {
            result = await this.executeBrowserTool(tool, input as Record<string, unknown>);
          } else {
            console.log(`[EXECUTE TOOL] Unknown tool, returning error`);
            result = { tool, success: false, error: `Unknown tool: ${tool}` };
          }
      }
    }

    if (result.success) {
      console.log(`[TOOL RESULT] ${tool}: success`);
      if (result.output !== undefined) {
        const outputStr = typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output, null, 2);
        console.log(`[TOOL OUTPUT] ${outputStr}`);
      }
    } else {
      console.log(`[TOOL ERROR] ${tool}: ${result.error}`);
    }

    return result;
  }

  private async executeSkillTool(tool: string, input: unknown): Promise<ToolResult> {
    console.log(`[SKILL EXEC] Tool called: "${tool}"`);
    const skillName = tool.replace("skill_", "").replace(/_/g, " ");
    console.log(`[SKILL EXEC] Converted to skillName: "${skillName}"`);
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
      return {
        tool: "web_search",
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
      };
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
      return {
        tool: "calculate",
        success: false,
        error: `Calculation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  private executeRemember(input: { content: string; category?: string }): ToolResult {
    if (!this.memoryRepo) {
      return { tool: "remember", success: false, error: "Memory not available" };
    }

    try {
      const validCategories: MemoryCategory[] = [
        "preference",
        "fact",
        "conversation",
        "task",
        "reminder",
        "note",
        "general",
      ];
      const category = input.category && validCategories.includes(input.category as MemoryCategory)
        ? input.category as MemoryCategory
        : "general";

      this.memoryRepo.create({ content: input.content, category });
      return { tool: "remember", success: true, output: "Memory stored successfully" };
    } catch (error) {
      return {
        tool: "remember",
        success: false,
        error: error instanceof Error ? error.message : "Failed to store memory",
      };
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
      return {
        tool: "recall",
        success: false,
        error: error instanceof Error ? error.message : "Failed to search memory",
      };
    }
  }

  private async executeShell(input: ShellToolInput): Promise<ToolResult> {
    if (!this.shellEnvironment) {
      return { tool: "shell", success: false, error: "Shell environment not configured" };
    }

    try {
      const result = await executeShellCommand(this.shellEnvironment, input);
      return {
        tool: "shell",
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        tool: "shell",
        success: false,
        error: error instanceof Error ? error.message : "Shell execution failed",
      };
    }
  }

  private async executeAnalyzeImage(
    input: { imageData?: string; imageUrl?: string; mimeType?: string; prompt?: string },
  ): Promise<ToolResult> {
    if (!this.visionService) {
      return { tool: "analyze_image", success: false, error: "Vision service not configured" };
    }

    try {
      let imageData = input.imageData;
      let mimeType = input.mimeType ?? "image/jpeg";

      if (input.imageUrl && !imageData) {
        const response = await fetch(input.imageUrl);
        if (!response.ok) {
          return {
            tool: "analyze_image",
            success: false,
            error: `Failed to fetch image: ${response.status}`,
          };
        }
        const buffer = await response.arrayBuffer();
        imageData = btoa(String.fromCharCode(...new Uint8Array(buffer)));

        const contentType = response.headers.get("content-type");
        if (contentType?.startsWith("image/")) {
          mimeType = contentType;
        }
      }

      if (!imageData) {
        return {
          tool: "analyze_image",
          success: false,
          error: "Either imageData or imageUrl must be provided",
        };
      }

      const analyzeInput: { imageData: string; mimeType: string; prompt?: string } = {
        imageData,
        mimeType,
      };
      if (input.prompt !== undefined) {
        analyzeInput.prompt = input.prompt;
      }

      const analysis = await this.visionService.analyzeImage(analyzeInput);

      return {
        tool: "analyze_image",
        success: true,
        output: { analysis },
      };
    } catch (error) {
      return {
        tool: "analyze_image",
        success: false,
        error: error instanceof Error ? error.message : "Image analysis failed",
      };
    }
  }

  private async executeSendPhoto(
    input: { imageData?: string; imageUrl?: string; caption?: string },
  ): Promise<ToolResult> {
    if (!this.photoService) {
      return { tool: "send_photo", success: false, error: "Photo service not configured" };
    }

    if (!this.currentChatId) {
      return { tool: "send_photo", success: false, error: "No active chat" };
    }

    try {
      let success: boolean;

      if (input.imageUrl) {
        success = await this.photoService.sendPhotoByUrl(
          this.currentChatId,
          input.imageUrl,
          input.caption,
        );
      } else if (input.imageData) {
        success = await this.photoService.sendPhoto(
          this.currentChatId,
          input.imageData,
          input.caption,
        );
      } else {
        return {
          tool: "send_photo",
          success: false,
          error: "Either imageData or imageUrl must be provided",
        };
      }

      return {
        tool: "send_photo",
        success,
        output: success ? { sent: true } : { sent: false, error: "Failed to send photo" },
      };
    } catch (error) {
      return {
        tool: "send_photo",
        success: false,
        error: error instanceof Error ? error.message : "Failed to send photo",
      };
    }
  }

  private async executeBrowserTool(
    tool: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.browserService) {
      return { tool, success: false, error: "Browser service not configured" };
    }

    if (!this.browserService.isReady()) {
      return { tool, success: false, error: "Browser not connected" };
    }

    try {
      const result = await this.browserService.executor.execute(tool, input);
      return {
        tool,
        success: result.success,
        output: result.output,
        error: result.error,
      };
    } catch (error) {
      return {
        tool,
        success: false,
        error: error instanceof Error ? error.message : "Browser tool execution failed",
      };
    }
  }

  private executeScheduleTask(input: ScheduleTaskInput): ToolResult {
    try {
      const scheduledFor = new Date(input.scheduledFor);
      if (isNaN(scheduledFor.getTime())) {
        return { tool: "schedule_task", success: false, error: "Invalid scheduledFor datetime" };
      }

      if (scheduledFor <= new Date()) {
        return {
          tool: "schedule_task",
          success: false,
          error: "scheduledFor must be in the future",
        };
      }

      if (input.recurrence) {
        const cronValidation = validateCron(input.recurrence);
        if (!cronValidation.valid) {
          return {
            tool: "schedule_task",
            success: false,
            error: `Invalid cron expression: ${cronValidation.error}`,
          };
        }
      }

      let payload: CreateTaskInput["payload"];
      const taskType = input.type as TaskType;

      switch (taskType) {
        case "notification":
          if (!input.message) {
            return {
              tool: "schedule_task",
              success: false,
              error: "message is required for notification type",
            };
          }
          payload = { message: input.message };
          break;
        case "skill":
          if (!input.skillName) {
            return {
              tool: "schedule_task",
              success: false,
              error: "skillName is required for skill type",
            };
          }
          payload = { skillName: input.skillName, input: input.skillInput || {} };
          break;
        case "agent":
          if (!input.prompt) {
            return {
              tool: "schedule_task",
              success: false,
              error: "prompt is required for agent type",
            };
          }
          payload = { prompt: input.prompt };
          break;
        default:
          return {
            tool: "schedule_task",
            success: false,
            error: `Invalid task type: ${input.type}`,
          };
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
        const memoryContent = `Scheduled ${
          input.recurrence ? "recurring" : "one-time"
        } ${input.type} task for ${scheduledFor.toISOString()}${
          input.recurrence ? ` (cron: ${input.recurrence})` : ""
        }`;
        this.memoryRepo.create({ content: memoryContent, category: "task" });
      }

      const response = {
        taskId: task.id,
        type: task.type,
        scheduledFor: task.scheduledFor.toISOString(),
        recurrence: task.recurrence,
        nextOccurrence: input.recurrence
          ? getNextOccurrence(input.recurrence)?.toISOString()
          : null,
      };

      return { tool: "schedule_task", success: true, output: response };
    } catch (error) {
      return {
        tool: "schedule_task",
        success: false,
        error: error instanceof Error ? error.message : "Failed to schedule task",
      };
    }
  }

  private executeListTasks(input: { status?: string; limit?: number }): ToolResult {
    try {
      const taskRepo = getTaskRepository();
      const limit = input.limit || 10;
      let tasks: ReturnType<typeof taskRepo.query>;

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
      return {
        tool: "list_scheduled_tasks",
        success: false,
        error: error instanceof Error ? error.message : "Failed to list tasks",
      };
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
        return {
          tool: "cancel_task",
          success: false,
          error: `Cannot cancel task with status: ${task.status}`,
        };
      }

      const deleted = taskRepo.delete(input.taskId);

      if (deleted) {
        return {
          tool: "cancel_task",
          success: true,
          output: { taskId: input.taskId, cancelled: true },
        };
      } else {
        return { tool: "cancel_task", success: false, error: "Failed to delete task" };
      }
    } catch (error) {
      return {
        tool: "cancel_task",
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel task",
      };
    }
  }

  private async executeListCalendars(): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "list_calendars", success: false, error: "Calendar service not configured" };
    }

    try {
      const calendars = await this.calendarService.listCalendars();
      return { tool: "list_calendars", success: true, output: calendars };
    } catch (error) {
      return {
        tool: "list_calendars",
        success: false,
        error: error instanceof Error ? error.message : "Failed to list calendars",
      };
    }
  }

  private async executeGetCalendarEvents(
    input: { startDate?: string; endDate?: string; days?: number; calendar?: string },
  ): Promise<ToolResult> {
    if (!this.calendarService) {
      return {
        tool: "get_calendar_events",
        success: false,
        error: "Calendar service not configured",
      };
    }

    try {
      const options: { startDate?: string; endDate?: string; days?: number; calendar?: string } =
        {};
      if (input.startDate !== undefined) options.startDate = input.startDate;
      if (input.endDate !== undefined) options.endDate = input.endDate;
      if (input.days !== undefined) options.days = input.days;
      if (input.calendar !== undefined) options.calendar = input.calendar;
      const events = await this.calendarService.getEvents(options);
      return { tool: "get_calendar_events", success: true, output: events };
    } catch (error) {
      return {
        tool: "get_calendar_events",
        success: false,
        error: error instanceof Error ? error.message : "Failed to get events",
      };
    }
  }

  private async executeCreateCalendarEvent(
    input: {
      summary: string;
      start: string;
      end: string;
      description?: string;
      location?: string;
      timezone?: string;
      calendar?: string;
    },
  ): Promise<ToolResult> {
    if (!this.calendarService) {
      return {
        tool: "create_calendar_event",
        success: false,
        error: "Calendar service not configured",
      };
    }

    try {
      const eventInput: {
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        timezone?: string;
      } = {
        summary: input.summary,
        start: input.start,
        end: input.end,
      };
      if (input.description !== undefined) eventInput.description = input.description;
      if (input.location !== undefined) eventInput.location = input.location;
      if (input.timezone !== undefined) eventInput.timezone = input.timezone;
      const event = await this.calendarService.createEvent(eventInput, input.calendar);
      return { tool: "create_calendar_event", success: true, output: event };
    } catch (error) {
      return {
        tool: "create_calendar_event",
        success: false,
        error: error instanceof Error ? error.message : "Failed to create event",
      };
    }
  }

  private async executeUpdateCalendarEvent(
    input: {
      eventUrl: string;
      etag: string;
      summary: string;
      start: string;
      end: string;
      description?: string;
      location?: string;
      timezone?: string;
      calendar?: string;
    },
  ): Promise<ToolResult> {
    if (!this.calendarService) {
      return {
        tool: "update_calendar_event",
        success: false,
        error: "Calendar service not configured",
      };
    }

    try {
      const eventInput: {
        eventUrl: string;
        etag: string;
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        timezone?: string;
      } = {
        eventUrl: input.eventUrl,
        etag: input.etag,
        summary: input.summary,
        start: input.start,
        end: input.end,
      };
      if (input.description !== undefined) eventInput.description = input.description;
      if (input.location !== undefined) eventInput.location = input.location;
      if (input.timezone !== undefined) eventInput.timezone = input.timezone;
      const event = await this.calendarService.updateEvent(eventInput, input.calendar);
      return { tool: "update_calendar_event", success: true, output: event };
    } catch (error) {
      return {
        tool: "update_calendar_event",
        success: false,
        error: error instanceof Error ? error.message : "Failed to update event",
      };
    }
  }

  private async executeDeleteCalendarEvent(
    input: { eventUrl: string; etag: string; confirm: boolean },
  ): Promise<ToolResult> {
    if (!this.calendarService) {
      return {
        tool: "delete_calendar_event",
        success: false,
        error: "Calendar service not configured",
      };
    }

    if (!input.confirm) {
      return {
        tool: "delete_calendar_event",
        success: false,
        error: "Deletion not confirmed. Set confirm=true to proceed with deletion.",
      };
    }

    try {
      await this.calendarService.deleteEvent(input.eventUrl, input.etag);
      return {
        tool: "delete_calendar_event",
        success: true,
        output: { eventUrl: input.eventUrl, deleted: true },
      };
    } catch (error) {
      return {
        tool: "delete_calendar_event",
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete event",
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
