import type { PhotoService } from "../agent/tools.ts";
import { sendPhotoByUrlToChat, sendPhotoToChat } from "../bot/messaging.ts";

export function createPhotoService(): PhotoService {
  return {
    sendPhoto(chatId: number, imageData: string, caption?: string): Promise<boolean> {
      return sendPhotoToChat(chatId, imageData, caption);
    },
    sendPhotoByUrl(chatId: number, url: string, caption?: string): Promise<boolean> {
      return sendPhotoByUrlToChat(chatId, url, caption);
    },
  };
}
