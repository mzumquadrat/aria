import type { ShellConfig } from "../config/mod.ts";

export interface ShellToolInput {
  command: string;
  cwd?: string;
}

export interface ShellToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellEnvironment {
  execute(command: string, cwd?: string): Promise<ShellToolResult>;
  getConfig(): ShellConfig;
}

export type { ShellConfig } from "../config/mod.ts";
