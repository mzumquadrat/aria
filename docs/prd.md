# PRD: Personal Assistant (Aria)

## 1. Executive Summary

A personal assistant application built with TypeScript and Deno, communicating via Telegram Bot API, powered by OpenRouter LLMs. The assistant features extensible MCP server architecture, self-extension capabilities, and scheduled task execution.

## 2. Goals & Non-Goals

### Goals

- Day-to-day personal productivity assistance
- Natural language interaction via Telegram
- Extensible via MCP servers and internal skills
- Self-improvement through code generation
- Reliable scheduled task execution
- Secure shell access with smart approval workflows

### Non-Goals

- Multi-user support (single user only)
- Voice/audio interaction
- Mobile app deployment

## 3. Technical Architecture

### 3.1 Stack

| Component     | Technology                   | Rationale                            |
| ------------- | ---------------------------- | ------------------------------------ |
| Runtime       | Deno 2.x                     | Native TypeScript, built-in tooling  |
| Language      | TypeScript 5.x               | Type safety, better DX               |
| Bot Framework | grammY                       | Native Deno support, excellent types |
| LLM Provider  | OpenRouter SDK               | Multi-model access, unified API      |
| Extensibility | MCP (Model Context Protocol) | Standardized tool integration        |
| Database      | SQLite (via Deno SQLite)     | Reliable, embedded, zero-config      |
| Testing       | Deno Test                    | Native test runner, coverage         |
| CI/CD         | Git + GitHub Actions         | Version control and automation       |

### 3.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Telegram API                         │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     grammY Bot Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Commands   │  │   Handlers  │  │ Middleware  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Core Agent Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Router    │  │  Planner    │  │  Executor   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ OpenRouter  │      │ MCP Client  │      │   Skills    │
│   Client    │      │  Manager    │      │   Engine    │
└─────────────┘      └─────────────┘      └─────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │   MCP Servers   │
                     │  (External)     │
                     └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ SQLite   │  │Scheduler │  │  Shell   │  │  Audit   │   │
│  │  Store   │  │ Service  │  │ Manager  │  │  Logger  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 4. Core Features

### 4.1 Telegram Interface

- Natural language conversation
- Command handlers (/help, /status, /tasks, etc.)
- Inline keyboards for approvals and selections
- Rich message formatting (markdown, code blocks)

### 4.2 LLM Integration (OpenRouter)

- Multi-model support via OpenRouter
- Streaming responses
- Tool/function calling support
- Conversation history management
- Model selection per task type

### 4.3 Extensibility System

#### 4.3.1 MCP Server Support

- Load external MCP servers via configuration
- Discovery and registration of tools/resources
- Stdio and SSE transport support
- Lifecycle management (start/stop/reload)

#### 4.3.2 Internal Skills

- TypeScript-based skill modules
- Hot-reloadable skill definitions
- Structured input/output schemas (Zod)
- Permission levels per skill

#### 4.3.3 Self-Extension Capability

- Agent can generate new skills
- Agent can write MCP server code
- Code review and testing workflow
- Safe deployment with rollback

### 4.4 Task Scheduling

- Cron-based scheduling
- One-time future tasks
- Recurring reminders
- Task types:
  - Telegram notifications
  - Shell script execution
  - Skill invocations
  - API calls
- Persistence in SQLite
- Recovery on restart

### 4.5 Shell Access with Security

#### Security Model

1. **Directory Scoping**: Configurable allowed directories
2. **Command Allowlist/Denylist**: Whitelist safe commands, block dangerous ones
3. **Smart Approval Workflow**:
   - Auto-approve: Safe directories, read-only operations, allowlisted commands
   - Require approval: Write operations, sensitive directories, unknown commands
   - Always deny: Dangerous commands (rm -rf /, format, etc.)
4. **Audit Logging**: All shell operations logged with timestamp, command, result
5. **Rate Limiting**: Max commands per minute/hour
6. **Timeout Protection**: Commands killed after configurable timeout

#### Implementation Pattern

