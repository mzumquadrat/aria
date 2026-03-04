import type { Context } from "grammy";
import { enqueueMessage, getMessageQueue } from "../../queue/mod.ts";

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

  try {
    const queue = getMessageQueue();
    const stats = queue.getStats();
    
    const task = enqueueMessage(message, {
      chatId: ctx.chat!.id,
      userId: ctx.from!.id,
      messageId: ctx.message?.message_id,
    });

    if (stats.pending > 0 || stats.running > 0) {
      await ctx.reply("Working on it\\.\\.\\.", { parse_mode: "MarkdownV2" });
    }

    await ctx.api.sendChatAction(ctx.chat!.id, "typing");

    const checkInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat!.id, "typing").catch(() => {});
    }, 3000);

    try {
      const checkCompletion = (): Promise<void> => {
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            const currentTask = queue.getTask(task.id);
            if (currentTask && (currentTask.status === "completed" || currentTask.status === "failed" || currentTask.status === "timeout")) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      };

      await checkCompletion();

      const completedTask = queue.getTask(task.id);
      
      if (completedTask?.result) {
        const result = completedTask.result as { response: string; toolReactions: string[] };
        
        if (result.toolReactions && result.toolReactions.length > 0) {
          const lastTool = result.toolReactions[result.toolReactions.length - 1];
          const reaction = getToolReaction(lastTool);
          try {
            await ctx.react(reaction);
          } catch {
            // Reaction might not be supported
          }
        }
        
        await ctx.reply(result.response);
      } else if (completedTask?.error) {
        await ctx.reply(`Error: ${completedTask.error}`);
      } else {
        await ctx.reply("Something went wrong processing your message.");
      }
    } finally {
      clearInterval(checkInterval);
    }
  } catch (error) {
    console.error("Message handler error:", error);
    await ctx.reply(`I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
