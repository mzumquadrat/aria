import type { Context } from "grammy";
import type { Config } from "../../config/mod.ts";

export function createAuthMiddleware(config: Config) {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    if (!ctx.from) {
      return;
    }

    const allowedUserId = config.telegram.allowedUserId;
    
    if (allowedUserId && ctx.from.id !== allowedUserId) {
      console.warn(`Unauthorized access attempt from user ${ctx.from.id}`);
      await ctx.reply("Sorry, you are not authorized to use this bot.");
      return;
    }

    await next();
  };
}
