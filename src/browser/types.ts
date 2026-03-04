import { z } from "zod";

export const BrowserConfigSchema = z.object({
  cdpEndpoint: z.string().url("CDP endpoint must be a valid URL"),
  defaultTimeout: z.number().default(30000),
  screenshotQuality: z.number().min(1).max(100).default(80),
  autoApproveNavigate: z.boolean().default(false),
  autoApproveForms: z.boolean().default(false),
  approvalTimeout: z.number().default(300),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

export interface CDPCommand {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CDPResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
  sessionId?: string;
}

export interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
}

export interface ScreenshotResult {
  data: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ContentResult {
  html: string;
  text?: string;
}

export interface LinkInfo {
  href: string;
  text: string;
  title?: string;
}

export interface ApprovalRequest {
  action: string;
  details: string;
  requiresPassword?: boolean;
  sensitiveAction?: boolean;
}

export interface ApprovalResponse {
  approved: boolean;
  reason?: string;
}

export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approvalRequest?: ApprovalRequest;
}

export const NavigateInputSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
});

export const ClickInputSchema = z.object({
  selector: z.string(),
  button: z.enum(["left", "right", "middle"]).optional(),
  clickCount: z.number().optional(),
});

export const TypeInputSchema = z.object({
  selector: z.string(),
  text: z.string(),
  delay: z.number().optional(),
  clear: z.boolean().optional(),
});

export const SelectInputSchema = z.object({
  selector: z.string(),
  value: z.string(),
});

export const ScreenshotInputSchema = z.object({
  selector: z.string().optional(),
  quality: z.number().min(1).max(100).optional(),
  fullPage: z.boolean().optional(),
});

export const GetContentInputSchema = z.object({
  selector: z.string().optional(),
  includeText: z.boolean().optional(),
});

export const ExtractLinksInputSchema = z.object({
  selector: z.string().optional(),
});

export const EvaluateInputSchema = z.object({
  expression: z.string(),
});

export const WaitForInputSchema = z.object({
  selector: z.string().optional(),
  condition: z.enum(["visible", "hidden", "attached", "detached"]).optional(),
  timeout: z.number().optional(),
  script: z.string().optional(),
});

export const ScrollInputSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]),
  amount: z.number().optional(),
  selector: z.string().optional(),
});

export const SwitchTabInputSchema = z.object({
  tabId: z.string(),
});

export const NewTabInputSchema = z.object({
  url: z.string().url().optional(),
});

export const CloseTabInputSchema = z.object({
  tabId: z.string(),
});

export type NavigateInput = z.infer<typeof NavigateInputSchema>;
export type ClickInput = z.infer<typeof ClickInputSchema>;
export type TypeInput = z.infer<typeof TypeInputSchema>;
export type SelectInput = z.infer<typeof SelectInputSchema>;
export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
export type GetContentInput = z.infer<typeof GetContentInputSchema>;
export type ExtractLinksInput = z.infer<typeof ExtractLinksInputSchema>;
export type EvaluateInput = z.infer<typeof EvaluateInputSchema>;
export type WaitForInput = z.infer<typeof WaitForInputSchema>;
export type ScrollInput = z.infer<typeof ScrollInputSchema>;
export type SwitchTabInput = z.infer<typeof SwitchTabInputSchema>;
export type NewTabInput = z.infer<typeof NewTabInputSchema>;
export type CloseTabInput = z.infer<typeof CloseTabInputSchema>;
