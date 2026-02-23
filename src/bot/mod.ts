import { Bot } from "grammy";
import type { Config } from "../config/mod.ts";
import { createAuthMiddleware, createLoggingMiddleware } from "./middleware/mod.ts";
import { handleStart, handleHelp, handleStatus, handleMessage } from "./handlers/mod.ts";

export function setupBot(bot: Bot, config: Config): void {
  bot.use(createLoggingMiddleware());
  bot.use(createAuthMiddleware(config));

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);

  bot.on("message:text", handleMessage);
}

export { createBot, startBot, stopBot } from "./index.ts";
