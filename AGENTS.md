# AGENTS.md - Guidelines for AI Coding Agents

This document provides essential information for AI coding agents working in the Aria Personal Assistant codebase.

## Project Overview

Aria is a personal assistant built with TypeScript and Deno. It features:
- Telegram bot interface via grammY
- LLM integration via OpenRouter (multi-model support)
- SQLite persistence with memory system and FTS5 search
- Extensible skill system and MCP server integration
- Task scheduling and notifications

## Build, Lint, and Test Commands

### Development
```bash
deno task dev          # Run with watch mode
deno task start        # Run in production mode
just run               # Alternative: run the application
just dev               # Alternative: run with watch mode
```

### Building
```bash
just build             # Compile to binary (x86_64-unknown-linux-gnu)
just dist              # Build + package as tarball with config files
```

### Linting and Formatting
```bash
deno task lint         # Run deno lint
deno task fmt          # Format code
deno task fmt:check    # Check formatting without modifying
deno task check        # Type check only
```

### Testing

**Run all tests:**
```bash
deno task test         # Run all tests
deno task test:unit    # Run unit tests only
deno task test:coverage # Run with coverage report
```

**Run a single test file:**
```bash
deno test --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys --allow-ffi --allow-import tests/unit/markdown_test.ts
```

**Run a single test by name (using filter):**
```bash
deno test --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys --allow-ffi --allow-import --filter "escapeMarkdownV2 - escapes special characters" tests/
```

**Test locations:**
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/` (configured, may be empty)
- E2E tests: `tests/e2e/` (configured, may be empty)

## Code Style Guidelines

### Import Conventions

**Use relative imports with `.ts` extension:**
```typescript
import { loadConfig } from "./config/mod.ts";
import type { Config } from "./config/mod.ts";
```

**Import order:**
1. External dependencies (Deno modules, npm packages)
2. Internal modules (relative paths)
3. Type imports using `import type`

**Module structure:**
- Each module has a `mod.ts` barrel file that re-exports public APIs
- Types go in `types.ts` files
- Repository pattern: `repository.ts` for data access

### TypeScript Types

**Interfaces vs Types:**
- Use `interface` for object shapes and data structures
- Use `type` for unions, aliases, and complex types

**Runtime validation with Zod:**
```typescript
export const ShellConfigSchema = z.object({
  allowedDirectories: z.array(z.string()).default([]),
});
export type ShellConfig = z.infer<typeof ShellConfigSchema>;
```

**Always use explicit return types:**
```typescript
export async function handleMessage(ctx: Context): Promise<void>
export function createSkill(skill: SkillDefinition): SkillRecord
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables/Functions | `camelCase` | `toolRegistry`, `getSkillByName` |
| Classes | `PascalCase` | `ToolRegistry`, `MemoryRepository` |
| Interfaces | `PascalCase` | `SkillRecord`, `ToolResult` |
| Constants | `SCREAMING_SNAKE_CASE` | `BUILTIN_TOOLS`, `SYSTEM_PROMPT` |
| Files | `camelCase.ts` or `kebab-case.ts` | `executor.ts`, `message.ts` |
| Test files | `<module>_test.ts` | `memory_test.ts` |

### Error Handling

**Return result objects with success/error flags:**
```typescript
export interface ToolResult {
  tool: string;
  success: boolean;
  output?: unknown;
  error?: string | undefined;
}
```

**Use try-catch with proper error typing:**
```typescript
try {
  const result = await this.service.execute(input);
  return { success: true, output: result };
} catch (error) {
  return { 
    success: false, 
    error: error instanceof Error ? error.message : "Operation failed" 
  };
}
```

**Early returns for guard clauses:**
```typescript
if (!this.service) {
  return { success: false, error: "Service not configured" };
}
```

### Async Patterns

**Always use async/await (no raw Promise chains):**
```typescript
async function processMessage(message: string): Promise<string> {
  const config = await loadConfig();
  const result = await agent.process(message);
  return result;
}
```

### Function Styles

- **Named functions** for exported functions and class methods
- **Arrow functions** for callbacks, middleware, and inline functions
- **Factory functions** for creating services and middleware

### Class Patterns

- Classes for stateful services only
- Private methods for implementation details
- Singleton pattern via module-level state:
```typescript
let instance: Service | null = null;

export function getService(): Service {
  if (!instance) {
    throw new Error("Service not initialized");
  }
  return instance;
}
```

### Comments and Documentation

- Code should be self-documenting with clear naming
- Avoid inline comments; use descriptive variable names instead
- Error messages serve as documentation
- Use `console.log`, `console.warn`, `console.error` for status output

## Testing Patterns

**Test structure:**
```typescript
Deno.test("ModuleName - specific behavior", async () => {
  await setupTest();
  // test body
  teardownTest();
});
```

**Assertions (use `@std/assert`):**
```typescript
import { assertEquals } from "@std/assert";

assertEquals(result, expected);
assertEquals(typeof value, "string");
assertEquals(condition, true);
```

**Test naming pattern:** `<Module/Function> - <specific behavior>`

## Project-Specific Conventions

- **Personality**: Aria has a defined personality in `soul.md` (playful, helpful, flirty). When modifying behavior, maintain consistency with this personality.
- **Security**: Shell access has multi-layer security (allowed/denied directories, approval workflows). Preserve these patterns.
- **Memory system**: Uses SQLite with FTS5 for persistent facts/preferences.
- **Configuration**: YAML-based config in `config.yaml` with Zod validation.

## Key File Locations

```
src/
├── mod.ts           # Root exports
├── main.ts          # Application entry point
├── types.ts         # Shared types
├── agent/           # Core AI agent (LLM integration, tools)
├── bot/             # Telegram bot (handlers, middleware)
├── config/          # Configuration loading and validation
├── skills/          # Skill system (execution, generation)
├── storage/         # SQLite persistence and memory
├── scheduler/       # Task scheduling
└── brave/           # Brave Search integration

config.yaml          # Main configuration file
soul.md              # Personality definition
deno.json            # Deno configuration and tasks
justfile             # Build recipes
```
