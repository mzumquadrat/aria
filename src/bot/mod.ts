import type { Bot } from "grammy";
import type { Config } from "../config/mod.ts";
import type { ElevenLabsService } from "../elevenlabs/mod.ts";
import { createAuthMiddleware, createLoggingMiddleware } from "./middleware/mod.ts";
import {
  handleHelp,
  handleMessage,
  handlePhoto,
  handleStart,
  handleStatus,
  setupSkillHandlers,
  setupVoiceHandler,
} from "./handlers/mod.ts";

export function setupBot(bot: Bot, config: Config, elevenLabs?: ElevenLabsService): void {
  bot.use(createLoggingMiddleware());
  bot.use(createAuthMiddleware(config));

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);

  bot.on("message:text", handleMessage);
  bot.on("message:photo", handlePhoto);

  setupSkillHandlers(bot, config);

  if (elevenLabs) {
    setupVoiceHandler(bot, elevenLabs);
  }
}

export { createBot, startBot, stopBot } from "./index.ts";
export {
  getAllowedUserId,
  initializeMessaging,
  sendMessage,
  sendMessageToChat,
} from "./messaging.ts";
export { escapeMarkdownV2 } from "./utils.ts";
