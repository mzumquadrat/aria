import { z } from "zod";

export const SkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  code: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  examples: z.array(z.string()).optional(),
  author: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type SkillDefinition = z.infer<typeof SkillSchema>;

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  code: string;
  schema: string;
  enabled: boolean;
  createdAt: Date;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
}

export interface ImportResult {
  success: boolean;
  skill?: SkillDefinition;
  error?: string;
}

export function parseSkillMarkdown(content: string): ImportResult {
  try {
    const nameMatch = content.match(/^#\s+(.+)$/m);
    const name = nameMatch?.[1]?.trim();

    if (!name) {
      return { success: false, error: "Skill name not found (expected # heading)" };
    }

    const descriptionMatch = content.match(/##\s+Description\s*\n+([\s\S]*?)(?=\n##|$)/i);
    const description = descriptionMatch?.[1]?.trim() || "";

    const codeMatch = content.match(/```(?:typescript|javascript|ts|js)?\s*\n([\s\S]*?)```/);
    const code = codeMatch?.[1]?.trim();

    if (!code) {
      return { success: false, error: "Skill code not found (expected code block)" };
    }

    const schemaMatch = content.match(/##\s+Schema\s*\n+```(?:json)?\s*\n([\s\S]*?)```/i);
    let inputSchema: Record<string, unknown> | undefined;
    let outputSchema: Record<string, unknown> | undefined;

    if (schemaMatch) {
      try {
        const schema = JSON.parse(schemaMatch[1].trim());
        inputSchema = schema.input;
        outputSchema = schema.output;
      } catch {
        // Invalid JSON, skip schema
      }
    }

    const examplesMatch = content.match(/##\s+Examples\s*\n+([\s\S]*?)(?=\n##|$)/i);
    let examples: string[] | undefined;
    if (examplesMatch) {
      examples = examplesMatch[1]
        .split(/\n/)
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter((line) => line.length > 0);
    }

    const authorMatch = content.match(/(?:Author|author):\s*(.+)/);
    const versionMatch = content.match(/(?:Version|version):\s*(.+)/);
    const tagsMatch = content.match(/(?:Tags|tags):\s*(.+)/);

    let tags: string[] | undefined;
    if (tagsMatch) {
      tags = tagsMatch[1].split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    }

    const skill: SkillDefinition = {
      name,
      description,
      code,
      inputSchema,
      outputSchema,
      examples,
      author: authorMatch?.[1]?.trim(),
      version: versionMatch?.[1]?.trim(),
      tags,
    };

    const parsed = SkillSchema.safeParse(skill);
    if (!parsed.success) {
      return { success: false, error: `Invalid skill definition: ${parsed.error.message}` };
    }

    return { success: true, skill: parsed.data };
  } catch (error) {
    return { success: false, error: `Failed to parse skill: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
}

export function skillToMarkdown(skill: SkillDefinition): string {
  let markdown = `# ${skill.name}\n\n`;
  markdown += `## Description\n\n${skill.description}\n\n`;

  if (skill.inputSchema || skill.outputSchema) {
    markdown += `## Schema\n\n\`\`\`json\n${JSON.stringify({ input: skill.inputSchema, output: skill.outputSchema }, null, 2)}\n\`\`\`\n\n`;
  }

  markdown += `## Code\n\n\`\`\`typescript\n${skill.code}\n\`\`\`\n\n`;

  if (skill.examples && skill.examples.length > 0) {
    markdown += `## Examples\n\n${skill.examples.map((e) => `- ${e}`).join("\n")}\n\n`;
  }

  if (skill.author) {
    markdown += `Author: ${skill.author}\n`;
  }
  if (skill.version) {
    markdown += `Version: ${skill.version}\n`;
  }
  if (skill.tags && skill.tags.length > 0) {
    markdown += `Tags: ${skill.tags.join(", ")}\n`;
  }

  return markdown;
}
