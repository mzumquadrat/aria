import type { Page } from "@astral/astral";
import { encodeBase64 } from "@std/encoding/base64";
import type { BrowserSession } from "./session.ts";
import type {
  ClickInput,
  ContentResult,
  EvaluateInput,
  ExtractLinksInput,
  GetContentInput,
  GetCookiesInput,
  LinkInfo,
  NavigateInput,
  PdfInput,
  ScreenshotInput,
  ScreenshotResult,
  ScrollInput,
  SelectInput,
  SetCookiesInput,
  TypeInput,
  WaitForInput,
} from "./types.ts";

export class PageOperations {
  constructor(private session: BrowserSession) {}

  private getPage(): Page {
    return this.session.getActivePage();
  }

  async navigate(input: NavigateInput): Promise<{ url: string; title: string }> {
    const page = this.getPage();

    const waitUntil = input.waitUntil ?? "load";
    const waitOptions: "load" | "networkidle0" | "networkidle2" = waitUntil === "networkidle"
      ? "networkidle0"
      : waitUntil === "domcontentloaded"
      ? "load"
      : waitUntil;

    await page.goto(input.url, { waitUntil: waitOptions });

    const url = page.url || input.url;
    const title = await page.evaluate("document.title") as string;

    return { url, title };
  }

  async click(input: ClickInput): Promise<{ clicked: boolean; selector: string }> {
    const page = this.getPage();

    const element = await page.$(input.selector);
    if (!element) {
      throw new Error(`Element not found: ${input.selector}`);
    }

    await element.click();

    return { clicked: true, selector: input.selector };
  }

  async type(input: TypeInput): Promise<{ typed: boolean; selector: string }> {
    const page = this.getPage();

    const element = await page.$(input.selector);
    if (!element) {
      throw new Error(`Element not found: ${input.selector}`);
    }

    await element.focus();

    if (input.clear) {
      const escapedSelector = input.selector.replace(/'/g, "\\'");
      await page.evaluate(`document.querySelector('${escapedSelector}').value = ''`);
    }

    const delay = input.delay ?? 10;
    await element.type(input.text, { delay });

    return { typed: true, selector: input.selector };
  }

  async select(
    input: SelectInput,
  ): Promise<{ selected: boolean; selector: string; value: string }> {
    const page = this.getPage();

    const escapedSelector = input.selector.replace(/'/g, "\\'");
    const escapedValue = input.value.replace(/'/g, "\\'");

    await page.evaluate(`
      (function() {
        const select = document.querySelector('${escapedSelector}');
        if (select) {
          select.value = '${escapedValue}';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    return { selected: true, selector: input.selector, value: input.value };
  }

  async screenshot(input: ScreenshotInput = {}): Promise<ScreenshotResult> {
    const page = this.getPage();

    let screenshot: Uint8Array;
    let width = 1280;
    let height = 720;

    if (input.selector) {
      const element = await page.$(input.selector);
      if (!element) {
        throw new Error(`Element not found: ${input.selector}`);
      }

      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Element not visible: ${input.selector}`);
      }

      width = box.width;
      height = box.height;

      screenshot = await element.screenshot();
    } else {
      screenshot = await page.screenshot();
    }

    const base64 = encodeBase64(screenshot);

    return {
      data: base64,
      mimeType: "image/png",
      width,
      height,
    };
  }

  async getContent(input: GetContentInput = {}): Promise<ContentResult> {
    const page = this.getPage();

    const escapedSelector = input.selector ? input.selector.replace(/'/g, "\\'") : null;

    const htmlExpr = escapedSelector
      ? `document.querySelector('${escapedSelector}')?.outerHTML || ''`
      : "document.documentElement.outerHTML";

    const html = await page.evaluate(htmlExpr) as string;

    let text: string | undefined;
    if (input.includeText) {
      const textExpr = escapedSelector
        ? `document.querySelector('${escapedSelector}')?.innerText || ''`
        : "document.body?.innerText || ''";

      text = await page.evaluate(textExpr) as string;
    }

    const result: ContentResult = { html };
    if (text !== undefined) {
      result.text = text;
    }
    return result;
  }

  async extractText(): Promise<string> {
    const page = this.getPage();

    return await page.evaluate("document.body?.innerText || ''") as string;
  }

  async extractLinks(input: ExtractLinksInput = {}): Promise<LinkInfo[]> {
    const page = this.getPage();

    const escapedSelector = input.selector ? input.selector.replace(/'/g, "\\'") : "a";

    const result = await page.evaluate(`
      JSON.stringify(
        Array.from(document.querySelectorAll('${escapedSelector}')).map(a => ({
          href: a.href,
          text: a.innerText?.trim() || '',
          title: a.title || null
        }))
      )
    `) as string;

    try {
      return JSON.parse(result) as LinkInfo[];
    } catch {
      return [];
    }
  }

  async evaluate(input: EvaluateInput): Promise<unknown> {
    const page = this.getPage();

    return await page.evaluate(input.expression);
  }

  async waitFor(input: WaitForInput): Promise<{ success: boolean }> {
    const page = this.getPage();

    if (input.script) {
      await page.waitForFunction(input.script);
    } else if (input.selector) {
      await page.waitForSelector(input.selector);
    }

    return { success: true };
  }

  async scroll(input: ScrollInput): Promise<{ scrolled: boolean }> {
    const page = this.getPage();

    const amount = input.amount ?? 300;
    const escapedSelector = input.selector ? input.selector.replace(/'/g, "\\'") : null;

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

    await page.evaluate(scrollExpr);

    return { scrolled: true };
  }

  async pdf(_input: PdfInput = {}): Promise<{ data: string }> {
    const page = this.getPage();

    const pdfData = await page.pdf();

    const base64 = encodeBase64(pdfData);

    return { data: base64 };
  }

  async getCookies(_input: GetCookiesInput): Promise<{ cookies: unknown[] }> {
    const page = this.getPage();

    const cookies = await page.cookies();

    return { cookies: cookies as unknown[] };
  }

  async setCookies(input: SetCookiesInput): Promise<{ success: boolean }> {
    const page = this.getPage();

    const cookies = input.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? "",
      path: c.path ?? "/",
      secure: c.secure ?? false,
      httpOnly: c.httpOnly ?? false,
      sameSite: c.sameSite ?? "Lax" as const,
      expires: c.expirationDate ?? -1,
    }));

    await page.setCookies(cookies as Parameters<typeof page.setCookies>[0]);

    return { success: true };
  }
}
