import type { Context } from "grammy";
import { getAgent } from "../../agent/mod.ts";

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

  try {
    const response = await agent.processMessage(message);
    await ctx.reply(response);
  } catch (error) {
    console.error("Agent error:", error);
    await ctx.reply(`I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
