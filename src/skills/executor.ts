import type { SkillDefinition, SkillExecutionResult } from "./types.ts";

export interface ExecutionContext {
  input: unknown;
  env: Record<string, string>;
  timeout?: number;
}

export async function executeSkill(
  skill: SkillDefinition,
  context: ExecutionContext,
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const timeout = context.timeout ?? 30000;

  const wrappedCode = `
${skill.code}

// Execute the skill with the provided input
const input = ${JSON.stringify(context.input)};

if (typeof execute === 'function') {
  const result = await execute(input);
  console.log(JSON.stringify({ success: true, output: result }));
} else if (typeof run === 'function') {
  const result = await run(input);
  console.log(JSON.stringify({ success: true, output: result }));
} else if (typeof main === 'function') {
  const result = await main(input);
  console.log(JSON.stringify({ success: true, output: result }));
} else {
  console.error(JSON.stringify({ success: false, error: 'No execute, run, or main function found in skill code' }));
}
`;

  try {
    const tempFile = await Deno.makeTempFile({ suffix: ".ts" });
    try {
      await Deno.writeTextFile(tempFile, wrappedCode);

      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-net",
          "--allow-env",
          "--allow-read",
          "--allow-write",
          "--allow-run",
          "--allow-sys",
          tempFile,
        ],
        stdout: "piped",
        stderr: "piped",
        env: context.env,
      });

      const child = command.spawn();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Skill execution timed out")), timeout);
      });

      const result = await Promise.race([
        child.output(),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      if (result.stdout) {
        const stdout = new TextDecoder().decode(result.stdout);
        try {
          const parsed = JSON.parse(stdout.trim());
          return {
            success: parsed.success,
            output: parsed.output,
            error: parsed.error,
            duration,
          };
        } catch {
          return {
            success: true,
            output: stdout.trim(),
            duration,
          };
        }
      }

      if (result.stderr) {
        const stderr = new TextDecoder().decode(result.stderr);
        return {
          success: false,
          error: stderr.trim() || "Unknown error",
          duration,
        };
      }

      return {
        success: result.code === 0,
        duration,
      };
    } finally {
      await Deno.remove(tempFile).catch(() => {});
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration,
    };
  }
}

export function validateSkillCode(code: string): { valid: boolean; error?: string } {
  const hasExecute =
    /\bfunction\s+execute\s*\(|const\s+execute\s*=|export\s+async\s+function\s+execute/;
  const hasRun = /\bfunction\s+run\s*\(|const\s+run\s*=|export\s+async\s+function\s+run/;
  const hasMain = /\bfunction\s+main\s*\(|const\s+main\s*=|export\s+async\s+function\s+main/;

  if (!hasExecute.test(code) && !hasRun.test(code) && !hasMain.test(code)) {
    return {
      valid: false,
      error: "Skill code must export an 'execute', 'run', or 'main' function",
    };
  }

  return { valid: true };
}
