import type { Context } from "grammy";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import type { ElevenLabsService } from "../../elevenlabs/mod.ts";
import { getAgent } from "../../agent/mod.ts";

export function createVoiceHandler(elevenLabs: ElevenLabsService) {
  return async (ctx: Context): Promise<void> => {
    const voice = ctx.message?.voice;

    if (!voice) {
      await ctx.reply("No voice message found.");
      return;
    }

    await ctx.reply("Processing your voice message...");

    try {
      const fileId = voice.file_id;
      const file = await ctx.api.getFile(fileId);
      
      if (!file.file_path) {
        await ctx.reply("Could not retrieve voice file.");
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        await ctx.reply("Failed to download voice file.");
        return;
      }

      const audioBuffer = await response.arrayBuffer();

      const transcription = await elevenLabs.transcribe(audioBuffer);

      const agent = getAgent();
      let responseText: string;

      if (agent) {
        responseText = await agent.processMessage(transcription.text);
      } else {
        responseText = `I heard: "${transcription.text}"\n\nAgent not available.`;
      }
      
      const ttsResult = await elevenLabs.textToSpeech(responseText);

      await ctx.replyWithVoice(new InputFile(new Blob([ttsResult.audioBuffer])));
    } catch (error) {
      console.error("Voice processing error:", error);
      await ctx.reply(`Failed to process voice message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };
}

export function setupVoiceHandler(bot: Bot, elevenLabs: ElevenLabsService): void {
  bot.on("message:voice", createVoiceHandler(elevenLabs));
}
