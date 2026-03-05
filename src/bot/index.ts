import { Bot, GrammyError } from "grammy";
import type { Config } from "../config/mod.ts";

export function createBot(config: Config): Bot {
  const bot = new Bot(config.telegram.botToken);

  bot.catch((err) => {
    console.error("Bot error:", err);
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    if (err.error instanceof GrammyError) {
      console.error("Error in request:", err.error.description);
    } else {
      console.error("Unknown error:", err.error);
    }
  });

  return bot;
}

export async function startBot(bot: Bot): Promise<void> {
  const me = await bot.api.getMe();
  console.log(`Starting bot @${me.username}`);

  bot.start({
    onStart: () => {
      console.log("Bot started successfully");
    },
  });
}

export function stopBot(bot: Bot): void {
  bot.stop();
  console.log("Bot stopped");
}
