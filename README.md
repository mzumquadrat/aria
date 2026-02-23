# Aria - Personal Assistant

A personal assistant built with TypeScript and Deno, communicating via Telegram, powered by OpenRouter LLMs.

## Features

- 🤖 Telegram bot interface
- 🧠 LLM integration via OpenRouter
- 📝 **Memory System** - Persistent storage for facts, preferences, and context
- 💜 **Soul Document** - Defines Aria's playful, helpful, flirty personality
- 🔧 Extensible via MCP servers and internal skills
- 📅 Task scheduling and notifications
- 🖥️ Secure shell access with smart approval workflows
- 💾 SQLite persistence

## Personality

Aria has a defined personality through her [soul.md](soul.md) document. She's:

- **Playful** - Life's too short for robotic responses
- **Helpful** - Genuinely cares about your success
- **Flirty** - A little warmth makes interactions enjoyable

She remembers your preferences, anticipates your needs, and builds a unique relationship with you over time.

## Memory System

Aria can remember things about you and retrieve them later:

```typescript
import { getMemoryRepository } from "./src/storage/mod.ts";

const memory = getMemoryRepository();

// Store a memory
memory.create({
  content: "User prefers dark mode in all applications",
  category: "preference",
  importance: 7
});

// Search memories
const results = memory.search({ query: "dark mode" });

// Get important memories
const important = memory.getImportant(5);
```

### Memory Categories
- `preference` - User preferences and settings
- `fact` - Important facts about the user
- `conversation` - Notable conversation highlights
- `task` - Task-related memories
- `reminder` - Reminders and follow-ups
- `note` - General notes
- `general` - Default category

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies and run:
   ```bash
   deno task start
   ```

## Development

```bash
# Run in development mode with auto-reload
deno task dev

# Run tests
deno task test

# Type check
deno task check

# Format code
deno task fmt

# Lint
deno task lint
```

## Configuration

Configuration is loaded from `config.yaml` with environment variable substitution. See `config.yaml` for available options.

## Project Structure

```
aria/
├── soul.md            # Aria's personality and values
├── src/
│   ├── bot/           # Telegram bot handlers and middleware
│   ├── config/        # Configuration loading and types
│   ├── storage/       # SQLite database + Memory system
│   │   └── memory/    # Memory repository with FTS search
│   ├── soul/          # Soul document loader and parser
│   ├── agent/         # Core agent logic (planned)
│   ├── llm/           # OpenRouter integration (planned)
│   ├── mcp/           # MCP client (planned)
│   ├── skills/        # Skill system (planned)
│   ├── scheduler/     # Task scheduling (planned)
│   └── shell/         # Secure shell execution (planned)
├── tests/             # Test files
├── docs/              # Documentation
└── config.yaml        # Configuration file
```

## Soul Document

The `soul.md` file defines who Aria is - her values, communication style, and relationship with users. It's loaded at startup and shapes how she interacts.

Key sections:
- **Who I Am** - Core identity
- **How I Show Up** - Personality traits (playful, helpful, flirty)
- **What I Value** - Your time, trust, autonomy, and relationship
- **How I Communicate** - Direct but warm, context-aware, honest
- **My Relationship With Memory** - How she persists across sessions

## Memory Architecture

The memory system uses SQLite with FTS5 (Full-Text Search) for semantic retrieval:

- **Storage**: Content, category, importance, metadata, timestamps
- **Search**: FTS5 for fast text search with relevance ranking
- **Access Tracking**: Last accessed time and access count
- **Categories**: Structured organization for different memory types

## License

MIT
