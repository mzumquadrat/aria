import { loadConfig, validateConfig } from "./config/mod.ts";
import { initializeDatabase, closeDatabase } from "./storage/mod.ts";
import { createBot, setupBot, startBot, stopBot } from "./bot/mod.ts";
import { createElevenLabsService } from "./elevenlabs/mod.ts";

let isShuttingDown = false;

async function main(): Promise<void> {
  console.log("Starting Aria Personal Assistant...");

  const config = await loadConfig();
  validateConfig(config);

  console.log("Configuration loaded successfully");

  await initializeDatabase({ path: config.database?.path || "./data/aria.db" });
  console.log("Database initialized");

  const bot = createBot(config);
  
  const elevenLabs = config.elevenlabs 
    ? createElevenLabsService(config.elevenlabs) 
    : undefined;
  
  if (elevenLabs) {
    console.log("ElevenLabs service initialized");
  } else {
    console.log("ElevenLabs not configured - voice features disabled");
  }
  
  setupBot(bot, config, elevenLabs);
  console.log("Bot configured");

  setupShutdownHandlers(bot);

  await startBot(bot);
}

function setupShutdownHandlers(bot: ReturnType<typeof createBot>): void {
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nShutting down gracefully...");
    
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
