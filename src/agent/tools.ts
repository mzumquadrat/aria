import type { SkillRecord } from "../skills/mod.ts";
import { skillRecordToDefinition, executeSkill } from "../skills/mod.ts";
import { getAllSkills } from "../skills/repository.ts";
import type { MemoryRepository, MemoryCategory } from "../storage/memory/mod.ts";
import type { BraveSearchService } from "../brave/mod.ts";

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
}

export const toolRegistry = new ToolRegistry();
