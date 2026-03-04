import type { BrowserSession } from "./session.ts";
import type {
  ClickInput,
  ContentResult,
  EvaluateInput,
  ExtractLinksInput,
  GetContentInput,
  LinkInfo,
  NavigateInput,
  ScreenshotInput,
  ScreenshotResult,
  ScrollInput,
  SelectInput,
  TypeInput,
  WaitForInput,
} from "./types.ts";

interface NodeInfo {
  nodeId: number;
  backendNodeId?: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: NodeInfo[];
  attributes?: string[];
  documentURL?: string;
  baseURL?: string;
}

interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

export class PageOperations {
  constructor(private session: BrowserSession) {}

  private getClient() {
    return this.session.getClient();
  }

  private getSessionId(): string {
    const sessionId = this.session.getSessionId();
    if (!sessionId) {
      throw new Error("No active session");
    }
    return sessionId;
  }

  async navigate(input: NavigateInput): Promise<{ url: string; title: string }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const waitUntil = input.waitUntil ?? "load";

    await client.send(
      "Page.navigate",
      { url: input.url, transitionType: "typed" },
      sessionId,
    );

    await this.waitForLoadState(waitUntil, sessionId);

    const evalResult = await client.send<{ result?: { value?: unknown } }>(
      "Runtime.evaluate",
      { expression: "document.title + '|||' + window.location.href" },
      sessionId,
    );

    const valueStr = String(evalResult.result?.value ?? "");
    const sepIndex = valueStr.indexOf("|||");
    const title = sepIndex >= 0 ? valueStr.substring(0, sepIndex) : "";
    const url = sepIndex >= 0 ? valueStr.substring(sepIndex + 3) : input.url;

