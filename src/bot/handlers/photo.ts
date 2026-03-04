import type { Context } from "grammy";
import { getAgent } from "../../agent/mod.ts";

export async function handlePhoto(ctx: Context): Promise<void> {
  const agent = getAgent();
  if (!agent) {
    await ctx.reply("Agent not initialized. Please try again later.");
    return;
  }

  const photo = ctx.message?.photo?.at(-1);
  if (!photo) {
    await ctx.reply("No photo found in message.");
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("Could not identify chat.");
    return;
  }

  try {
    await ctx.reply("Processing image\\.\\.\\.", { parse_mode: "MarkdownV2" });
    await ctx.api.sendChatAction(chatId, "typing");

    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const base64Image = btoa(
      String.fromCharCode(...new Uint8Array(imageBuffer)),
    );

    const mimeType = file.file_path?.endsWith(".png")
      ? "image/png"
      : file.file_path?.endsWith(".gif")
      ? "image/gif"
      : "image/jpeg";

    const caption = ctx.message?.caption ?? undefined;

    agent.addPendingImage(chatId, base64Image, mimeType, caption);

    await ctx.reply(
      "Image received\\. What would you like me to do with it? You can ask me to analyze it, describe it, or answer questions about it\\.",
      { parse_mode: "MarkdownV2" },
    );
  } catch (error) {
    console.error("Photo handler error:", error);
    await ctx.reply(
      `Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}