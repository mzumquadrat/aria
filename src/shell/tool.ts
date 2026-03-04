import type { Tool } from "../agent/tools.ts";
import type { ShellEnvironment, ShellToolInput, ShellToolResult } from "./types.ts";

export const shellTool: Tool = {
  type: "builtin",
  name: "shell",
  description:
    "Execute bash commands in a sandboxed environment with configurable filesystem mounts. Supports built-in commands like ls, cat, grep, jq, sed, and others. Python support is available if enabled. Network access is available if enabled.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      cwd: {
        type: "string",
        description: "Working directory inside the sandbox (default: /home/user)",
      },
    },
    required: ["command"],
  },
};

export async function executeShellCommand(
  env: ShellEnvironment,
  input: ShellToolInput,
): Promise<ShellToolResult> {
  return await env.execute(input.command, input.cwd);
}
