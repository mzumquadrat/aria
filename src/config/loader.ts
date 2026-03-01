import type { Config } from "./types.ts";
import { ConfigSchema } from "./types.ts";
import { load as loadEnv } from "@std/dotenv";
import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";

export async function loadConfig(configPath?: string): Promise<Config> {
  await loadEnv({ export: true });
  
  const envConfig = loadFromEnv();
  
  const filePath = configPath || join(Deno.cwd(), "config.yaml");
  let fileConfig: Record<string, unknown> = {};
  
  try {
    const content = await Deno.readTextFile(filePath);
    fileConfig = parseYaml(content) as Record<string, unknown>;
  } catch {
    console.warn(`Config file not found at ${filePath}, using environment variables only`);
  }
  
  const mergedConfig = deepMerge(fileConfig, envConfig);
  
  return ConfigSchema.parse(mergedConfig);
}

function loadFromEnv(): Record<string, unknown> {
  return {
    telegram: {
      botToken: Deno.env.get("TELEGRAM_BOT_TOKEN"),
      allowedUserId: Deno.env.get("TELEGRAM_USER_ID") 
        ? parseInt(Deno.env.get("TELEGRAM_USER_ID")!, 10) 
        : undefined,
    },
    openrouter: {
      apiKey: Deno.env.get("OPENROUTER_API_KEY"),
      httpReferer: Deno.env.get("HTTP_REFERER"),
    },
    elevenlabs: {
      apiKey: Deno.env.get("ELEVENLABS_API_KEY"),
      voiceId: Deno.env.get("ELEVENLABS_VOICE_ID"),
      modelId: Deno.env.get("ELEVENLABS_MODEL_ID"),
      sttModelId: Deno.env.get("ELEVENLABS_STT_MODEL_ID"),
    },
    brave: {
      apiKey: Deno.env.get("BRAVE_API_KEY"),
      baseUrl: Deno.env.get("BRAVE_API_BASE_URL"),
      count: Deno.env.get("BRAVE_SEARCH_COUNT") 
        ? parseInt(Deno.env.get("BRAVE_SEARCH_COUNT")!, 10) 
        : undefined,
    },
    calendar: {
      caldav: Deno.env.get("CALDAV_SERVER_URL") ? {
        serverUrl: Deno.env.get("CALDAV_SERVER_URL"),
        username: Deno.env.get("CALDAV_USERNAME"),
        password: Deno.env.get("CALDAV_PASSWORD"),
        defaultCalendar: Deno.env.get("CALDAV_DEFAULT_CALENDAR"),
      } : undefined,
      google: Deno.env.get("GOOGLE_CALENDAR_ACCESS_TOKEN") ? {
        accessToken: Deno.env.get("GOOGLE_CALENDAR_ACCESS_TOKEN"),
        refreshToken: Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN"),
        clientId: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID"),
        clientSecret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET"),
        defaultCalendar: Deno.env.get("GOOGLE_CALENDAR_DEFAULT"),
      } : undefined,
    },
    database: {
      path: Deno.env.get("DATABASE_PATH"),
    },
    logging: {
      level: Deno.env.get("LOG_LEVEL") as "debug" | "info" | "warn" | "error" | undefined,
    },
    subsonic: Deno.env.get("SUBSONIC_SERVER_URL") ? {
      serverUrl: Deno.env.get("SUBSONIC_SERVER_URL"),
      username: Deno.env.get("SUBSONIC_USERNAME"),
      password: Deno.env.get("SUBSONIC_PASSWORD"),
      defaultPlaylistPrefix: Deno.env.get("SUBSONIC_DEFAULT_PLAYLIST_PREFIX"),
    } : undefined,
    lastfm: Deno.env.get("LASTFM_API_KEY") ? {
      apiKey: Deno.env.get("LASTFM_API_KEY"),
      username: Deno.env.get("LASTFM_USERNAME"),
      cacheExpiryDays: Deno.env.get("LASTFM_CACHE_EXPIRY_DAYS") 
        ? parseInt(Deno.env.get("LASTFM_CACHE_EXPIRY_DAYS")!, 10) 
        : undefined,
      rateLimitPerSecond: Deno.env.get("LASTFM_RATE_LIMIT") 
        ? parseInt(Deno.env.get("LASTFM_RATE_LIMIT")!, 10) 
        : undefined,
    } : undefined,
  };
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      key in target &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined && sourceValue !== null) {
      result[key] = sourceValue;
    }
  }
  
  return result;
}

export function validateConfig(config: Config): void {
  if (!config.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  
  if (!config.openrouter.apiKey) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
}
