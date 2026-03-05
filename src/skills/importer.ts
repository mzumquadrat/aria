import type { ImportResult } from "./types.ts";
import { parseSkillMarkdown } from "./types.ts";

export function importFromFile(content: string): ImportResult {
  return parseSkillMarkdown(content);
}

export function importFromArrayBuffer(buffer: ArrayBuffer): ImportResult {
  const content = new TextDecoder().decode(buffer);
  return importFromFile(content);
}

export async function importFromUrl(url: string): Promise<ImportResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      };
    }
    const content = await response.text();
    return parseSkillMarkdown(content);
  } catch (error) {
    return {
      success: false,
      error: `Failed to import from URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export async function importFromGitRepo(
  repoUrl: string,
  skillPath: string = "skill.md",
): Promise<ImportResult> {
  try {
    const tempDir = await Deno.makeTempDir();

    try {
      const cloneCommand = new Deno.Command("git", {
        args: ["clone", "--depth", "1", repoUrl, tempDir],
        stdout: "piped",
        stderr: "piped",
      });

      const cloneResult = await cloneCommand.output();

      if (!cloneResult.success) {
        const stderr = new TextDecoder().decode(cloneResult.stderr);
        return { success: false, error: `Failed to clone repository: ${stderr}` };
      }

      const skillFile = `${tempDir}/${skillPath}`;
      try {
        const content = await Deno.readTextFile(skillFile);
        return parseSkillMarkdown(content);
      } catch {
        return { success: false, error: `Skill file not found at ${skillPath} in repository` };
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to import from git: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export async function importFromGithubGist(gistUrl: string): Promise<ImportResult> {
  try {
    const gistId = gistUrl.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/)?.[1];
    if (!gistId) {
      return { success: false, error: "Invalid GitHub Gist URL" };
    }

    const apiUrl = `https://api.github.com/gists/${gistId}`;
    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch Gist: ${response.status}` };
    }

    const data = await response.json();
    const files = data.files as Record<string, { content: string }>;

    const skillFile = Object.keys(files).find(
      (f) => f.endsWith(".md") || f === "skill.md" || f.endsWith("skill.md"),
    );

    if (!skillFile || !files[skillFile]) {
      return { success: false, error: "No skill.md file found in Gist" };
    }

    return parseSkillMarkdown(files[skillFile].content);
  } catch (error) {
    return {
      success: false,
      error: `Failed to import from Gist: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export function detectImportSource(input: string): { type: string; target: string } {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (input.includes("gist.github.com")) {
      return { type: "gist", target: input };
    }
    if (input.includes("github.com") && !input.includes("gist")) {
      return { type: "github", target: input };
    }
    return { type: "url", target: input };
  }

  if (input.endsWith(".git") || input.includes("git@")) {
    return { type: "git", target: input };
  }

  return { type: "content", target: input };
}

export function importSkill(source: string): ImportResult {
  const detected = detectImportSource(source);

  switch (detected.type) {
    case "gist":
      return { success: false, error: "Gist import requires async - use importFromGithubGist" };
    case "github": {
      const repoMatch = detected.target.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (repoMatch) {
        const [, owner, repo] = repoMatch;
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/skill.md`;
        return { success: false, error: `Use importFromUrl with: ${rawUrl}` };
      }
      return { success: false, error: "Invalid GitHub repository URL" };
    }
    case "git":
      return { success: false, error: "Git import requires async - use importFromGitRepo" };
    case "url":
      return { success: false, error: "URL import requires async - use importFromUrl" };
    default:
      return parseSkillMarkdown(detected.target);
  }
}
