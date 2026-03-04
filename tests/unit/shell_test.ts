import { assertEquals } from "@std/assert";
import { shellTool } from "../../src/shell/mod.ts";

Deno.test("shellTool - has correct type", () => {
  assertEquals(shellTool.type, "builtin");
});

Deno.test("shellTool - has correct name", () => {
  assertEquals(shellTool.name, "shell");
});

Deno.test("shellTool - has required input schema properties", () => {
  const schema = shellTool.inputSchema as {
    type: string;
    properties: {
      command: { type: string; description: string };
      cwd?: { type: string; description: string };
    };
    required: string[];
  };

  assertEquals(schema.type, "object");
  assertEquals(schema.properties.command.type, "string");
  assertEquals(schema.required, ["command"]);
});

Deno.test("shellTool - has optional cwd property", () => {
  const schema = shellTool.inputSchema as {
    properties: {
      cwd: { type: string; description: string };
    };
  };

  assertEquals(schema.properties.cwd.type, "string");
});
