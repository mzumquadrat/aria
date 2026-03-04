import { Bash, type BashOptions, InMemoryFs, MountableFs, OverlayFs, ReadWriteFs } from "just-bash";
import type { ShellConfig } from "../config/mod.ts";
import type { ShellEnvironment, ShellToolResult } from "./types.ts";

export function createShellEnvironment(config: ShellConfig): ShellEnvironment {
  const fs = new MountableFs({ base: new InMemoryFs() });

  for (const mount of config.mounts) {
    const expandedPath = expandPath(mount.path);

    const filesystem = mount.mode === "rw"
      ? new ReadWriteFs({ root: expandedPath })
      : new OverlayFs({ root: expandedPath, readOnly: true });

    fs.mount(mount.mountPoint, filesystem);
  }

  const options: BashOptions = {
    fs,
    cwd: "/home/user",
    python: config.enablePython,
  };

  if (config.enableNetwork) {
    options.network = { dangerouslyAllowFullInternetAccess: true };
  }

  if (config.executionLimits) {
    options.executionLimits = config.executionLimits;
  }

  const bash = new Bash(options);

  return {
    execute: async (command: string, cwd?: string): Promise<ShellToolResult> => {
      try {
        const result = await bash.exec(command, cwd ? { cwd } : undefined);
        return {
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
          exitCode: result.exitCode ?? 0,
        };
      } catch (error) {
        return {
          stdout: "",
          stderr: error instanceof Error ? error.message : "Command execution failed",
          exitCode: 1,
        };
      }
    },
    getConfig: () => config,
  };
}

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    const home = Deno.env.get("HOME") || "/home/user";
    return path.replace("~", home);
  }
  return path;
}

export type { ShellEnvironment, ShellToolResult } from "./types.ts";
