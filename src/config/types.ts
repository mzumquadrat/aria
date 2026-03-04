import { z } from "zod";
import { BrowserConfigSchema } from "../browser/types.ts";

export const MountConfigSchema = z.object({
  path: z.string(),
  mountPoint: z.string(),
  mode: z.enum(["rw", "ro"]).default("ro"),
});

export const ExecutionLimitsSchema = z.object({
  maxCallDepth: z.number().default(100),
  maxCommandCount: z.number().default(10000),
  maxLoopIterations: z.number().default(10000),
});

export const ShellConfigSchema = z.object({
  mounts: z.array(MountConfigSchema).default([]),
  timeout: z.number().default(30000),
  enablePython: z.boolean().default(false),
  enableNetwork: z.boolean().default(false),
  executionLimits: ExecutionLimitsSchema.optional(),
});

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1, "Telegram bot token is required"),
  allowedUserId: z.number().optional(),
});

export const ElevenLabsConfigSchema = z.object({
  apiKey: z.string().min(1, "ElevenLabs API key is required"),
  voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  modelId: z.string().default("eleven_multilingual_v2"),
  sttModelId: z.string().default("scribe_v1"),
});

export const BraveSearchConfigSchema = z.object({
  apiKey: z.string().min(1, "Brave Search API key is required"),
  baseUrl: z.string().default("https://api.search.brave.com/res/v1"),
  count: z.number().default(10),
});

export const CalDAVConfigSchema = z.object({
  serverUrl: z.string().url("CalDAV server URL must be valid"),
  username: z.string().min(1, "CalDAV username is required"),
  password: z.string().min(1, "CalDAV password is required"),
  defaultCalendar: z.string().optional(),
});

export const GoogleCalendarConfigSchema = z.object({
  accessToken: z.string().min(1, "Google Calendar access token is required"),
  refreshToken: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  defaultCalendar: z.string().default("primary"),
});

export const CalendarConfigSchema = z.object({
  caldav: CalDAVConfigSchema.optional(),
  google: GoogleCalendarConfigSchema.optional(),
});

export const OpenRouterConfigSchema = z.object({
  apiKey: z.string().min(1, "OpenRouter API key is required"),
  defaultModel: z.string().default("anthropic/claude-sonnet-4"),
  fallbackModel: z.string().default("openai/gpt-4o-mini"),
  visionModel: z.string().default("anthropic/claude-sonnet-4"),
  httpReferer: z.string().optional(),
  maxTokens: z.number().int().positive().default(4096),
});

export const ApprovalConfigSchema = z.object({
  autoApproveReadonly: z.boolean().default(true),
  requireApprovalWrite: z.boolean().default(true),
  approvalTimeout: z.number().default(300),
});

export const SchedulerConfigSchema = z.object({
  checkInterval: z.number().default(1000),
  maxConcurrent: z.number().default(5),
});

export const QueueConfigSchema = z.object({
  maxConcurrent: z.number().default(3),
  defaultTimeout: z.number().default(60000),
  shutdownTimeout: z.number().default(30000),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  auditEnabled: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  telegram: TelegramConfigSchema,
  openrouter: OpenRouterConfigSchema,
  elevenlabs: ElevenLabsConfigSchema.optional(),
  brave: BraveSearchConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  shell: ShellConfigSchema.optional(),
  browser: BrowserConfigSchema.optional(),
  approval: ApprovalConfigSchema.optional(),
  scheduler: SchedulerConfigSchema.optional(),
  queue: QueueConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  database: z.object({
    path: z.string().default("./data/aria.db"),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ShellConfig = z.infer<typeof ShellConfigSchema>;
export type MountConfig = z.infer<typeof MountConfigSchema>;
export type ExecutionLimits = z.infer<typeof ExecutionLimitsSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type OpenRouterConfig = z.infer<typeof OpenRouterConfigSchema>;
export type ElevenLabsConfig = z.infer<typeof ElevenLabsConfigSchema>;
export type BraveSearchConfig = z.infer<typeof BraveSearchConfigSchema>;
export type CalDAVConfig = z.infer<typeof CalDAVConfigSchema>;
export type GoogleCalendarConfig = z.infer<typeof GoogleCalendarConfigSchema>;
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type { BrowserConfig } from "../browser/types.ts";
