import { launch } from "@astral/astral";
import type { Browser, Page } from "@astral/astral";
import type { BrowserConfig, TabInfo } from "./types.ts";

let pageIdCounter = 0;
const pageIdMap = new WeakMap<Page, string>();

function getPageId(page: Page): string {
  let id = pageIdMap.get(page);
  if (!id) {
    id = `page_${++pageIdCounter}`;
    pageIdMap.set(page, id);
  }
  return id;
}

export class BrowserSession {
  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    await this.launch();
  }

  private async launch(): Promise<void> {
    const options: { headless: boolean; path?: string } = {
      headless: this.config.headless,
    };

    if (this.config.browserPath) {
      options.path = this.config.browserPath;
    }

    this.browser = await launch(options);

    const pages = this.browser.pages;
    if (pages.length > 0) {
      this.activePage = pages[0];
    } else {
      this.activePage = await this.browser.newPage();
    }

    console.log("[Browser] Launched successfully");
  }

  async reconnect(): Promise<void> {
    await this.close();
    await this.launch();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.activePage = null;
    }
  }

  disconnect(): void {
    if (this.browser) {
      this.browser.close().catch((err: Error) => {
        console.warn("[Browser] Error during disconnect:", err);
      });
      this.browser = null;
      this.activePage = null;
    }
  }

  async createNewTab(url?: string): Promise<TabInfo> {
    if (!this.browser) {
      throw new Error("Browser not connected");
    }

    const page = await this.browser.newPage(url);
    this.activePage = page;

    return this.getTabInfo(page);
  }

  async closeTab(tabId: string): Promise<void> {
    if (!this.browser) {
      throw new Error("Browser not connected");
    }

    const pages = this.browser.pages;
    const page = pages.find((p: Page) => getPageId(p) === tabId);

    if (!page) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    if (pages.length <= 1) {
      throw new Error("Cannot close the last remaining tab");
    }

    if (page === this.activePage) {
      const otherPages = pages.filter((p: Page) => p !== page);
      this.activePage = otherPages[0] ?? null;
    }

    await page.close();
  }

  switchToTab(tabId: string): TabInfo {
    if (!this.browser) {
      throw new Error("Browser not connected");
    }

    const pages = this.browser.pages;
    const page = pages.find((p: Page) => getPageId(p) === tabId);

    if (!page) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    this.activePage = page;

    return this.getTabInfo(page);
  }

  listTabs(): TabInfo[] {
    if (!this.browser) {
      return [];
    }

    return this.browser.pages.map((p: Page) => this.getTabInfo(p));
  }

  private getTabInfo(page: Page): TabInfo {
    let url = "about:blank";
    const title = "";

    try {
      url = page.url || "about:blank";
    } catch {
      // Page might be about:blank or navigating
    }

    return {
      id: getPageId(page),
      url,
      title,
      isActive: page === this.activePage,
    };
  }

  getActivePage(): Page {
    if (!this.activePage) {
      throw new Error("No active page");
    }
    return this.activePage;
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error("Browser not connected");
    }
    return this.browser;
  }

  getConfig(): BrowserConfig {
    return this.config;
  }

  get connected(): boolean {
    return this.browser !== null;
  }
}