```typescript
interface ShellPolicy {
  allowedDirectories: string[];
  deniedDirectories: string[];
  allowedCommands: string[];
  deniedCommands: string[];
  requireApproval: ApprovalRule[];
  timeout: number;
  rateLimit: RateLimit;
}
```

## 5. Data Models

### 5.1 SQLite Schema

```sql
-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Tasks
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('notification', 'script', 'skill', 'api')),
  payload JSON,
  scheduled_for DATETIME,
  recurrence TEXT, -- cron expression or null
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  resource TEXT,
  details JSON,
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Skills
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  description TEXT,
  code TEXT,
  schema JSON,
  enabled BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- MCP Servers
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  command TEXT,
  args JSON,
  env JSON,
  enabled BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'stopped',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 6. Configuration

```yaml
# config.yaml
telegram:
  bot_token: ${TELEGRAM_BOT_TOKEN}
  allowed_user_id: ${TELEGRAM_USER_ID}

openrouter:
  api_key: ${OPENROUTER_API_KEY}
  default_model: anthropic/claude-sonnet-4
  fallback_model: openai/gpt-4o-mini

shell:
  allowed_directories:
    - /home/user/projects
    - /home/user/documents
  denied_directories:
    - /etc
    - /root
    - ~/.ssh
  allowed_commands:
    - ls
    - cat
    - git
    - npm
    - deno
  denied_commands:
    - rm -rf /
    - sudo
    - chmod 777
  timeout: 30000
  rate_limit:
    max_per_minute: 10
    max_per_hour: 100

approval:
  auto_approve_readonly: true
  require_approval_write: true
  approval_timeout: 300 # seconds

scheduler:
  check_interval: 1000 # ms
  max_concurrent: 5

logging:
  level: info
  audit_enabled: true
