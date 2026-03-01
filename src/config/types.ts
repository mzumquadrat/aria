import { z } from "zod";

export const ShellRateLimitSchema = z.object({
  maxPerMinute: z.number().default(10),
  maxPerHour: z.number().default(100),
});

export const ShellConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).default([]),
  deniedDirectories: z.array(z.string()).default([]),
  allowedCommands: z.array(z.string()).default([]),
  deniedCommands: z.array(z.string()).default([]),
  timeout: z.number().default(30000),
  rateLimit: ShellRateLimitSchema.optional(),
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
  httpReferer: z.string().optional(),
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

export const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  auditEnabled: z.boolean().default(true),
});

export const SubsonicConfigSchema = z.object({
  serverUrl: z.string().url("Subsonic server URL must be valid"),
  username: z.string().min(1, "Subsonic username is required"),
  password: z.string().min(1, "Subsonic password is required"),
  defaultPlaylistPrefix: z.string().default("Aria: "),
});

export const LastfmConfigSchema = z.object({
  apiKey: z.string().min(1, "Last.fm API key is required"),
  username: z.string().optional(),
  cacheExpiryDays: z.number().default(7),
  rateLimitPerSecond: z.number().default(4),
});

export const ConfigSchema = z.object({
  telegram: TelegramConfigSchema,
  openrouter: OpenRouterConfigSchema,
  elevenlabs: ElevenLabsConfigSchema.optional(),
  brave: BraveSearchConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  shell: ShellConfigSchema.optional(),
  approval: ApprovalConfigSchema.optional(),
  scheduler: SchedulerConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  subsonic: SubsonicConfigSchema.optional(),
  lastfm: LastfmConfigSchema.optional(),
  database: z.object({
    path: z.string().default("./data/aria.db"),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ShellConfig = z.infer<typeof ShellConfigSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type OpenRouterConfig = z.infer<typeof OpenRouterConfigSchema>;
export type ElevenLabsConfig = z.infer<typeof ElevenLabsConfigSchema>;
export type BraveSearchConfig = z.infer<typeof BraveSearchConfigSchema>;
export type CalDAVConfig = z.infer<typeof CalDAVConfigSchema>;
export type GoogleCalendarConfig = z.infer<typeof GoogleCalendarConfigSchema>;
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type SubsonicConfig = z.infer<typeof SubsonicConfigSchema>;
export type LastfmConfig = z.infer<typeof LastfmConfigSchema>;
