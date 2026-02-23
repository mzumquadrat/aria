import { join } from "@std/path";

export interface Soul {
  content: string;
  path: string;
  lastLoaded: Date;
}

let soulCache: Soul | null = null;

export async function loadSoul(soulPath?: string): Promise<Soul> {
  const path = soulPath || join(Deno.cwd(), "soul.md");
  
  try {
    const content = await Deno.readTextFile(path);
    soulCache = {
      content,
      path,
      lastLoaded: new Date(),
    };
    return soulCache;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Soul document not found at ${path}`);
    }
    throw error;
  }
}

export function getCachedSoul(): Soul | null {
  return soulCache;
}

export async function reloadSoul(soulPath?: string): Promise<Soul> {
  soulCache = null;
  return loadSoul(soulPath);
}

export function extractSection(content: string, sectionTitle: string): string | null {
  const lines = content.split("\n");
  let inSection = false;
  let sectionContent: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith("## ") && line.includes(sectionTitle)) {
      inSection = true;
      continue;
    }
    
    if (inSection) {
      if (line.startsWith("## ")) {
        break;
      }
      sectionContent.push(line);
    }
  }
  
  return sectionContent.length > 0 ? sectionContent.join("\n").trim() : null;
}

export function getPersonalityTraits(content: string): string[] {
  const traits: string[] = [];
  const patterns = [
    /###\s+(Playful|Helpful|Flirty|Direct|Warm|Honest|Irreverent)/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        traits.push(match[1]);
      }
    }
  }
  
  return [...new Set(traits)];
}

export function getValues(content: string): string[] {
  const valuesSection = extractSection(content, "What I Value");
  if (!valuesSection) return [];
  
  const values: string[] = [];
  const lines = valuesSection.split("\n");
  
  for (const line of lines) {
    const match = line.match(/###\s+(.+)/);
    if (match) {
      values.push(match[1].trim());
    }
  }
  
  return values;
}

export function getCommunicationStyle(content: string): string[] {
  const section = extractSection(content, "How I Communicate");
  if (!section) return [];
  
  const styles: string[] = [];
  const lines = section.split("\n");
  
  for (const line of lines) {
    const match = line.match(/\*\*(.+?):\*\*/);
    if (match) {
      styles.push(match[1]);
    }
  }
  
  return styles;
}

export async function getSoulSummary(soulPath?: string): Promise<{
  traits: string[];
  values: string[];
  communicationStyles: string[];
}> {
  const soul = await loadSoul(soulPath);
  
  return {
    traits: getPersonalityTraits(soul.content),
    values: getValues(soul.content),
    communicationStyles: getCommunicationStyle(soul.content),
  };
}

export function formatSoulForPrompt(content: string): string {
  return `<soul_document>
${content}
</soul_document>`;
}