```

## 7. Testing Strategy

### 7.1 Unit Tests

- Core logic functions
- Shell policy enforcement
- Scheduler logic
- Skill execution

### 7.2 Integration Tests

- Telegram message handling
- OpenRouter API integration
- MCP server communication
- SQLite operations

### 7.3 E2E Tests

- Full conversation flows
- Task scheduling and execution
- Shell command workflows
- Self-extension scenarios

### 7.4 Security Tests

- Policy bypass attempts
- Injection attacks
- Rate limit enforcement

## 8. Project Structure

```
aria/
├── src/
│   ├── bot/
│   │   ├── index.ts
│   │   ├── handlers/
│   │   ├── middleware/
│   │   └── keyboards/
│   ├── agent/
│   │   ├── router.ts
│   │   ├── planner.ts
│   │   ├── executor.ts
│   │   └── context.ts
│   ├── llm/
│   │   ├── openrouter.ts
│   │   ├── tools.ts
│   │   └── history.ts
│   ├── mcp/
│   │   ├── client.ts
│   │   ├── manager.ts
│   │   └── types.ts
│   ├── skills/
│   │   ├── registry.ts
│   │   ├── loader.ts
│   │   └── builtin/
│   ├── scheduler/
│   │   ├── index.ts
│   │   ├── cron.ts
│   │   └── executor.ts
│   ├── shell/
│   │   ├── executor.ts
│   │   ├── policy.ts
│   │   └── sandbox.ts
│   ├── storage/
│   │   ├── sqlite.ts
│   │   ├── migrations/
│   │   └── repositories/
│   ├── audit/
│   │   └── logger.ts
│   └── config/
│       └── loader.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   └── skills.md
├── deno.json
├── deno.lock
├── config.yaml
└── .env.example
```

## 9. Milestones

### Phase 1: Foundation (Week 1-2)

- [x] Project setup (Deno, TypeScript, git)
- [ ] Telegram bot with grammY
- [ ] Basic message handling
- [ ] SQLite setup
- [ ] Configuration system

### Phase 2: Core Agent (Week 3-4)

- [ ] OpenRouter integration
- [ ] Conversation management
- [ ] Basic tool calling
- [ ] Unit tests

### Phase 3: Extensibility (Week 5-6)

- [ ] MCP client implementation
- [ ] Skill registry and loader
- [ ] Built-in skills (weather, calendar, notes)

### Phase 4: Shell & Security (Week 7-8)

- [ ] Shell executor with sandboxing
- [ ] Policy engine
- [ ] Smart approval workflow
- [ ] Audit logging
- [ ] Security tests

### Phase 5: Scheduling (Week 9-10)

- [ ] Task scheduler service
- [ ] Notification tasks
- [ ] Script execution tasks
- [ ] Recurring tasks

### Phase 6: Self-Extension (Week 11-12)

- [ ] Code generation for skills
- [ ] MCP server generation
- [ ] Testing and deployment workflow
- [ ] Integration tests

## 10. Security Considerations

### 10.1 Threats Addressed

- **Prompt Injection**: Sanitize inputs, limit context
- **Command Injection**: Parse and validate all shell commands
- **Path Traversal**: Validate and normalize all file paths
- **Credential Leakage**: Process-scoped env vars, no logging of secrets
- **Denial of Service**: Rate limiting, timeouts, resource quotas

### 10.2 Security Patterns

1. **Defense in Depth**: Multiple layers of security checks
2. **Least Privilege**: Minimum required permissions
3. **Fail Secure**: Default deny on unknown operations
4. **Audit Trail**: Complete logging of all actions
5. **Human-in-the-Loop**: Approval for sensitive operations

## 11. Research: Security Safeguards for AI Agents with Shell Access

Based on research into current best practices (2026), here are the key security patterns for protecting host systems from AI agents with shell access:

### 11.1 Container-Based Sandboxing

- Run agent commands in isolated containers (Docker, Podman)
- Limit container resource allocation (CPU, memory, disk)
- Use read-only filesystems where possible
- Network isolation for containerized workloads

### 11.2 Scoped Tool Permissions

- Define explicit permission boundaries per tool
- Implement capability-based security model
- Tools request permissions, not granted by default
- Time-limited permission tokens

### 11.3 Human-in-the-Loop Gates

- Approval workflows for destructive operations
- Configurable sensitivity thresholds
- Timeout-based auto-reject for pending approvals
- Audit trail of all approvals/denials

### 11.4 Process-Scoped Credentials

- Never inherit parent process environment
- Explicit credential injection per operation
- Credentials destroyed after use
- No persistent storage of secrets

### 11.5 Audit Logging and Observability

- Log all agent actions with full context
- Structured logging for analysis
- Real-time monitoring dashboards
- Alerting on suspicious patterns

### 11.6 OWASP Top 10 for Agentic AI (2026)

1. **Goal Hijacking**: Prevent agent from being redirected to malicious goals
2. **Prompt Injection**: Validate and sanitize all inputs
3. **Rogue Agents**: Implement kill switches and monitoring
4. **Tool Poisoning**: Verify tool integrity before execution
5. **Credential Exposure**: Isolate and protect all credentials
6. **Unauthorized Actions**: Enforce permission boundaries
7. **Data Exfiltration**: Monitor and limit data flows
8. **Denial of Service**: Implement rate limits and quotas
9. **Model Manipulation**: Detect and prevent adversarial inputs
10. **Supply Chain Attacks**: Verify all dependencies and tools

### 11.7 Recommended Implementation

For Aria, we implement a layered security approach:

```typescript
interface SecurityLayer {
  // Layer 1: Command validation
  validateCommand(command: string): ValidationResult;

  // Layer 2: Path sandboxing
  isPathAllowed(path: string): boolean;

  // Layer 3: Permission check
  checkPermission(operation: Operation): PermissionResult;

  // Layer 4: Approval workflow
  requestApproval(operation: Operation): Promise<ApprovalResult>;

  // Layer 5: Execution monitoring
  monitorExecution(process: Process): void;

  // Layer 6: Audit logging
  logAction(action: Action): void;
}
```

This multi-layer approach ensures that even if one layer fails, others provide protection against unauthorized or dangerous operations.
