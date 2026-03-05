import type { ElevenLabsConfig } from "../config/types.ts";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export interface TranscriptionResult {
  text: string;
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
}

export class ElevenLabsService {
  private config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async transcribe(audioBuffer: ArrayBuffer): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), "audio.ogg");
    formData.append("model_id", this.config.sttModelId ?? "scribe_v1");

    const response = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
      method: "POST",
      headers: {
        "xi-api-key": this.config.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs transcription failed: ${error}`);
    }

    const data = await response.json();
    return { text: data.text };
  }

  async textToSpeech(text: string): Promise<TTSResult> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${this.config.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.config.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${error}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return { audioBuffer };
  }
}

export function createElevenLabsService(config: ElevenLabsConfig): ElevenLabsService {
  return new ElevenLabsService(config);
}
