import { type Config, loadConfig, validateConfig } from "./config/mod.ts";
import {
  closeDatabase,
  getDatabase,
  initializeAsyncDatabase,
  initializeDatabase,
} from "./storage/mod.ts";
import { createBot, setupBot, startBot, stopBot } from "./bot/mod.ts";
import { createElevenLabsService } from "./elevenlabs/mod.ts";
import { createBraveSearchService } from "./brave/mod.ts";
import { createCalendarService } from "./calendar/mod.ts";
import { initializeAgent } from "./agent/mod.ts";
import { toolRegistry } from "./agent/tools.ts";
import { getMemoryRepository } from "./storage/memory/mod.ts";
import { getScheduler, initializeScheduler } from "./scheduler/mod.ts";
import { initializeMessaging } from "./bot/messaging.ts";
import { createShellEnvironment } from "./shell/mod.ts";
import { getMessageQueue, initializeMessageQueue, waitForQueueCompletion } from "./queue/mod.ts";
import { createBrowserService } from "./browser/mod.ts";
import { createVisionService } from "./vision/mod.ts";
import { createPhotoService } from "./photo/mod.ts";

let isShuttingDown = false;

async function main(): Promise<void> {
  console.log("Starting Aria Personal Assistant...");

  const config = await loadConfig();
  validateConfig(config);

  console.log("Configuration loaded successfully");

  await initializeDatabase({ path: config.database?.path || "./data/aria.db" });
  console.log("Database initialized");

  initializeAsyncDatabase(getDatabase());
  console.log("Async database layer initialized");

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

  if (config.shell && config.shell.mounts.length > 0) {
    const shellEnv = createShellEnvironment(config.shell);
    toolRegistry.setShellEnvironment(shellEnv);
    console.log(`Shell environment initialized with ${config.shell.mounts.length} mount(s)`);
  } else {
    console.log("Shell not configured - shell commands disabled");
  }

  if (config.browser) {
    try {
      const browserService = createBrowserService(config.browser);
      await browserService.connect();
      toolRegistry.setBrowserService(browserService);
      console.log("Browser service connected");
    } catch (error) {
      console.error(
        "Failed to connect browser service:",
        error instanceof Error ? error.message : error,
      );
      console.log("Browser service disabled due to connection failure");
    }
  } else {
    console.log("Browser not configured - browser automation disabled");
  }

  const visionConfig: {
    apiKey: string;
    model: string;
    maxTokens: number;
    httpReferer?: string;
  } = {
    apiKey: config.openrouter.apiKey,
    model: config.openrouter.visionModel ?? config.openrouter.defaultModel,
    maxTokens: config.openrouter.maxTokens,
  };
  if (config.openrouter.httpReferer !== undefined) {
    visionConfig.httpReferer = config.openrouter.httpReferer;
  }
  const visionService = createVisionService(visionConfig);
  toolRegistry.setVisionService(visionService);
  console.log("Vision service initialized");

  const photoService = createPhotoService();
  toolRegistry.setPhotoService(photoService);
  console.log("Photo service initialized");

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

  initializeMessageQueue(config, bot);
  console.log("Message queue initialized");

  const schedulerConfig = {
    checkInterval: config.scheduler?.checkInterval ?? 1000,
    maxConcurrent: config.scheduler?.maxConcurrent ?? 5,
  };
  const scheduler = initializeScheduler(schedulerConfig);
  scheduler.initialize(bot, config);
  scheduler.start();
  console.log("Scheduler started");

  setupShutdownHandlers(bot, config);

  await startBot(bot);
}

function setupShutdownHandlers(bot: ReturnType<typeof createBot>, config: Config): void {
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nShutting down gracefully...");

    const scheduler = getScheduler();
    if (scheduler) {
      scheduler.stop();
    }

    const shutdownTimeout = config.queue?.shutdownTimeout ?? 30000;

    try {
      const messageQueue = getMessageQueue();
      messageQueue.stop();
      console.log("Message queue stopped, waiting for running tasks...");

      waitForQueueCompletion(shutdownTimeout).then(() => {
        console.log("All tasks completed");
        finishShutdown(bot);
      }).catch((error) => {
        console.error("Error waiting for tasks:", error);
        finishShutdown(bot);
      });
    } catch {
      finishShutdown(bot);
    }
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
}

function finishShutdown(bot: ReturnType<typeof createBot>): void {
  stopBot(bot);
  closeDatabase();
  console.log("Goodbye!");
  Deno.exit(0);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