    return { url: url || input.url, title: title || "" };
  }

  private async waitForLoadState(state: string, sessionId: string): Promise<void> {
    const client = this.getClient();
    const timeout = this.session.getConfig().defaultTimeout;

    if (state === "domcontentloaded") {
      await client.send(
        "Runtime.evaluate",
        { expression: "new Promise(r => document.readyState !== 'loading' ? r() : document.addEventListener('DOMContentLoaded', r))" },
        sessionId,
        timeout,
      );
    } else if (state === "networkidle") {
      await new Promise<void>((resolve) => {
        let inFlight = 0;
        let idleTimer: number | undefined;

        const checkIdle = (): void => {
          if (idleTimer !== undefined) {
            clearTimeout(idleTimer);
          }
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, 500);
        };

        const cleanup = client.on("Network.requestWillBeSent", () => {
          inFlight++;
          if (idleTimer !== undefined) {
            clearTimeout(idleTimer);
          }
        });

        client.on("Network.responseReceived", () => {
          inFlight--;
          if (inFlight <= 0) {
            checkIdle();
          }
        });

        client.on("Network.loadingFailed", () => {
          inFlight--;
          if (inFlight <= 0) {
            checkIdle();
          }
        });

        checkIdle();

        setTimeout(() => {
          cleanup();
          resolve();
        }, timeout);
      });
    } else {
      await client.send(
        "Runtime.evaluate",
        { expression: "new Promise(r => document.readyState === 'complete' ? r() : window.addEventListener('load', r))" },
        sessionId,
        timeout,
      );
    }
  }

  async click(input: ClickInput): Promise<{ clicked: boolean; selector: string }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const button = input.button ?? "left";
    const clickCount = input.clickCount ?? 1;

    const node = await this.querySelector(input.selector, sessionId);
    if (!node) {
      throw new Error(`Element not found: ${input.selector}`);
    }

    const box = await this.getElementBoxModel(node.nodeId, sessionId);
    if (!box) {
      throw new Error(`Element not visible: ${input.selector}`);
    }

    const x = box.content[0] + (box.width / 2);
    const y = box.content[1] + (box.height / 2);

    await client.send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x, y, button, clickCount },
      sessionId,
    );

    await client.send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", x, y, button, clickCount },
      sessionId,
    );

    return { clicked: true, selector: input.selector };
  }

  async type(input: TypeInput): Promise<{ typed: boolean; selector: string }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const node = await this.querySelector(input.selector, sessionId);
    if (!node) {
      throw new Error(`Element not found: ${input.selector}`);
    }

    await client.send(
      "DOM.focus",
      { nodeId: node.nodeId },
      sessionId,
    );

    if (input.clear) {
      await client.send(
        "Runtime.evaluate",
        { expression: `document.querySelector('${this.escapeSelector(input.selector)}').value = ''` },
        sessionId,
      );
    }

    const delay = input.delay ?? 10;

    for (const char of input.text) {
      await client.send(
        "Input.dispatchKeyEvent",
        { type: "keyDown", text: char },
        sessionId,
      );

      await new Promise((r) => setTimeout(r, delay));

      await client.send(
        "Input.dispatchKeyEvent",
        { type: "keyUp", text: char },
        sessionId,
      );
    }

    return { typed: true, selector: input.selector };
  }

  async select(input: SelectInput): Promise<{ selected: boolean; selector: string; value: string }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const escapedSelector = this.escapeSelector(input.selector);
    const escapedValue = this.escapeValue(input.value);

    await client.send(
      "Runtime.evaluate",
      {
        expression: `
          const select = document.querySelector('${escapedSelector}');
          if (select) {
            select.value = '${escapedValue}';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            true;
          } else {
            false;
          }
        `,
      },
      sessionId,
    );

    return { selected: true, selector: input.selector, value: input.value };
  }

  async screenshot(input: ScreenshotInput = {}): Promise<ScreenshotResult> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
    let width = 0;
    let height = 0;

    if (input.selector) {
      const node = await this.querySelector(input.selector, sessionId);
      if (!node) {
        throw new Error(`Element not found: ${input.selector}`);
      }

      const box = await this.getElementBoxModel(node.nodeId, sessionId);
      if (!box) {
        throw new Error(`Element not visible: ${input.selector}`);
      }

      clip = {
        x: box.content[0],
        y: box.content[1],
        width: box.width,
        height: box.height,
        scale: 1,
      };
      width = box.width;
      height = box.height;
    } else if (input.fullPage) {
      const layout = await client.send<{ contentSize: { width: number; height: number } }>(
        "Page.getLayoutMetrics",
        {},
        sessionId,
      );

      width = layout.contentSize.width;
      height = layout.contentSize.height;
      clip = {
        x: 0,
        y: 0,
        width,
        height,
        scale: 1,
      };
    } else {
      const layout = await client.send<{ visualViewport: { clientWidth: number; clientHeight: number } }>(
        "Page.getLayoutMetrics",
        {},
        sessionId,
      );

      width = layout.visualViewport.clientWidth;
      height = layout.visualViewport.clientHeight;
    }

    const quality = input.quality ?? this.session.getConfig().screenshotQuality;

    const result = await client.send<{ data: string }>(
      "Page.captureScreenshot",
      {
        format: "jpeg",
        quality,
        clip,
      },
      sessionId,
    );

    return {
      data: result.data,
      mimeType: "image/jpeg",
      width,
      height,
    };
  }

  async getContent(input: GetContentInput = {}): Promise<ContentResult> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const escapedSelector = input.selector ? this.escapeSelector(input.selector) : null;

    const htmlExpr = escapedSelector
      ? `document.querySelector('${escapedSelector}')?.outerHTML || ''`
      : "document.documentElement.outerHTML";

    const htmlResult = await client.send<{ result?: { value?: unknown } }>(
      "Runtime.evaluate",
      { expression: htmlExpr },
      sessionId,
    );

    const html = String(htmlResult.result?.value ?? "");

    let text: string | undefined;
    if (input.includeText) {
      const textExpr = escapedSelector
        ? `document.querySelector('${escapedSelector}')?.innerText || ''`
        : "document.body?.innerText || ''";

      const textResult = await client.send<{ result?: { value?: unknown } }>(
        "Runtime.evaluate",
        { expression: textExpr },
        sessionId,
      );

      text = String(textResult.result?.value ?? "");
    }

    const result: ContentResult = { html };
    if (text !== undefined) {
      result.text = text;
    }
    return result;
  }

  async extractText(): Promise<string> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const result = await client.send<{ result?: { value?: unknown } }>(
      "Runtime.evaluate",
      { expression: "document.body?.innerText || ''" },
      sessionId,
    );

    return String(result.result?.value ?? "");
  }

  async extractLinks(input: ExtractLinksInput = {}): Promise<LinkInfo[]> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const escapedSelector = input.selector ? this.escapeSelector(input.selector) : "a";

    const result = await client.send<{ result?: { value?: unknown } }>(
      "Runtime.evaluate",
      {
        expression: `
          JSON.stringify(
            Array.from(document.querySelectorAll('${escapedSelector}')).map(a => ({
              href: a.href,
              text: a.innerText?.trim() || '',
              title: a.title || null
            }))
          )
        `,
      },
      sessionId,
    );

    try {
      return JSON.parse(String(result.result?.value ?? "[]")) as LinkInfo[];
    } catch {
      return [];
    }
  }

  async evaluate(input: EvaluateInput): Promise<unknown> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const result = await client.send<{ result?: { value?: unknown; type?: string; description?: string } }>(
      "Runtime.evaluate",
      { expression: input.expression, returnByValue: true },
      sessionId,
    );

    if (result.result?.type === "object" && result.result.value === undefined) {
      return { type: "object", description: result.result.description };
    }

    return result.result?.value;
  }

  async waitFor(input: WaitForInput): Promise<{ success: boolean }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();
    const timeout = input.timeout ?? this.session.getConfig().defaultTimeout;

    if (input.script) {
      await client.send(
        "Runtime.evaluate",
        {
          expression: `new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), ${timeout});
            const check = () => {
              try {
                if (${input.script}) {
                  clearTimeout(timeout);
                  resolve();
                } else {
                  requestAnimationFrame(check);
                }
              } catch (e) {
                requestAnimationFrame(check);
              }
            };
            check();
          })`,
        },
        sessionId,
        timeout + 1000,
      );
    } else if (input.selector) {
      const condition = input.condition ?? "visible";
      const escapedSelector = this.escapeSelector(input.selector);

      let conditionExpr: string;
      switch (condition) {
        case "hidden":
          conditionExpr = `!el || el.offsetParent === null`;
          break;
        case "attached":
          conditionExpr = `!!el`;
          break;
        case "detached":
          conditionExpr = `!el`;
          break;
        default:
          conditionExpr = `el && el.offsetParent !== null`;
      }

      await client.send(
        "Runtime.evaluate",
        {
          expression: `new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for ${input.selector}')), ${timeout});
            const check = () => {
              const el = document.querySelector('${escapedSelector}');
              if (${conditionExpr}) {
                clearTimeout(timeout);
                resolve();
              } else {
                requestAnimationFrame(check);
              }
            };
            check();
          })`,
        },
        sessionId,
        timeout + 1000,
      );
    }

    return { success: true };
  }

  async scroll(input: ScrollInput): Promise<{ scrolled: boolean }> {
    const sessionId = this.getSessionId();
    const client = this.getClient();

    const amount = input.amount ?? 300;
    const escapedSelector = input.selector ? this.escapeSelector(input.selector) : null;

    let scrollExpr: string;
    switch (input.direction) {
      case "up":
        scrollExpr = escapedSelector
          ? `document.querySelector('${escapedSelector}').scrollBy(0, -${amount})`
          : `window.scrollBy(0, -${amount})`;
        break;
      case "down":
        scrollExpr = escapedSelector
          ? `document.querySelector('${escapedSelector}').scrollBy(0, ${amount})`
          : `window.scrollBy(0, ${amount})`;
        break;
      case "left":
        scrollExpr = escapedSelector
          ? `document.querySelector('${escapedSelector}').scrollBy(-${amount}, 0)`
          : `window.scrollBy(-${amount}, 0)`;
        break;
      case "right":
        scrollExpr = escapedSelector
          ? `document.querySelector('${escapedSelector}').scrollBy(${amount}, 0)`
          : `window.scrollBy(${amount}, 0)`;
        break;
    }

    await client.send(
      "Runtime.evaluate",
      { expression: scrollExpr },
      sessionId,
    );

    return { scrolled: true };
  }

  private async querySelector(selector: string, sessionId: string): Promise<NodeInfo | null> {
    const client = this.getClient();

    const doc = await client.send<{ root: NodeInfo }>("DOM.getDocument", {}, sessionId);

    const escapedSelector = this.escapeSelector(selector);

    try {
      const result = await client.send<{ nodeId: number }>(
        "DOM.querySelector",
        { nodeId: doc.root.nodeId, selector: escapedSelector },
        sessionId,
      );

      if (result.nodeId === 0) {
        return null;
      }

      return { nodeId: result.nodeId, nodeName: "", nodeType: 1, localName: "", nodeValue: "" };
    } catch {
      return null;
    }
  }

  private async getElementBoxModel(nodeId: number, sessionId: string): Promise<BoxModel | null> {
    const client = this.getClient();

    try {
      const result = await client.send<{ model?: BoxModel }>(
        "DOM.getBoxModel",
        { nodeId },
        sessionId,
      );

      return result.model ?? null;
    } catch {
      return null;
    }
  }

  private escapeSelector(selector: string): string {
    return selector.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  }

  private escapeValue(value: string): string {
    return value.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  }
}
