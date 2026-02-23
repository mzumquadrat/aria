import type { Context } from "grammy";

export async function handleMessage(ctx: Context): Promise<void> {
  const message = ctx.message?.text;
  
  if (!message) {
    await ctx.reply("I can only process text messages for now.");
    return;
  }

  await ctx.reply(
    `I received your message: "${message}"\n\n` +
    "I'm still learning. The full AI integration will be available soon!"
  );
}
