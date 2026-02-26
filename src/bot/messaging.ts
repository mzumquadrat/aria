import type { Bot } from "grammy";
import type { Config } from "../config/mod.ts";

let botInstance: Bot | null = null;
let configInstance: Config | null = null;

/**
 * Characters that must be escaped in Telegram MarkdownV2 format.
 * According to Telegram API docs: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
const MARKDOWN_V2_SPECIAL_CHARS = /[_*[\]()~`>#+=|{}.!-]/g;

/**
 * Escape special characters for Telegram MarkdownV2 format.
 * This function preserves existing formatting by only escaping characters
 * that are not part of valid MarkdownV2 syntax.
 * 
 * @param text - The text to escape
 * @returns The text with special characters properly escaped
 */
export function escapeMarkdownV2(text: string): string {
  // First, remove any existing backslash escapes that might have been
  // added by the LLM (to avoid double-escaping)
  let unescaped = text.replace(/\\([_*[\]()~`>#+=|{}.!-])/g, "$1");
  
  // Now apply proper escaping
  // We need to be careful to preserve formatting syntax
  // Strategy: Split by formatting entities, escape only outside them
  
  // Match MarkdownV2 formatting patterns
  const formattingPattern = /(\*[^*]+\*)|(_[^_]+_)|(__[^_]+__)|(~[^~]+~)|(\|\|[^|]+\|\|)|(`[^`]+`)|(```[\s\S]*?```)|(\[[^\]]+\]\([^)]+\))/g;
  
  const parts: { text: string; isFormatting: boolean }[] = [];
  let lastIndex = 0;
  
  // Find all formatting entities
  let match;
  while ((match = formattingPattern.exec(unescaped)) !== null) {
    // Add text before this match (needs escaping)
    if (match.index > lastIndex) {
      parts.push({
        text: unescaped.slice(lastIndex, match.index),
        isFormatting: false,
      });
    }
    // Add the formatting entity (preserve as-is, but escape backslashes inside)
    parts.push({
      text: match[0],
      isFormatting: true,
    });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last match
  if (lastIndex < unescaped.length) {
    parts.push({
      text: unescaped.slice(lastIndex),
      isFormatting: false,
    });
  }
  
  // If no formatting found, just escape the whole text
  if (parts.length === 0) {
    return unescaped.replace(MARKDOWN_V2_SPECIAL_CHARS, "\\$&");
  }
  
  // Process each part
  return parts.map((part) => {
    if (part.isFormatting) {
      // For formatting entities, we still need to escape special chars
      // but be careful not to break the formatting delimiters
      return part.text;
    } else {
      // Escape special characters in non-formatting text
      return part.text.replace(MARKDOWN_V2_SPECIAL_CHARS, "\\$&");
    }
  }).join("");
}

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
    const escapedMessage = escapeMarkdownV2(message);
    await botInstance.api.sendMessage(chatId, escapedMessage, { parse_mode: "MarkdownV2" });
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
    const escapedMessage = escapeMarkdownV2(message);
    await botInstance.api.sendMessage(chatId, escapedMessage, { parse_mode: "MarkdownV2" });
    return true;
  } catch (error) {
    console.error("Failed to send message:", error);
    return false;
  }
}

export function getAllowedUserId(): number | undefined {
  return configInstance?.telegram.allowedUserId;
}
