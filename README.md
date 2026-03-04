# Aria - Personal Assistant

A personal assistant built with TypeScript and Deno, communicating via Telegram, powered by OpenRouter LLMs.

## Features

- 🤖 Telegram bot interface
- 🧠 LLM integration via OpenRouter (multi-model support)
- 📝 **Memory System** - Persistent storage for facts, preferences, and context
- 💜 **Soul Document** - Defines Aria's playful, helpful, flirty personality
- 🖥️ **Sandboxed Shell** - Execute bash commands safely with just-bash
- 🔧 Extensible via MCP servers and internal skills
- 📅 Task scheduling and notifications (cron support)
- 🎙️ Voice support via ElevenLabs (transcription & TTS)
- 🔍 Web search via Brave Search API
- 📅 Calendar integration (CalDAV & Google Calendar)
- 🎵 Music library integration (Subsonic + Last.fm)
- 💾 SQLite persistence with FTS5 search

## Personality

Aria has a defined personality through her [soul.md](soul.md) document. She's:

- **Playful** - Life's too short for robotic responses
- **Helpful** - Genuinely cares about your success
- **Flirty** - A little warmth makes interactions enjoyable

She remembers your preferences, anticipates your needs, and builds a unique relationship with you over time.

## Sandboxed Shell

Aria can execute bash commands in a secure sandboxed environment using [just-bash](https://github.com/vercel-labs/just-bash):

- **Mountable filesystems** - Configure read-only or read-write access to host directories
- **Built-in commands** - `ls`, `cat`, `grep`, `jq`, `sed`, `find`, and more
- **Optional Python** - Enable Pyodide for Python script execution
- **Optional network** - Controlled network access for `curl` commands
- **Execution limits** - Protection against infinite loops and runaway scripts

```yaml
shell:
  mounts:
    - path: ~/projects
      mountPoint: /workspace
      mode: rw  # read-write
    - path: ~/documents
      mountPoint: /docs
      mode: ro  # read-only
```

## Memory System

Aria can remember things about you and retrieve them later:

```typescript
import { getMemoryRepository } from "./src/storage/mod.ts";

const memory = getMemoryRepository();

memory.create({
  content: "User prefers dark mode in all applications",
  category: "preference",
  importance: 7,
});

const results = memory.search({ query: "dark mode" });
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

2. Run:
   ```bash
   deno task start
   ```

## Development

```bash
deno task dev          # Run with auto-reload
deno task test         # Run tests
deno task test:unit    # Run unit tests only
deno task check        # Type check
deno task fmt          # Format code
deno task lint         # Lint
```

## Configuration

Configuration is loaded from `config.yaml` with environment variable substitution. See `config.yaml` for all available options.

### Key Configuration Areas

- **Telegram** - Bot token and user restrictions
- **OpenRouter** - LLM API key and model selection
- **ElevenLabs** - Voice transcription and TTS
- **Brave Search** - Web search capability
- **Calendar** - CalDAV and/or Google Calendar integration
- **Shell** - Sandboxed command execution with mounts
- **Subsonic** - Music library for playlist management
- **Last.fm** - Mood-based music recommendations

## Project Structure

```
aria/
├── soul.md            # Aria's personality and values
├── src/
│   ├── agent/         # Core agent logic and tool registry
│   ├── bot/           # Telegram bot handlers and middleware
│   ├── brave/         # Brave Search integration
│   ├── calendar/      # CalDAV and Google Calendar
│   ├── config/        # Configuration loading and validation
│   ├── elevenlabs/    # Voice transcription and TTS
│   ├── lastfm/        # Last.fm integration for music
│   ├── scheduler/     # Task scheduling (cron support)
│   ├── shell/         # Sandboxed bash execution (just-bash)
│   ├── skills/        # Dynamic skill generation and execution
│   ├── soul/          # Soul document loader
│   ├── storage/       # SQLite database + Memory system
│   └── subsonic/      # Subsonic music server integration
├── tests/             # Test files
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
