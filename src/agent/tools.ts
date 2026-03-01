import type { SkillRecord } from "../skills/mod.ts";
import { skillRecordToDefinition, executeSkill } from "../skills/mod.ts";
import { getAllSkills } from "../skills/repository.ts";
import type { MemoryRepository, MemoryCategory } from "../storage/memory/mod.ts";
import type { BraveSearchService } from "../brave/mod.ts";
import type { CalendarService } from "../calendar/mod.ts";
import type { SubsonicService } from "../subsonic/mod.ts";
import type { LastfmService } from "../lastfm/mod.ts";
import { getMoodTags, calculateTagMatchScore } from "../lastfm/mod.ts";
import type { LastfmTag } from "../lastfm/mod.ts";
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
    description: "Get calendar events within a date range. Defaults to next 7 days if no range specified.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in ISO format (e.g., 2024-01-01T00:00:00)" },
        endDate: { type: "string", description: "End date in ISO format (e.g., 2024-01-07T23:59:59)" },
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
        start: { type: "string", description: "Start time in ISO format (e.g., 2024-01-15T10:00:00)" },
        end: { type: "string", description: "End time in ISO format (e.g., 2024-01-15T11:00:00)" },
        description: { type: "string", description: "Event description (optional)" },
        location: { type: "string", description: "Event location (optional)" },
        timezone: { type: "string", description: "IANA timezone (e.g., Europe/Berlin, America/New_York)" },
        calendar: { type: "string", description: "Specific calendar to add event to (optional)" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    type: "builtin",
    name: "update_calendar_event",
    description: "Update an existing calendar event. Requires eventUrl and etag from a previous get_calendar_events call. Summary, start, and end are required.",
    inputSchema: {
      type: "object",
      properties: {
        eventUrl: { type: "string", description: "Event URL/ID from get_calendar_events (uid field)" },
        etag: { type: "string", description: "Event ETag from get_calendar_events (required for CalDAV updates)" },
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
    description: "Delete a calendar event. WARNING: This action is irreversible. Always confirm with the user before deleting events. Requires eventUrl and etag from a previous get_calendar_events call.",
    inputSchema: {
      type: "object",
      properties: {
        eventUrl: { type: "string", description: "Event URL/ID from get_calendar_events (uid field)" },
        etag: { type: "string", description: "Event ETag from get_calendar_events (required for CalDAV deletes)" },
        confirm: { type: "boolean", description: "Must be true to confirm deletion" },
      },
      required: ["eventUrl", "etag", "confirm"],
    },
  },
  {
    type: "builtin",
    name: "search_music",
    description: "Search for music in the Subsonic library. Returns songs, artists, and albums matching the query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        songCount: { type: "number", description: "Maximum number of songs to return (default: 20)" },
        albumCount: { type: "number", description: "Maximum number of albums to return (default: 20)" },
        artistCount: { type: "number", description: "Maximum number of artists to return (default: 20)" },
      },
      required: ["query"],
    },
  },
  {
    type: "builtin",
    name: "get_music_library_info",
    description: "Get information about the music library including genres, artists, and starred items.",
    inputSchema: {
      type: "object",
      properties: {
        type: { 
          type: "string", 
          description: "Type of info to retrieve: 'genres', 'artists', 'starred', or 'all'",
          enum: ["genres", "artists", "starred", "all"],
        },
      },
    },
  },
  {
    type: "builtin",
    name: "list_playlists",
    description: "List all playlists from Subsonic, optionally including song details.",
    inputSchema: {
      type: "object",
      properties: {
        includeSongs: { type: "boolean", description: "Include songs in each playlist (default: false)" },
      },
    },
  },
  {
    type: "builtin",
    name: "manage_playlist",
    description: "Create, update, or delete a playlist. For creating, provide name and optionally songIds. For updating, provide playlistId with fields to update. For deleting, provide playlistId and confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          description: "Action to perform: 'create', 'update', or 'delete'",
          enum: ["create", "update", "delete"],
        },
        playlistId: { type: "string", description: "Playlist ID (required for update/delete)" },
        name: { type: "string", description: "Playlist name (required for create, optional for update)" },
        songIds: { type: "array", items: { type: "string" }, description: "Song IDs to add (for create)" },
        songIdsToAdd: { type: "array", items: { type: "string" }, description: "Song IDs to add (for update)" },
        comment: { type: "string", description: "Playlist comment/description" },
        isPublic: { type: "boolean", description: "Make playlist public" },
        confirm: { type: "boolean", description: "Must be true for delete action" },
      },
      required: ["action"],
    },
  },
  {
    type: "builtin",
    name: "create_smart_playlist",
    description: "Create an intelligent playlist based on mood, genre, artist, or other criteria. Uses Last.fm for mood matching and similar song recommendations when available.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Playlist name" },
        mood: { type: "string", description: "Mood/theme (e.g., 'energetic', 'chill', 'melancholic', 'happy', 'focus', 'romantic')" },
        genre: { type: "string", description: "Genre filter (e.g., 'Rock', 'Electronic', 'Jazz')" },
        artist: { type: "string", description: "Focus on songs by this artist" },
        album: { type: "string", description: "Focus on songs from this album" },
        fromYear: { type: "number", description: "Minimum year for songs" },
        toYear: { type: "number", description: "Maximum year for songs" },
        songCount: { type: "number", description: "Number of songs to include (default: 20)" },
        includeUserFavorites: { type: "boolean", description: "Prioritize user's loved/top tracks from Last.fm" },
        discoverNew: { type: "boolean", description: "Include similar artists for discovery" },
        minTagMatch: { type: "number", description: "Minimum tag match score 0-100 for mood matching (default: 30)" },
      },
      required: ["name"],
    },
  },
];

