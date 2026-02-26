import type { Bot } from "grammy";
import type { Config } from "../config/mod.ts";
import type { ElevenLabsService } from "../elevenlabs/mod.ts";
import { createAuthMiddleware, createLoggingMiddleware } from "./middleware/mod.ts";
import { handleStart, handleHelp, handleStatus, handleMessage, setupVoiceHandler, setupSkillHandlers } from "./handlers/mod.ts";

export function setupBot(bot: Bot, config: Config, elevenLabs?: ElevenLabsService): void {
  bot.use(createLoggingMiddleware());
  bot.use(createAuthMiddleware(config));

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);

  bot.on("message:text", handleMessage);

  setupSkillHandlers(bot, config);

  if (elevenLabs) {
    setupVoiceHandler(bot, elevenLabs);
  }
}

export { createBot, startBot, stopBot } from "./index.ts";
export { initializeMessaging, sendMessage, sendMessageToChat, getAllowedUserId } from "./messaging.ts";
export { escapeMarkdownV2 } from "./utils.ts";
