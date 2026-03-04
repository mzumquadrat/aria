import { loadConfig, validateConfig } from "./config/mod.ts";
import { closeDatabase, initializeDatabase } from "./storage/mod.ts";
import { createBot, setupBot, startBot, stopBot } from "./bot/mod.ts";
import { createElevenLabsService } from "./elevenlabs/mod.ts";
import { createBraveSearchService } from "./brave/mod.ts";
import { createCalendarService } from "./calendar/mod.ts";
import { createSubsonicService } from "./subsonic/mod.ts";
import { createLastfmService, LastfmCache } from "./lastfm/mod.ts";
import { initializeAgent } from "./agent/mod.ts";
import { toolRegistry } from "./agent/tools.ts";
import { getMemoryRepository } from "./storage/memory/mod.ts";
import { getScheduler, initializeScheduler } from "./scheduler/mod.ts";
import { initializeMessaging } from "./bot/messaging.ts";
import { getDatabase } from "./storage/mod.ts";
import { createShellEnvironment } from "./shell/mod.ts";

let isShuttingDown = false;

async function main(): Promise<void> {
  console.log("Starting Aria Personal Assistant...");

  const config = await loadConfig();
  validateConfig(config);

  console.log("Configuration loaded successfully");

  await initializeDatabase({ path: config.database?.path || "./data/aria.db" });
  console.log("Database initialized");

  initializeAgent(config);
  console.log("Agent initialized");

  if (config.brave) {
    const braveService = createBraveSearchService(config.brave);
    toolRegistry.setBraveService(braveService);
    console.log("Brave Search service initialized");
  } else {
    console.log("Brave Search not configured - web search disabled");
  }

  if (config.calendar && (config.calendar.caldav || config.calendar.google)) {
    const calendarService = createCalendarService(config.calendar);
    toolRegistry.setCalendarService(calendarService);
    const providers: string[] = [];
    if (config.calendar.caldav) providers.push("CalDAV");
    if (config.calendar.google) providers.push("Google");
    console.log(`Calendar service initialized (${providers.join(", ")})`);
  } else {
    console.log("Calendar not configured - calendar features disabled");
  }

  if (config.lastfm) {
    const lastfmService = createLastfmService(config.lastfm);
    const db = getDatabase();
    const lastfmCache = new LastfmCache(db);
    lastfmService.setCache(lastfmCache);
    toolRegistry.setLastfmService(lastfmService);
    const usernameInfo = config.lastfm.username ? ` (user: ${config.lastfm.username})` : "";
    console.log(`Last.fm service initialized${usernameInfo}`);
  } else {
    console.log("Last.fm not configured - music recommendations limited");
  }

  if (config.subsonic) {
    const subsonicService = createSubsonicService(config.subsonic);
    toolRegistry.setSubsonicService(subsonicService);
    console.log("Subsonic music service initialized");
  } else {
    console.log("Subsonic not configured - music features disabled");
  }

  if (config.shell && config.shell.mounts.length > 0) {
    const shellEnv = createShellEnvironment(config.shell);
    toolRegistry.setShellEnvironment(shellEnv);
    console.log(`Shell environment initialized with ${config.shell.mounts.length} mount(s)`);
  } else {
    console.log("Shell not configured - shell commands disabled");
  }

  const memoryRepo = getMemoryRepository();
  toolRegistry.setMemoryRepo(memoryRepo);
  console.log("Memory service initialized");

  const bot = createBot(config);

  const elevenLabs = config.elevenlabs ? createElevenLabsService(config.elevenlabs) : undefined;

  if (elevenLabs) {
    console.log("ElevenLabs service initialized");
  } else {
    console.log("ElevenLabs not configured - voice features disabled");
  }

  setupBot(bot, config, elevenLabs);
  console.log("Bot configured");

  initializeMessaging(bot, config);

  const schedulerConfig = {
    checkInterval: config.scheduler?.checkInterval ?? 1000,
    maxConcurrent: config.scheduler?.maxConcurrent ?? 5,
  };
  const scheduler = initializeScheduler(schedulerConfig);
  scheduler.initialize(bot, config);
  scheduler.start();
  console.log("Scheduler started");

  setupShutdownHandlers(bot);

  await startBot(bot);
}

function setupShutdownHandlers(bot: ReturnType<typeof createBot>): void {
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nShutting down gracefully...");

    const scheduler = getScheduler();
    if (scheduler) {
      scheduler.stop();
    }

    stopBot(bot);
    closeDatabase();

    console.log("Goodbye!");
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