export class ToolRegistry {
  private braveService: BraveSearchService | null = null;
  private calendarService: CalendarService | null = null;
  private memoryRepo: MemoryRepository | null = null;
  private subsonicService: SubsonicService | null = null;
  private lastfmService: LastfmService | null = null;

  setBraveService(service: BraveSearchService | null): void {
    this.braveService = service;
  }

  setCalendarService(service: CalendarService | null): void {
    this.calendarService = service;
  }

  setMemoryRepo(repo: MemoryRepository | null): void {
    this.memoryRepo = repo;
  }

  setSubsonicService(service: SubsonicService | null): void {
    this.subsonicService = service;
  }

  setLastfmService(service: LastfmService | null): void {
    this.lastfmService = service;
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
      case "list_calendars":
        return await this.executeListCalendars();
      case "get_calendar_events":
        return await this.executeGetCalendarEvents(input as { startDate?: string; endDate?: string; days?: number; calendar?: string });
      case "create_calendar_event":
        return await this.executeCreateCalendarEvent(input as { summary: string; start: string; end: string; description?: string; location?: string; timezone?: string; calendar?: string });
      case "update_calendar_event":
        return await this.executeUpdateCalendarEvent(input as { eventUrl: string; etag: string; summary: string; start: string; end: string; description?: string; location?: string; timezone?: string; calendar?: string });
      case "delete_calendar_event":
        return await this.executeDeleteCalendarEvent(input as { eventUrl: string; etag: string; confirm: boolean });
      case "search_music":
        return await this.executeSearchMusic(input as { query: string; songCount?: number; albumCount?: number; artistCount?: number });
      case "get_music_library_info":
        return await this.executeGetMusicLibraryInfo(input as { type?: string });
      case "list_playlists":
        return await this.executeListPlaylists(input as { includeSongs?: boolean });
      case "manage_playlist":
        return await this.executeManagePlaylist(input as { action: string; playlistId?: string; name?: string; songIds?: string[]; songIdsToAdd?: string[]; comment?: string; isPublic?: boolean; confirm?: boolean });
      case "create_smart_playlist":
        return await this.executeCreateSmartPlaylist(input as { name: string; mood?: string; genre?: string; artist?: string; album?: string; fromYear?: number; toYear?: number; songCount?: number; includeUserFavorites?: boolean; discoverNew?: boolean; minTagMatch?: number });
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

  private async executeListCalendars(): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "list_calendars", success: false, error: "Calendar service not configured" };
    }

    try {
      const calendars = await this.calendarService.listCalendars();
      return { tool: "list_calendars", success: true, output: calendars };
    } catch (error) {
      return { tool: "list_calendars", success: false, error: error instanceof Error ? error.message : "Failed to list calendars" };
    }
  }

  private async executeGetCalendarEvents(input: { startDate?: string; endDate?: string; days?: number; calendar?: string }): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "get_calendar_events", success: false, error: "Calendar service not configured" };
    }

    try {
      const options: { startDate?: string; endDate?: string; days?: number; calendar?: string } = {};
      if (input.startDate !== undefined) options.startDate = input.startDate;
      if (input.endDate !== undefined) options.endDate = input.endDate;
      if (input.days !== undefined) options.days = input.days;
      if (input.calendar !== undefined) options.calendar = input.calendar;
      const events = await this.calendarService.getEvents(options);
      return { tool: "get_calendar_events", success: true, output: events };
    } catch (error) {
      return { tool: "get_calendar_events", success: false, error: error instanceof Error ? error.message : "Failed to get events" };
    }
  }

  private async executeCreateCalendarEvent(input: { summary: string; start: string; end: string; description?: string; location?: string; timezone?: string; calendar?: string }): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "create_calendar_event", success: false, error: "Calendar service not configured" };
    }

    try {
      const eventInput: { summary: string; start: string; end: string; description?: string; location?: string; timezone?: string } = {
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
      return { tool: "create_calendar_event", success: false, error: error instanceof Error ? error.message : "Failed to create event" };
    }
  }

  private async executeUpdateCalendarEvent(input: { eventUrl: string; etag: string; summary: string; start: string; end: string; description?: string; location?: string; timezone?: string; calendar?: string }): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "update_calendar_event", success: false, error: "Calendar service not configured" };
    }

    try {
      const eventInput: { eventUrl: string; etag: string; summary: string; start: string; end: string; description?: string; location?: string; timezone?: string } = {
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
      return { tool: "update_calendar_event", success: false, error: error instanceof Error ? error.message : "Failed to update event" };
    }
  }

  private async executeDeleteCalendarEvent(input: { eventUrl: string; etag: string; confirm: boolean }): Promise<ToolResult> {
    if (!this.calendarService) {
      return { tool: "delete_calendar_event", success: false, error: "Calendar service not configured" };
    }

    if (!input.confirm) {
      return { tool: "delete_calendar_event", success: false, error: "Deletion not confirmed. Set confirm=true to proceed with deletion." };
    }

    try {
      await this.calendarService.deleteEvent(input.eventUrl, input.etag);
      return { tool: "delete_calendar_event", success: true, output: { eventUrl: input.eventUrl, deleted: true } };
    } catch (error) {
      return { tool: "delete_calendar_event", success: false, error: error instanceof Error ? error.message : "Failed to delete event" };
    }
  }

  private async executeSearchMusic(input: { query: string; songCount?: number; albumCount?: number; artistCount?: number }): Promise<ToolResult> {
    if (!this.subsonicService) {
      return { tool: "search_music", success: false, error: "Music service not configured" };
    }

    try {
      const results = await this.subsonicService.search3({
        query: input.query,
        songCount: input.songCount ?? 20,
        albumCount: input.albumCount ?? 20,
        artistCount: input.artistCount ?? 20,
      });

      return { tool: "search_music", success: true, output: results };
    } catch (error) {
      return { tool: "search_music", success: false, error: error instanceof Error ? error.message : "Search failed" };
    }
  }

  private async executeGetMusicLibraryInfo(input: { type?: string }): Promise<ToolResult> {
    if (!this.subsonicService) {
      return { tool: "get_music_library_info", success: false, error: "Music service not configured" };
    }

    try {
      const type = input.type ?? "all";
      const output: Record<string, unknown> = {};

      if (type === "genres" || type === "all") {
        output.genres = await this.subsonicService.getGenres();
      }
      if (type === "artists" || type === "all") {
        output.artists = await this.subsonicService.getArtists();
      }
      if (type === "starred" || type === "all") {
        output.starred = await this.subsonicService.getStarred();
      }

      return { tool: "get_music_library_info", success: true, output };
    } catch (error) {
      return { tool: "get_music_library_info", success: false, error: error instanceof Error ? error.message : "Failed to get library info" };
    }
  }

  private async executeListPlaylists(input: { includeSongs?: boolean }): Promise<ToolResult> {
    if (!this.subsonicService) {
      return { tool: "list_playlists", success: false, error: "Music service not configured" };
    }

    try {
      const playlists = await this.subsonicService.getPlaylists();

      if (input.includeSongs) {
        const playlistsWithSongs = await Promise.all(
          playlists.map(async (playlist) => {
            try {
              const fullPlaylist = await this.subsonicService!.getPlaylist(playlist.id);
              return { ...playlist, songs: fullPlaylist.songs };
            } catch {
              return { ...playlist, songs: [] };
            }
          })
        );
        return { tool: "list_playlists", success: true, output: playlistsWithSongs };
      }

      return { tool: "list_playlists", success: true, output: playlists };
    } catch (error) {
      return { tool: "list_playlists", success: false, error: error instanceof Error ? error.message : "Failed to list playlists" };
    }
  }

  private async executeManagePlaylist(input: { 
    action: string; 
    playlistId?: string; 
    name?: string; 
    songIds?: string[]; 
    songIdsToAdd?: string[];
    comment?: string; 
    isPublic?: boolean; 
    confirm?: boolean 
  }): Promise<ToolResult> {
    if (!this.subsonicService) {
      return { tool: "manage_playlist", success: false, error: "Music service not configured" };
    }

    try {
      switch (input.action) {
        case "create": {
          if (!input.name) {
            return { tool: "manage_playlist", success: false, error: "Playlist name is required for create action" };
          }
          const playlist = await this.subsonicService.createPlaylist(input.name, input.songIds ?? []);
          return { tool: "manage_playlist", success: true, output: { action: "created", playlist } };
        }
        case "update": {
          if (!input.playlistId) {
            return { tool: "manage_playlist", success: false, error: "Playlist ID is required for update action" };
          }
          await this.subsonicService.updatePlaylist(input.playlistId, {
            name: input.name,
            comment: input.comment,
            public: input.isPublic,
            songIdsToAdd: input.songIdsToAdd,
          });
          return { tool: "manage_playlist", success: true, output: { action: "updated", playlistId: input.playlistId } };
        }
        case "delete": {
          if (!input.playlistId) {
            return { tool: "manage_playlist", success: false, error: "Playlist ID is required for delete action" };
          }
          if (!input.confirm) {
            return { tool: "manage_playlist", success: false, error: "Deletion not confirmed. Set confirm=true to proceed." };
          }
          await this.subsonicService.deletePlaylist(input.playlistId);
          return { tool: "manage_playlist", success: true, output: { action: "deleted", playlistId: input.playlistId } };
        }
        default:
          return { tool: "manage_playlist", success: false, error: `Unknown action: ${input.action}` };
      }
    } catch (error) {
      return { tool: "manage_playlist", success: false, error: error instanceof Error ? error.message : "Playlist operation failed" };
    }
  }

  private async executeCreateSmartPlaylist(input: {
    name: string;
    mood?: string;
    genre?: string;
    artist?: string;
    album?: string;
    fromYear?: number;
    toYear?: number;
    songCount?: number;
    includeUserFavorites?: boolean;
    discoverNew?: boolean;
    minTagMatch?: number;
  }): Promise<ToolResult> {
    if (!this.subsonicService) {
      return { tool: "create_smart_playlist", success: false, error: "Music service not configured" };
    }

    try {
      const targetSongCount = input.songCount ?? 20;
      const minTagMatch = input.minTagMatch ?? 30;
      
      interface CandidateSong {
        id: string;
        title: string;
        artist: string;
        album: string | undefined;
        year: number | undefined;
        score: number;
        tagMatchScore?: number;
      }
      
      const candidateSongs: Map<string, CandidateSong> = new Map();

      const targetMoodTags = input.mood ? getMoodTags(input.mood) : [];

      if (input.mood && this.lastfmService) {
        const moodTags = [input.mood.toLowerCase(), ...targetMoodTags.slice(0, 2)];
        
        for (const tag of moodTags.slice(0, 3)) {
          try {
            const lastfmTracks = await this.lastfmService.getTopTracksForTag(tag, 50);
            
            for (const track of lastfmTracks) {
              const searchResults = await this.subsonicService!.search3({
                query: `${track.artist} ${track.name}`,
                songCount: 3,
                albumCount: 0,
                artistCount: 0,
              });
              
              for (const song of searchResults.song ?? []) {
                if (!candidateSongs.has(song.id)) {
                  candidateSongs.set(song.id, {
                    id: song.id,
                    title: song.title,
                    artist: song.artist ?? "",
                    album: song.album,
                    year: song.year,
                    score: 50,
                  });
                }
              }
            }
          } catch {
            // Continue with other methods if last.fm fails
          }
        }
      }

      if (input.artist) {
        const searchResults = await this.subsonicService.search3({
          query: input.artist,
          songCount: 50,
          albumCount: 0,
          artistCount: 5,
        });

        for (const song of searchResults.song ?? []) {
          const artistMatch = song.artist?.toLowerCase().includes(input.artist.toLowerCase());
          const score = artistMatch ? 80 : 40;
          
          if (!candidateSongs.has(song.id)) {
            candidateSongs.set(song.id, {
              id: song.id,
              title: song.title,
              artist: song.artist ?? "",
              album: song.album,
              year: song.year,
              score,
            });
          } else {
            const existing = candidateSongs.get(song.id)!;
            existing.score = Math.max(existing.score, score);
          }
        }

        if (this.lastfmService && input.discoverNew) {
          try {
            const similarArtists = await this.lastfmService.getSimilarArtists(input.artist, 5);
            
            for (const simArtist of similarArtists.slice(0, 3)) {
              const topTracks = await this.lastfmService.getArtistTopTracks(simArtist.name, 10);
              
              for (const track of topTracks) {
                const results = await this.subsonicService!.search3({
                  query: `${track.artist} ${track.name}`,
                  songCount: 2,
                  albumCount: 0,
                  artistCount: 0,
                });
                
                for (const song of results.song ?? []) {
                  if (!candidateSongs.has(song.id)) {
                    candidateSongs.set(song.id, {
                      id: song.id,
                      title: song.title,
                      artist: song.artist ?? "",
                      album: song.album,
                      year: song.year,
                      score: 60,
                    });
                  }
                }
              }
            }
          } catch {
            // Continue without similar artists
          }
        }
      }

      if (input.genre) {
        try {
          const songs = await this.subsonicService.getSongsByGenre(input.genre, 50);
          
          for (const song of songs) {
            if (!candidateSongs.has(song.id)) {
              candidateSongs.set(song.id, {
                id: song.id,
                title: song.title,
                artist: song.artist ?? "",
                album: song.album,
                year: song.year,
                score: 70,
              });
            } else {
              const existing = candidateSongs.get(song.id)!;
              existing.score = Math.max(existing.score, 70);
            }
          }
        } catch {
          // Continue without genre songs
        }
      }

      if (input.includeUserFavorites && this.lastfmService) {
        try {
          const lovedTracks = await this.lastfmService.getUserLovedTracks(30);
          
          for (const track of lovedTracks) {
            const results = await this.subsonicService!.search3({
              query: `${track.artist} ${track.name}`,
              songCount: 2,
              albumCount: 0,
              artistCount: 0,
            });
            
            for (const song of results.song ?? []) {
              if (!candidateSongs.has(song.id)) {
                candidateSongs.set(song.id, {
                  id: song.id,
                  title: song.title,
                  artist: song.artist ?? "",
                  album: song.album,
                  year: song.year,
                  score: 90,
                });
              } else {
                const existing = candidateSongs.get(song.id)!;
                existing.score = Math.max(existing.score, 90);
              }
            }
          }
        } catch {
          // Continue without user favorites
        }
      }

      if (candidateSongs.size < targetSongCount) {
        const randomSongs = await this.subsonicService.getRandomSongs({
          size: targetSongCount,
          genre: input.genre,
          fromYear: input.fromYear,
          toYear: input.toYear,
        });
        
        for (const song of randomSongs) {
          if (!candidateSongs.has(song.id)) {
            candidateSongs.set(song.id, {
              id: song.id,
              title: song.title,
              artist: song.artist ?? "",
              album: song.album,
              year: song.year,
              score: 30,
            });
          }
        }
      }

      let filteredSongs = Array.from(candidateSongs.values());

      if (input.fromYear !== undefined) {
        filteredSongs = filteredSongs.filter((s) => s.year === undefined || s.year >= input.fromYear!);
      }
      if (input.toYear !== undefined) {
        filteredSongs = filteredSongs.filter((s) => s.year === undefined || s.year <= input.toYear!);
      }

      if (input.mood && this.lastfmService && targetMoodTags.length > 0) {
        const songsWithTags = await Promise.all(
          filteredSongs.map(async (song) => {
            try {
              const tags = await this.lastfmService!.getTrackTags(song.artist, song.title);
              const tagMatchScore = calculateTagMatchScore(tags as LastfmTag[], targetMoodTags);
              return { ...song, tagMatchScore };
            } catch {
              return { ...song, tagMatchScore: 0 };
            }
          })
        );

        filteredSongs = songsWithTags
          .filter((s) => s.tagMatchScore >= minTagMatch)
          .map((s) => ({ ...s, score: s.score + s.tagMatchScore }));
      }

      filteredSongs.sort((a, b) => b.score - a.score);

      const artistCount: Map<string, number> = new Map();
      const selectedSongs: typeof filteredSongs = [];

      for (const song of filteredSongs) {
        if (selectedSongs.length >= targetSongCount) break;
        
        const artistKey = song.artist.toLowerCase();
        const count = artistCount.get(artistKey) ?? 0;
        
        if (count < Math.ceil(targetSongCount / 5) || selectedSongs.length > targetSongCount * 0.8) {
          selectedSongs.push(song);
          artistCount.set(artistKey, count + 1);
        }
      }

      const songIds = selectedSongs.map((s) => s.id);
      const playlist = await this.subsonicService.createPlaylist(input.name, songIds);

      return {
        tool: "create_smart_playlist",
        success: true,
        output: {
          playlist,
          songCount: selectedSongs.length,
          songs: selectedSongs.map((s) => ({
            title: s.title,
            artist: s.artist,
            album: s.album,
            score: s.score,
          })),
          criteria: {
            mood: input.mood,
            genre: input.genre,
            artist: input.artist,
            yearRange: input.fromYear || input.toYear 
              ? { from: input.fromYear, to: input.toYear }
              : undefined,
          },
        },
      };
    } catch (error) {
      return { tool: "create_smart_playlist", success: false, error: error instanceof Error ? error.message : "Failed to create smart playlist" };
    }
  }
}

export const toolRegistry = new ToolRegistry();
