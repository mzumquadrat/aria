import type { ImportResult, SkillDefinition } from "./types.ts";
import { SkillSchema } from "./types.ts";

const SYSTEM_PROMPT = `You are a skill code generator for a personal assistant bot named Aria.
Generate TypeScript code that can be executed to perform the requested task.

Rules:
1. Export an async function called 'execute' that takes an input parameter
2. The function should return a result
3. Use only standard Deno APIs and fetch for HTTP requests
4. Keep the code clean and well-documented
5. Handle errors gracefully

Output format - respond with a JSON object:
{
  "name": "SkillName",
  "description": "Brief description of what the skill does",
  "code": "// TypeScript code here",
  "inputSchema": { "type": "object", "properties": {...} },
  "outputSchema": { "type": "object", "properties": {...} },
  "examples": ["Example usage 1", "Example usage 2"],
  "tags": ["tag1", "tag2"]
}

Only output the JSON object, no other text.`;

export interface GenerateSkillOptions {
  prompt: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export async function generateSkillFromPrompt(
  options: GenerateSkillOptions,
): Promise<ImportResult> {
  // Default model is only used as fallback; handler should pass config.openrouter.defaultModel
  const { prompt, apiKey, model = "deepseek/deepseek-chat" } = options;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": options.baseUrl ?? "https://aria.local",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `LLM request failed: ${response.status} ${error}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { success: false, error: "No response from LLM" };
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: "No JSON found in LLM response" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const skill: SkillDefinition = {
      name: parsed.name || "Generated Skill",
      description: parsed.description || "",
      code: parsed.code || "",
      inputSchema: parsed.inputSchema,
      outputSchema: parsed.outputSchema,
      examples: parsed.examples,
      tags: parsed.tags,
    };

    const validated = SkillSchema.safeParse(skill);
    if (!validated.success) {
      return { success: false, error: `Invalid skill generated: ${validated.error.message}` };
    }

    return { success: true, skill: validated.data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate skill: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
