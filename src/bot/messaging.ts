import type { Bot } from "grammy";
import { InputFile } from "grammy";
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
  const unescaped = text.replace(/\\([_*[\]()~`>#+=|{}.!-])/g, "$1");
  
  // Now apply proper escaping
  // We need to be careful to preserve formatting syntax
  // Strategy: Split by formatting entities, escape only outside them
  
  // Match MarkdownV2 formatting patterns
  const formattingPattern = /(\*[^*]+\*)|(_[^_]+_)|(__[^_]+__)|(~[^~]+~)|(\|\|[^|]+\|\|)|(`[^`]+`)|(```[\s\S]*?```)|(\[[^\]]+\]\([^)]+\))/g;
  
  const parts: { text: string; isFormatting: boolean }[] = [];
  let lastIndex = 0;
  
  // Find all formatting entities
  let match: RegExpExecArray | null = formattingPattern.exec(unescaped);
  while (match !== null) {
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
    match = formattingPattern.exec(unescaped);
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

export async function sendPhotoToChat(
  chatId: number,
  photo: string | Uint8Array,
  caption?: string,
): Promise<boolean> {
  if (!botInstance) {
    console.error("Messaging not initialized");
    return false;
  }

  try {
    let photoInput: string | InputFile;
    if (typeof photo === "string") {
      const photoBuffer = Uint8Array.from(atob(photo), (c) => c.charCodeAt(0));
      photoInput = new InputFile(photoBuffer, "photo.jpg");
    } else {
      photoInput = new InputFile(photo, "photo.jpg");
    }

    const options: { caption?: string; parse_mode?: "MarkdownV2" } = {};
    if (caption) {
      options.caption = escapeMarkdownV2(caption);
      options.parse_mode = "MarkdownV2";
    }

    await botInstance.api.sendPhoto(chatId, photoInput, options);
    return true;
  } catch (error) {
    console.error("Failed to send photo:", error);
    return false;
  }
}

export async function sendPhotoByUrlToChat(
  chatId: number,
  url: string,
  caption?: string,
): Promise<boolean> {
  if (!botInstance) {
    console.error("Messaging not initialized");
    return false;
  }

  try {
    const options: { caption?: string; parse_mode?: "MarkdownV2" } = {};
    if (caption) {
      options.caption = escapeMarkdownV2(caption);
      options.parse_mode = "MarkdownV2";
    }

    await botInstance.api.sendPhoto(chatId, url, options);
    return true;
  } catch (error) {
    console.error("Failed to send photo by URL:", error);
    return false;
  }
}
