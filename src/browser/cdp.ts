import type { CDPCommand, CDPEvent, CDPResponse } from "./types.ts";

type CommandResolver = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type EventHandler = (event: CDPEvent) => void;

interface DevToolsTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export class CDPClient {
  private ws: WebSocket | null = null;
  private commandId = 0;
  private pendingCommands = new Map<number, CommandResolver>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private defaultTimeout: number;
  private isConnected = false;
  private endpoint: string;

  constructor(
    endpoint: string,
    defaultTimeout = 30000,
  ) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.defaultTimeout = defaultTimeout;
  }

  async connect(): Promise<void> {
    const wsUrl = await this.getWebSocketDebuggerUrl();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log("[CDP] Connected to browser");
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error("[CDP] Failed to parse message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[CDP] WebSocket error:", error);
        if (!this.isConnected) {
          reject(new Error("Failed to connect to CDP endpoint"));
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log("[CDP] Disconnected from browser");
        this.rejectAllPending("Connection closed");
      };
    });
  }

  private async getWebSocketDebuggerUrl(): Promise<string> {
    const jsonUrl = `${this.endpoint}/json`;

    // First, try Chrome-style /json endpoint for WebSocket discovery
    try {
      const response = await fetch(jsonUrl);
      if (response.ok) {
        const targets: DevToolsTarget[] = await response.json();

        if (targets && targets.length > 0) {
          const pageTarget = targets.find((t) => t.type === "page");
          const target = pageTarget ?? targets[0];

          if (target.webSocketDebuggerUrl) {
            console.log(`[CDP] Found target: ${target.title} (${target.url})`);
            return target.webSocketDebuggerUrl;
          }
        }
      }
    } catch {
      // /json endpoint not available, try direct WebSocket (Lightpanda mode)
    }

    // Fall back to direct WebSocket connection (for Lightpanda and similar browsers)
    // Convert HTTP URL to WebSocket URL
    const wsUrl = this.endpoint.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
    console.log(`[CDP] Using direct WebSocket connection: ${wsUrl}`);
    return wsUrl;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
    this.rejectAllPending("Client disconnected");
  }

  private handleMessage(message: CDPResponse | CDPEvent): void {
    if ("id" in message) {
      const pending = this.pendingCommands.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.id);

        if (message.error) {
          pending.reject(new Error(`CDP error ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if ("method" in message) {
      const handlers = this.eventHandlers.get(message.method);
      if (handlers) {
        for (const handler of handlers) {
          handler(message);
        }
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
      this.pendingCommands.delete(id);
    }
  }

  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeout?: number,
  ): Promise<T> {
    if (!this.ws || !this.isConnected) {
      throw new Error("Not connected to browser");
    }

    const id = ++this.commandId;
    const command: CDPCommand = { id, method };
    if (params !== undefined) command.params = params;
    if (sessionId !== undefined) command.sessionId = sessionId;

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = timeout ?? this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      this.ws!.send(JSON.stringify(command));
    });
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
