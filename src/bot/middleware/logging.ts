import type { Context } from "grammy";
import type { NextFunction } from "grammy";

export function createLoggingMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;

    console.log(`[REQUEST] User: ${userId}, Chat: ${chatId}, Text: ${text}`);

    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      console.log(`[RESPONSE] Duration: ${duration}ms`);
    }
  };
}
