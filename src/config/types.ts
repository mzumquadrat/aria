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

export const ConfigSchema = z.object({
  telegram: TelegramConfigSchema,
  openrouter: OpenRouterConfigSchema,
  shell: ShellConfigSchema.optional(),
  approval: ApprovalConfigSchema.optional(),
  scheduler: SchedulerConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  database: z.object({
    path: z.string().default("./data/aria.db"),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ShellConfig = z.infer<typeof ShellConfigSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type OpenRouterConfig = z.infer<typeof OpenRouterConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
