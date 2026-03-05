import type { Context } from "grammy";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import type { Config } from "../../config/mod.ts";
import { escapeMarkdownV2, escapeMarkdownV2CodeBlock } from "../utils.ts";
import {
  createSkill,
  deleteSkill as deleteSkillFromRepo,
  detectImportSource,
  executeSkill,
  generateSkillFromPrompt,
  getAllSkills,
  getSkillByName,
  importFromArrayBuffer,
  importFromGithubGist,
  importFromGitRepo,
  importFromUrl,
  skillRecordToDefinition,
  skillToMarkdown,
  validateSkillCode,
} from "../../skills/mod.ts";

export function createSkillHandlers(config: Config) {
  return {
    listSkills: async (ctx: Context): Promise<void> => {
      const skills = getAllSkills(true);

      if (skills.length === 0) {
        await ctx.reply("No skills available. Use /importskill or /createskill to add one.");
        return;
      }

      const list = skills
        .map((s, i) =>
          `${i + 1}\\. *${escapeMarkdownV2(s.name)}*\n   ${
            escapeMarkdownV2(s.description.slice(0, 100))
          }${s.description.length > 100 ? "\\\\.\\.\\." : ""}`
        )
        .join("\n\n");

      await ctx.reply(`*Available Skills:*\n\n${list}`, { parse_mode: "MarkdownV2" });
    },

    showSkill: async (ctx: Context, name: string): Promise<void> => {
      const skill = getSkillByName(name);

      if (!skill) {
        await ctx.reply(`Skill "${name}" not found.`);
        return;
      }

      const definition = skillRecordToDefinition(skill);
      const markdown = skillToMarkdown(definition);

      if (markdown.length > 4000) {
        await ctx.reply(
          `*${escapeMarkdownV2(skill.name)}*\n\n${
            escapeMarkdownV2(skill.description)
          }\n\n_Code too long to display\\. Use /exportskill ${
            escapeMarkdownV2(skill.name)
          } to get the full file\\._`,
          { parse_mode: "MarkdownV2" },
        );
      } else {
        await ctx.reply(`\`\`\`\n${escapeMarkdownV2CodeBlock(markdown)}\n\`\`\``, {
          parse_mode: "MarkdownV2",
        });
      }
    },

    runSkill: async (ctx: Context, name: string, input: string): Promise<void> => {
      const skill = getSkillByName(name);

      if (!skill) {
        await ctx.reply(`Skill "${name}" not found.`);
        return;
      }

      if (!skill.enabled) {
        await ctx.reply(`Skill "${name}" is disabled.`);
        return;
      }

      await ctx.reply(`Running skill "${name}"...`);

      const definition = skillRecordToDefinition(skill);
      const result = await executeSkill(definition, {
        input: input || null,
        env: {},
        timeout: 60000,
      });

      if (result.success) {
        const output = typeof result.output === "object"
          ? JSON.stringify(result.output, null, 2)
          : String(result.output);
        await ctx.reply(
          `*Result* \\(${result.duration}ms\\):\n\`\`\`\n${
            escapeMarkdownV2CodeBlock(output)
          }\n\`\`\``,
          { parse_mode: "MarkdownV2" },
        );
      } else {
        await ctx.reply(
          `*Error* \\(${result.duration}ms\\):\n${
            escapeMarkdownV2(result.error || "Unknown error")
          }`,
          { parse_mode: "MarkdownV2" },
        );
      }
    },

    importSkillFromSource: async (ctx: Context, source: string): Promise<void> => {
      await ctx.reply("Importing skill...");

      const detected = detectImportSource(source);
      let result;

      switch (detected.type) {
        case "gist":
          result = await importFromGithubGist(detected.target);
          break;
        case "github": {
          const repoMatch = detected.target.match(/github\.com\/([^/]+)\/([^/]+)/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/skill.md`;
            result = await importFromUrl(rawUrl);
          } else {
            result = { success: false as const, error: "Invalid GitHub repository URL" };
          }
          break;
        }
        case "git":
          result = await importFromGitRepo(detected.target);
          break;
        case "url":
          result = await importFromUrl(detected.target);
          break;
        default:
          result = { success: false as const, error: "Unknown import source type" };
      }

      if (!result.success || !result.skill) {
        await ctx.reply(`Failed to import skill: ${result.error}`);
        return;
      }

      const existing = getSkillByName(result.skill.name);
      if (existing) {
        await ctx.reply(
          `A skill named "${result.skill.name}" already exists. Delete it first or use a different name.`,
        );
        return;
      }

      const validation = validateSkillCode(result.skill.code);
      if (!validation.valid) {
        await ctx.reply(`Invalid skill code: ${validation.error}`);
        return;
      }

      const created = createSkill(result.skill);
      await ctx.reply(`Skill "${created.name}" imported successfully!`);
    },

    importSkillFromFile: async (ctx: Context, buffer: ArrayBuffer): Promise<void> => {
      await ctx.reply("Importing skill from file...");

      const result = importFromArrayBuffer(buffer);

      if (!result.success || !result.skill) {
        await ctx.reply(`Failed to import skill: ${result.error}`);
        return;
      }

      const existing = getSkillByName(result.skill.name);
      if (existing) {
        await ctx.reply(
          `A skill named "${result.skill.name}" already exists. Delete it first or use a different name.`,
        );
        return;
      }

      const validation = validateSkillCode(result.skill.code);
      if (!validation.valid) {
        await ctx.reply(`Invalid skill code: ${validation.error}`);
        return;
      }

      const created = createSkill(result.skill);
      await ctx.reply(`Skill "${created.name}" imported successfully!`);
    },

    createSkillFromPrompt: async (ctx: Context, prompt: string): Promise<void> => {
      if (!config.openrouter?.apiKey) {
        await ctx.reply("OpenRouter API key not configured. Cannot generate skills.");
        return;
      }

      await ctx.reply("Generating skill from prompt...");

      const result = await generateSkillFromPrompt({
        prompt,
        apiKey: config.openrouter.apiKey,
        model: config.openrouter.defaultModel,
      });

      if (!result.success || !result.skill) {
        await ctx.reply(`Failed to generate skill: ${result.error}`);
        return;
      }

      const existing = getSkillByName(result.skill.name);
      if (existing) {
        const timestamp = Date.now();
        result.skill.name = `${result.skill.name}_${timestamp}`;
      }

      const created = createSkill(result.skill);
      await ctx.reply(
        `Skill "${escapeMarkdownV2(created.name)}" created successfully\\!\n\n*Description:* ${
          escapeMarkdownV2(created.description)
        }`,
        { parse_mode: "MarkdownV2" },
      );
    },

    deleteSkill: async (ctx: Context, name: string): Promise<void> => {
      const skill = getSkillByName(name);

      if (!skill) {
        await ctx.reply(`Skill "${name}" not found.`);
        return;
      }

      const deleted = deleteSkillFromRepo(skill.id);
      if (deleted) {
        await ctx.reply(`Skill "${name}" deleted successfully.`);
      } else {
        await ctx.reply(`Failed to delete skill "${name}".`);
      }
    },

    exportSkill: async (ctx: Context, name: string): Promise<void> => {
      const skill = getSkillByName(name);

      if (!skill) {
        await ctx.reply(`Skill "${name}" not found.`);
        return;
      }

      const definition = skillRecordToDefinition(skill);
      const markdown = skillToMarkdown(definition);

      await ctx.replyWithDocument(
        new InputFile(
          new Blob([markdown], { type: "text/markdown" }),
          `${skill.name.toLowerCase().replace(/\s+/g, "_")}.md`,
        ),
      );
    },
  };
}

function parseCommand(text: string): { command: string; args: string } {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  return {
    command: match?.[1] ?? "",
    args: match?.[2] ?? "",
  };
}

export function setupSkillHandlers(bot: Bot, config: Config): void {
  const handlers = createSkillHandlers(config);

  bot.command("skills", handlers.listSkills);

  bot.command("skill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    if (!args) {
      await ctx.reply("Usage: /skill <name>");
      return;
    }
    await handlers.showSkill(ctx, args);
  });

  bot.command("runskill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    const [name, ...inputParts] = args.split(/\s+/);
    if (!name) {
      await ctx.reply("Usage: /runskill <name> [input]");
      return;
    }
    await handlers.runSkill(ctx, name, inputParts.join(" "));
  });

  bot.command("importskill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    if (!args) {
      await ctx.reply("Usage: /importskill <url|git-repo|gist>\nOr send a skill.md file directly.");
      return;
    }
    await handlers.importSkillFromSource(ctx, args);
  });

  bot.command("createskill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    if (!args) {
      await ctx.reply("Usage: /createskill <description of what the skill should do>");
      return;
    }
    await handlers.createSkillFromPrompt(ctx, args);
  });

  bot.command("deleteskill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    if (!args) {
      await ctx.reply("Usage: /deleteskill <name>");
      return;
    }
    await handlers.deleteSkill(ctx, args);
  });

  bot.command("exportskill", async (ctx) => {
    const { args } = parseCommand(ctx.message?.text ?? "");
    if (!args) {
      await ctx.reply("Usage: /exportskill <name>");
      return;
    }
    await handlers.exportSkill(ctx, args);
  });

  bot.on("message:document", async (ctx) => {
    const document = ctx.message?.document;
    const fileName = document?.file_name?.toLowerCase() ?? "";

    if (fileName.endsWith(".md") || fileName.includes("skill")) {
      const fileId = document!.file_id;
      const file = await ctx.api.getFile(fileId);

      if (!file.file_path) {
        await ctx.reply("Could not retrieve file.");
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      const response = await fetch(fileUrl);

      if (!response.ok) {
        await ctx.reply("Failed to download file.");
        return;
      }

      const buffer = await response.arrayBuffer();
      await handlers.importSkillFromFile(ctx, buffer);
    }
  });
}
