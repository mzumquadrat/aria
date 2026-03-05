import type { AnalyzeImageInput, MessageContent, VisionServiceConfig } from "./types.ts";

export class VisionService {
  private config: VisionServiceConfig;

  constructor(config: VisionServiceConfig) {
    this.config = config;
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<string> {
    const { imageData, mimeType, prompt, context } = input;

    const systemPrompt =
      `You are a visual analysis assistant. Analyze images and provide detailed, helpful descriptions.
${context ? `Context: ${context}` : ""}

When analyzing images:
1. Describe what you see in detail
2. Identify any text visible in the image
3. Note important objects, people, or elements
4. Describe the overall scene and context
5. If the image contains UI elements, describe them clearly

Be thorough but concise. Focus on what's most relevant.`;

    const userPrompt = prompt ?? "Please analyze this image and describe what you see.";

    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageData}`,
            },
          },
        ],
      },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.config.httpReferer ?? "https://aria.local",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Vision API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content ?? "Unable to analyze image";
  }

  async analyzeMultipleImages(
    images: Array<{ imageData: string; mimeType: string }>,
    prompt?: string,
    context?: string,
  ): Promise<string> {
    const systemPrompt =
      `You are a visual analysis assistant. Analyze multiple images and provide detailed, helpful descriptions.
${context ? `Context: ${context}` : ""}

When analyzing images:
1. Compare and contrast the images if relevant
2. Describe what you see in each image
3. Identify any text visible in the images
4. Note important objects, people, or elements
5. Describe the overall scene and context

Be thorough but concise. Focus on what's most relevant.`;

    const userPrompt = prompt ?? "Please analyze these images and describe what you see.";

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: userPrompt },
    ];

    for (const image of images) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.imageData}`,
        },
      });
    }

    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: content as MessageContent },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.config.httpReferer ?? "https://aria.local",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Vision API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content ?? "Unable to analyze images";
  }
}

let visionServiceInstance: VisionService | null = null;

export function createVisionService(config: VisionServiceConfig): VisionService {
  visionServiceInstance = new VisionService(config);
  return visionServiceInstance;
}

export function getVisionService(): VisionService | null {
  return visionServiceInstance;
}
