import { assertEquals } from "@std/assert";
import { MountConfigSchema, ShellConfigSchema } from "../../src/config/types.ts";

Deno.test("ShellConfigSchema - defaults", () => {
  const result = ShellConfigSchema.parse({});

  assertEquals(result.mounts, []);
  assertEquals(result.timeout, 30000);
  assertEquals(result.enablePython, false);
  assertEquals(result.enableNetwork, false);
  assertEquals(result.executionLimits, undefined);
});

Deno.test("ShellConfigSchema - custom values", () => {
  const result = ShellConfigSchema.parse({
    mounts: [
      { path: "/home/user/projects", mountPoint: "/workspace", mode: "rw" },
    ],
    timeout: 60000,
    enablePython: true,
    enableNetwork: true,
    executionLimits: {
      maxCallDepth: 50,
      maxCommandCount: 5000,
      maxLoopIterations: 5000,
    },
  });

  assertEquals(result.mounts.length, 1);
  assertEquals(result.mounts[0].path, "/home/user/projects");
  assertEquals(result.mounts[0].mountPoint, "/workspace");
  assertEquals(result.mounts[0].mode, "rw");
  assertEquals(result.timeout, 60000);
  assertEquals(result.enablePython, true);
  assertEquals(result.enableNetwork, true);
  assertEquals(result.executionLimits?.maxCallDepth, 50);
});

Deno.test("MountConfigSchema - defaults mode to ro", () => {
  const result = MountConfigSchema.parse({
    path: "/home/user/docs",
    mountPoint: "/docs",
  });

  assertEquals(result.mode, "ro");
});

Deno.test("MountConfigSchema - explicit rw mode", () => {
  const result = MountConfigSchema.parse({
    path: "/home/user/workspace",
    mountPoint: "/workspace",
    mode: "rw",
  });

  assertEquals(result.mode, "rw");
});
