import type { Context } from "grammy";
import { getAgent } from "../../agent/mod.ts";

const TOOL_REACTIONS: Record<string, "👀" | "🤔" | "👍" | "⚡"> = {
  web_search: "👀",
  get_time: "👀",
  calculate: "🤔",
  remember: "👍",
  recall: "👀",
  schedule_task: "⚡",
  list_scheduled_tasks: "👀",
  cancel_task: "👍",
};

function getToolReaction(toolName: string): "👀" | "🤔" | "👍" | "⚡" {
  if (toolName.startsWith("skill_")) {
    return "⚡";
  }
  return TOOL_REACTIONS[toolName] || "👀";
}

export async function handleMessage(ctx: Context): Promise<void> {
  const message = ctx.message?.text;
  
  if (!message) {
    await ctx.reply("I can only process text messages for now.");
    return;
  }

  if (message.startsWith("/")) {
    return;
  }

  const agent = getAgent();
  
  if (!agent) {
    await ctx.reply("Agent not initialized. Please check configuration.");
    return;
  }

  const toolReactions: ("👀" | "🤔" | "👍" | "⚡")[] = [];
  
  agent.setToolCallCallback((toolName: string) => {
    const reaction = getToolReaction(toolName);
    toolReactions.push(reaction);
    ctx.api.sendChatAction(ctx.chat!.id, "typing").catch(() => {});
  });

  try {
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");
    
    const response = await agent.processMessage(message);
    
    if (toolReactions.length > 0) {
      try {
        await ctx.react(toolReactions[toolReactions.length - 1]);
      } catch {
        // Reaction might not be supported or message too old
      }
    }
    
    await ctx.reply(response);
  } catch (error) {
    console.error("Agent error:", error);
    await ctx.reply(`I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    agent.setToolCallCallback(() => {});
  }
}
