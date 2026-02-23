# Aria - Personal Assistant

A personal assistant built with TypeScript and Deno, communicating via Telegram, powered by OpenRouter LLMs.

## Features

- 🤖 Telegram bot interface
- 🧠 LLM integration via OpenRouter
- 🔧 Extensible via MCP servers and internal skills
- 📅 Task scheduling and notifications
- 🖥️ Secure shell access with smart approval workflows
- 📝 SQLite persistence

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
├── src/
│   ├── bot/           # Telegram bot handlers and middleware
│   ├── config/        # Configuration loading and types
│   ├── storage/       # SQLite database layer
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

## License

MIT
