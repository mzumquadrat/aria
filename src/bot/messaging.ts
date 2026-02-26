import type { Bot } from "grammy";
import type { Config } from "../config/mod.ts";

let botInstance: Bot | null = null;
let configInstance: Config | null = null;

export function initializeMessaging(bot: Bot, config: Config): void {
  botInstance = bot;
  configInstance = config;
}

export async function sendMessage(message: string): Promise<boolean> {
  if (!botInstance || !configInstance) {
    console.error("Messaging not initialized");
    return false;
  }

  const chatId = configInstance.telegram.allowedUserId;
  if (!chatId) {
    console.error("No allowed user ID configured");
    return false;
  }

  try {
    await botInstance.api.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });
    return true;
  } catch (error) {
    console.error("Failed to send message:", error);
    return false;
  }
}

export async function sendMessageToChat(chatId: number, message: string): Promise<boolean> {
  if (!botInstance) {
    console.error("Messaging not initialized");
    return false;
  }

  try {
    await botInstance.api.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });
    return true;
  } catch (error) {
    console.error("Failed to send message:", error);
    return false;
  }
}

export function getAllowedUserId(): number | undefined {
  return configInstance?.telegram.allowedUserId;
}
