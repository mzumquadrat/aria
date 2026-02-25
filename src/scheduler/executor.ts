import type { Bot } from "grammy";
import type { ScheduledTask, NotificationPayload, SkillPayload, AgentPayload } from "../storage/scheduler/types.ts";
import { getAgent } from "../agent/mod.ts";
import { skillRecordToDefinition, executeSkill } from "../skills/mod.ts";
import { getSkillByName } from "../skills/repository.ts";
import type { Config } from "../config/mod.ts";

export interface ExecutorContext {
  bot: Bot;
  config: Config;
}

let executorContext: ExecutorContext | null = null;

export function initializeExecutor(context: ExecutorContext): void {
  executorContext = context;
}

export async function executeTask(task: ScheduledTask): Promise<{ success: boolean; error?: string }> {
  if (!executorContext) {
    return { success: false, error: "Executor not initialized" };
  }

  const { bot, config } = executorContext;
  const chatId = config.telegram.allowedUserId;

  if (!chatId) {
    return { success: false, error: "No allowed user ID configured" };
  }

  try {
    switch (task.type) {
      case "notification":
        return await executeNotificationTask(task.payload as NotificationPayload, bot, chatId);
      case "skill":
        return await executeSkillTask(task.payload as SkillPayload, bot, chatId);
      case "agent":
        return await executeAgentTask(task.payload as AgentPayload, bot, chatId);
      default:
        return { success: false, error: `Unknown task type: ${(task as { type: string }).type}` };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error during task execution" 
    };
  }
}

async function executeNotificationTask(
  payload: NotificationPayload,
  bot: Bot,
  chatId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await bot.api.sendMessage(chatId, payload.message);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to send notification" 
    };
  }
}

async function executeSkillTask(
  payload: SkillPayload,
  bot: Bot,
  chatId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const skill = getSkillByName(payload.skillName);
    
    if (!skill) {
      return { success: false, error: `Skill not found: ${payload.skillName}` };
    }

    const definition = skillRecordToDefinition(skill);
    const result = await executeSkill(definition, {
      input: payload.input,
      env: {},
      timeout: 60000,
    });

    if (result.success && result.output !== undefined) {
      const outputStr = typeof result.output === "string" 
        ? result.output 
        : JSON.stringify(result.output, null, 2);
      await bot.api.sendMessage(chatId, `Skill "${payload.skillName}" completed:\n${outputStr}`);
    } else if (!result.success) {
      await bot.api.sendMessage(chatId, `Skill "${payload.skillName}" failed: ${result.error || "Unknown error"}`);
    }

    return { success: result.success, ...(result.error && { error: result.error }) };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to execute skill" 
    };
  }
}

async function executeAgentTask(
  payload: AgentPayload,
  bot: Bot,
  chatId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const agent = getAgent();
    
    if (!agent) {
      return { success: false, error: "Agent not initialized" };
    }

    const contextPrefix = "[This is a scheduled task execution]\n";
    const contextSuffix = payload.context ? `\n\nContext: ${payload.context}` : "";
    const fullPrompt = `${contextPrefix}${payload.prompt}${contextSuffix}`;

    const response = await agent.processMessage(fullPrompt);
    
    await bot.api.sendMessage(chatId, response);

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to execute agent task" 
    };
  }
}
