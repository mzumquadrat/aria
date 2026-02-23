import { assertEquals } from "@std/assert";
import { ShellConfigSchema } from "../../src/config/types.ts";

Deno.test("ShellConfigSchema - defaults", () => {
  const result = ShellConfigSchema.parse({});
  
  assertEquals(result.allowedDirectories, []);
  assertEquals(result.deniedDirectories, []);
  assertEquals(result.allowedCommands, []);
  assertEquals(result.deniedCommands, []);
  assertEquals(result.timeout, 30000);
  assertEquals(result.rateLimit, undefined);
});

Deno.test("ShellConfigSchema - custom values", () => {
  const result = ShellConfigSchema.parse({
    allowedDirectories: ["/home/user"],
    timeout: 60000,
    rateLimit: {
      maxPerMinute: 20,
      maxPerHour: 200,
    },
  });
  
  assertEquals(result.allowedDirectories, ["/home/user"]);
  assertEquals(result.timeout, 60000);
  assertEquals(result.rateLimit?.maxPerMinute, 20);
  assertEquals(result.rateLimit?.maxPerHour, 200);
});
