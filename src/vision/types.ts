export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export interface TextContent {
  type: "text";
  text: string;
}

export type MessageContent = string | Array<TextContent | ImageContent>;

export interface VisionAnalysisResult {
  description: string;
  text?: string;
  objects?: string[];
  confidence?: number;
}

export interface VisionServiceConfig {
  apiKey: string;
  model: string;
  httpReferer?: string;
  maxTokens: number;
}

export interface AnalyzeImageInput {
  imageData: string;
  mimeType: string;
  prompt?: string;
  context?: string;
}
