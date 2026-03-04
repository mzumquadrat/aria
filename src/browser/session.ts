import { CDPClient } from "./cdp.ts";
import type { BrowserConfig, TabInfo } from "./types.ts";

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  title?: string;
  attached?: boolean;
}

export class BrowserSession {
  private client: CDPClient;
  private activeTargetId: string | null = null;
  private sessionId: string | null = null;
  private targets = new Map<string, TargetInfo>();
  private config: BrowserConfig;
  private initialConnect = true;

  constructor(config: BrowserConfig) {
    this.config = config;
    this.client = new CDPClient(config.cdpEndpoint, config.defaultTimeout);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.setupEventHandlers();
    await this.discoverAndAttachTargets();
    this.initialConnect = false;
  }

  private setupEventHandlers(): void {
    this.client.on("Target.targetCreated", (event) => {
      if (event.params && "targetInfo" in event.params) {
        const info = event.params.targetInfo as TargetInfo;
        this.targets.set(info.targetId, info);
      }
    });

    this.client.on("Target.targetDestroyed", (event) => {
      if (event.params && "targetId" in event.params) {
        this.targets.delete(event.params.targetId as string);
      }
    });

    this.client.on("Target.targetInfoChanged", (event) => {
      if (event.params && "targetInfo" in event.params) {
        const info = event.params.targetInfo as TargetInfo;
        this.targets.set(info.targetId, info);
      }
    });
  }

  private async discoverAndAttachTargets(): Promise<void> {
    await this.client.send("Target.setDiscoverTargets", { discover: true });

    const result = await this.client.send<{ targetInfos: TargetInfo[] }>("Target.getTargets");
    for (const target of result.targetInfos) {
      this.targets.set(target.targetId, target);
    }

    const pageTarget = result.targetInfos.find((t) => t.type === "page");
    if (pageTarget) {
      this.activeTargetId = pageTarget.targetId;
      await this.enablePageDomains();
    }
  }

  async reconnect(): Promise<void> {
    const previousTargetId = this.activeTargetId;
    
    this.activeTargetId = null;
    this.sessionId = null;
    this.targets.clear();

    await this.client.reconnect();
    this.setupEventHandlers();
    await this.discoverAndAttachTargets();

    if (previousTargetId && this.targets.has(previousTargetId)) {
      await this.attachToTarget(previousTargetId);
    }
  }

  private async enablePageDomains(): Promise<void> {
    const sessionId = this.sessionId ?? undefined;
    await this.client.send("Page.enable", {}, sessionId);
    await this.client.send("Runtime.enable", {}, sessionId);
    await this.client.send("DOM.enable", {}, sessionId);
    await this.client.send("Network.enable", {}, sessionId);
  }

  disconnect(): void {
    this.client.disconnect();
    this.activeTargetId = null;
    this.sessionId = null;
    this.targets.clear();
  }

  private async attachToTarget(targetId: string): Promise<void> {
    if (this.initialConnect && targetId === this.activeTargetId) {
      await this.enablePageDomains();
      return;
    }

    const result = await this.client.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );

    this.activeTargetId = targetId;
    this.sessionId = result.sessionId;

    await this.enablePageDomains();
  }

  async createNewTab(url?: string): Promise<TabInfo> {
    const result = await this.client.send<{ targetId: string }>("Target.createTarget", {
      url: url ?? "about:blank",
    });

    const targetId = result.targetId;

    await new Promise<void>((resolve) => {
      const checkTarget = (): void => {
        const target = this.targets.get(targetId);
        if (target) {
          resolve();
        } else {
          setTimeout(checkTarget, 50);
        }
      };
      checkTarget();
    });

    await this.attachToTarget(targetId);

    return this.getTabInfo(targetId);
  }

  async closeTab(tabId: string): Promise<void> {
    if (tabId === this.activeTargetId) {
      const otherTabs = Array.from(this.targets.entries())
        .filter(([id, info]) => id !== tabId && info.type === "page");

      if (otherTabs.length > 0) {
        await this.attachToTarget(otherTabs[0][0]);
      }
    }

    await this.client.send("Target.closeTarget", { targetId: tabId });
  }

  async switchToTab(tabId: string): Promise<TabInfo> {
    const target = this.targets.get(tabId);
    if (!target) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    if (tabId !== this.activeTargetId) {
      await this.attachToTarget(tabId);
    }

    return this.getTabInfo(tabId);
  }

  listTabs(): TabInfo[] {
    const tabs: TabInfo[] = [];

    for (const [id, info] of this.targets) {
      if (info.type === "page") {
        tabs.push({
          id,
          url: info.url,
          title: info.title ?? "",
          isActive: id === this.activeTargetId,
        });
      }
    }

    return tabs;
  }

  private getTabInfo(targetId: string): TabInfo {
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`Target not found: ${targetId}`);
    }

    return {
      id: targetId,
      url: target.url,
      title: target.title ?? "",
      isActive: targetId === this.activeTargetId,
    };
  }

  getClient(): CDPClient {
    return this.client;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getActiveTargetId(): string | null {
    return this.activeTargetId;
  }

  getConfig(): BrowserConfig {
    return this.config;
  }

  get connected(): boolean {
    return this.client.connected;
  }
}
