import type { BrowserConfig } from "./types.ts";
import { BrowserSession } from "./session.ts";
import { ApprovalManager } from "./approval.ts";
import { BrowserToolExecutor } from "./tools.ts";

export { BrowserConfigSchema } from "./types.ts";
export type { BrowserConfig } from "./types.ts";
export { BrowserSession } from "./session.ts";
export { ApprovalManager } from "./approval.ts";
export { BrowserToolExecutor, BROWSER_TOOLS } from "./tools.ts";
export { CDPClient } from "./cdp.ts";
export { PageOperations } from "./page.ts";

export interface BrowserService {
  session: BrowserSession;
  executor: BrowserToolExecutor;
  approvalManager: ApprovalManager;
  connect(): Promise<void>;
  disconnect(): void;
  isReady(): boolean;
}

function createBrowserService(config: BrowserConfig): BrowserService {
  const session = new BrowserSession(config);
  const approvalManager = new ApprovalManager(config);
  const executor = new BrowserToolExecutor(session, approvalManager);

  return {
    session,
    executor,
    approvalManager,
    async connect(): Promise<void> {
      await session.connect();
    },
    disconnect(): void {
      session.disconnect();
    },
    isReady(): boolean {
      return session.connected;
    },
  };
}

export { createBrowserService };
