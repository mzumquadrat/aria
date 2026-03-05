import type { Context } from "grammy";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    "Welcome to Aria, your personal assistant\\!\n\n" +
      "I can help you with various tasks\\. Use /help to see available commands\\.",
  );
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    "📚 *Available Commands*\n\n" +
      "/start \\- Start the bot\n" +
      "/help \\- Show this help message\n" +
      "/status \\- Check bot status\n" +
      "/tasks \\- List scheduled tasks\n\n" +
      "Just send me a message and I'll help you\\!",
    { parse_mode: "MarkdownV2" },
  );
}

export async function handleStatus(ctx: Context): Promise<void> {
  const pid = Deno.pid;
  await ctx.reply(
    "🤖 *Bot Status*\n\n" +
      `Process ID: ${pid}\n` +
      `Status: Running\n` +
      `Version: 0\\.1\\.0`,
    { parse_mode: "MarkdownV2" },
  );
}
