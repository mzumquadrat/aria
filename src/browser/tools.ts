import type { Tool } from "../agent/tools.ts";
import type { ApprovalManager } from "./approval.ts";
import { PageOperations } from "./page.ts";
import type { BrowserSession } from "./session.ts";
import type {
  ClickInput,
  CloseTabInput,
  EvaluateInput,
  ExtractLinksInput,
  GetContentInput,
  NavigateInput,
  NewTabInput,
  // ScreenshotInput,
  ScrollInput,
  SelectInput,
  SwitchTabInput,
  TypeInput,
  WaitForInput,
} from "./types.ts";

export const browserNavigateTool: Tool = {
  type: "builtin",
  name: "browser_navigate",
  description: "Navigate the browser to a specified URL. Use this to load web pages for interaction or content extraction.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to navigate to" },
      waitUntil: {
        type: "string",
        description: "When to consider navigation complete: 'load', 'domcontentloaded', or 'networkidle'",
        enum: ["load", "domcontentloaded", "networkidle"],
      },
    },
    required: ["url"],
  },
};

export const browserClickTool: Tool = {
  type: "builtin",
  name: "browser_click",
  description: "Click an element on the page using a CSS selector. Use for buttons, links, and other clickable elements.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector for the element to click" },
      button: { type: "string", description: "Mouse button: 'left', 'right', or 'middle'", enum: ["left", "right", "middle"] },
      clickCount: { type: "number", description: "Number of clicks (1 for single, 2 for double)" },
    },
    required: ["selector"],
  },
};

export const browserTypeTool: Tool = {
  type: "builtin",
  name: "browser_type",
  description: "Type text into an input field or textarea. Use for filling forms, search boxes, and text inputs.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector for the input element" },
      text: { type: "string", description: "The text to type" },
      delay: { type: "number", description: "Delay between keystrokes in ms (default: 10)" },
      clear: { type: "boolean", description: "Clear existing text before typing" },
    },
    required: ["selector", "text"],
  },
};

export const browserSelectTool: Tool = {
  type: "builtin",
  name: "browser_select",
  description: "Select an option from a dropdown/select element by value.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector for the select element" },
      value: { type: "string", description: "The value of the option to select" },
    },
    required: ["selector", "value"],
  },
};

// export const browserScreenshotTool: Tool = {
//   type: "builtin",
//   name: "browser_screenshot",
//   description: "Take a screenshot of the current page or a specific element. Returns base64 encoded image for visual analysis.",
//   inputSchema: {
//     type: "object",
//     properties: {
//       selector: { type: "string", description: "CSS selector to capture a specific element (optional)" },
//       quality: { type: "number", description: "JPEG quality 1-100 (default: 80)" },
//       fullPage: { type: "boolean", description: "Capture the full scrollable page" },
//     },
//   },
// };

export const browserGetContentTool: Tool = {
  type: "builtin",
  name: "browser_get_content",
  description: "Get the HTML content of the page or a specific element. Optionally includes extracted text.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector for specific element (optional)" },
      includeText: { type: "boolean", description: "Also extract visible text content" },
    },
  },
};

export const browserExtractTextTool: Tool = {
  type: "builtin",
  name: "browser_extract_text",
  description: "Extract all visible text content from the current page.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const browserExtractLinksTool: Tool = {
  type: "builtin",
  name: "browser_extract_links",
  description: "Extract all links from the current page, including their href, text, and title attributes.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector to limit link extraction scope (optional)" },
    },
  },
};

export const browserEvaluateTool: Tool = {
  type: "builtin",
  name: "browser_evaluate",
  description: "Execute JavaScript code in the browser context. Use for custom data extraction or page manipulation.",
  inputSchema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "JavaScript expression to evaluate" },
    },
    required: ["expression"],
  },
};

export const browserWaitForTool: Tool = {
  type: "builtin",
  name: "browser_wait_for",
  description: "Wait for an element to appear, disappear, or for a custom condition to be met.",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "CSS selector to wait for (optional if using script)" },
      condition: {
        type: "string",
        description: "Wait condition: 'visible', 'hidden', 'attached', 'detached'",
        enum: ["visible", "hidden", "attached", "detached"],
      },
      timeout: { type: "number", description: "Maximum wait time in ms" },
      script: { type: "string", description: "Custom JavaScript condition that returns true when ready" },
    },
  },
};

export const browserScrollTool: Tool = {
  type: "builtin",
  name: "browser_scroll",
  description: "Scroll the page or a scrollable element in a specified direction.",
  inputSchema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        description: "Scroll direction",
        enum: ["up", "down", "left", "right"],
      },
      amount: { type: "number", description: "Pixels to scroll (default: 300)" },
      selector: { type: "string", description: "CSS selector for scrollable element (optional)" },
    },
    required: ["direction"],
  },
};

export const browserListTabsTool: Tool = {
  type: "builtin",
  name: "browser_list_tabs",
  description: "List all open browser tabs with their URLs and titles.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const browserSwitchTabTool: Tool = {
  type: "builtin",
  name: "browser_switch_tab",
  description: "Switch to a different browser tab by its ID.",
  inputSchema: {
    type: "object",
    properties: {
      tabId: { type: "string", description: "The ID of the tab to switch to" },
    },
    required: ["tabId"],
  },
};

export const browserNewTabTool: Tool = {
  type: "builtin",
  name: "browser_new_tab",
  description: "Open a new browser tab, optionally navigating to a URL.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to navigate to in the new tab (optional)" },
    },
  },
};

export const browserCloseTabTool: Tool = {
  type: "builtin",
  name: "browser_close_tab",
  description: "Close a browser tab by its ID. Cannot close the last remaining tab.",
  inputSchema: {
    type: "object",
    properties: {
      tabId: { type: "string", description: "The ID of the tab to close" },
    },
    required: ["tabId"],
  },
};

export const browserReconnectTool: Tool = {
  type: "builtin",
  name: "browser_reconnect",
  description: "Reconnect to the browser after a connection loss. Use this when the browser is still running but the connection was dropped.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const BROWSER_TOOLS: Tool[] = [
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserSelectTool,
  // browserScreenshotTool,
  browserGetContentTool,
  browserExtractTextTool,
  browserExtractLinksTool,
  browserEvaluateTool,
  browserWaitForTool,
  browserScrollTool,
  browserListTabsTool,
  browserSwitchTabTool,
  browserNewTabTool,
  browserCloseTabTool,
  browserReconnectTool,
];

export class BrowserToolExecutor {
  private page: PageOperations;
  private approvalManager: ApprovalManager;
  private session: BrowserSession;

  constructor(session: BrowserSession, approvalManager: ApprovalManager) {
    this.session = session;
    this.page = new PageOperations(session);
    this.approvalManager = approvalManager;
  }

  async execute(tool: string, input: Record<string, unknown>): Promise<{ success: boolean; output?: unknown; error?: string }> {
    try {
      if (!this.session.connected) {
        return { success: false, error: "Browser not connected" };
      }

      const approvalRequest = await this.checkApproval(tool, input);
      if (approvalRequest) {
        const response = await this.approvalManager.requestApproval(approvalRequest);
        if (!response.approved) {
          return {
            success: false,
            error: `Action not approved: ${response.reason ?? "User declined"}`,
          };
        }
      }

      switch (tool) {
        case "browser_navigate":
          return await this.executeNavigate(input as unknown as NavigateInput);

        case "browser_click":
          return await this.executeClick(input as unknown as ClickInput);

        case "browser_type":
          return await this.executeType(input as unknown as TypeInput);

        case "browser_select":
          return await this.executeSelect(input as unknown as SelectInput);

        // case "browser_screenshot":
        //   return await this.executeScreenshot(input as unknown as ScreenshotInput);

        case "browser_get_content":
          return await this.executeGetContent(input as unknown as GetContentInput);

        case "browser_extract_text":
          return await this.executeExtractText();

        case "browser_extract_links":
          return await this.executeExtractLinks(input as unknown as ExtractLinksInput);

        case "browser_evaluate":
          return await this.executeEvaluate(input as unknown as EvaluateInput);

        case "browser_wait_for":
          return await this.executeWaitFor(input as unknown as WaitForInput);

        case "browser_scroll":
          return await this.executeScroll(input as unknown as ScrollInput);

        case "browser_list_tabs":
          return await this.executeListTabs();

        case "browser_switch_tab":
          return await this.executeSwitchTab(input as unknown as SwitchTabInput);

        case "browser_new_tab":
          return await this.executeNewTab(input as unknown as NewTabInput);

        case "browser_close_tab":
          return await this.executeCloseTab(input as unknown as CloseTabInput);

        case "browser_reconnect":
          return await this.executeReconnect();

        default:
          return { success: false, error: `Unknown browser tool: ${tool}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkApproval(tool: string, input: Record<string, unknown>): Promise<ReturnType<typeof import("./approval.ts").shouldRequireApproval>> {
    const { shouldRequireApproval } = await import("./approval.ts");
    const action = tool.replace("browser_", "");
    return shouldRequireApproval(action, input, this.session.getConfig());
  }

  private async executeNavigate(input: NavigateInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.navigate(input);
    return { success: true, output: result };
  }

  private async executeClick(input: ClickInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.click(input);
    return { success: true, output: result };
  }

  private async executeType(input: TypeInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.type(input);
    return { success: true, output: result };
  }

  private async executeSelect(input: SelectInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.select(input);
    return { success: true, output: result };
  }

  // private async executeScreenshot(input: ScreenshotInput): Promise<{ success: boolean; output?: unknown }> {
  //   const result = await this.page.screenshot(input);
  //   return {
  //     success: true,
  //     output: {
  //       data: result.data,
  //       mimeType: result.mimeType,
  //       width: result.width,
  //       height: result.height,
  //     },
  //   };
  // }

  private async executeGetContent(input: GetContentInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.getContent(input);
    return { success: true, output: result };
  }

  private async executeExtractText(): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.extractText();
    return { success: true, output: { text: result } };
  }

  private async executeExtractLinks(input: ExtractLinksInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.extractLinks(input);
    return { success: true, output: { links: result } };
  }

  private async executeEvaluate(input: EvaluateInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.evaluate(input);
    return { success: true, output: { result } };
  }

  private async executeWaitFor(input: WaitForInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.waitFor(input);
    return { success: true, output: result };
  }

  private async executeScroll(input: ScrollInput): Promise<{ success: boolean; output?: unknown }> {
    const result = await this.page.scroll(input);
    return { success: true, output: result };
  }

  private async executeListTabs(): Promise<{ success: boolean; output?: unknown }> {
    const tabs = await this.session.listTabs();
    return { success: true, output: { tabs } };
  }

  private async executeSwitchTab(input: SwitchTabInput): Promise<{ success: boolean; output?: unknown }> {
    const tab = await this.session.switchToTab(input.tabId);
    return { success: true, output: { tab } };
  }

  private async executeNewTab(input: NewTabInput): Promise<{ success: boolean; output?: unknown }> {
    const tab = await this.session.createNewTab(input.url);
    return { success: true, output: { tab } };
  }

  private async executeCloseTab(input: CloseTabInput): Promise<{ success: boolean; output?: unknown }> {
    await this.session.closeTab(input.tabId);
    return { success: true, output: { closed: true, tabId: input.tabId } };
  }

  async executeReconnect(): Promise<{ success: boolean; output?: unknown; error?: string }> {
    try {
      await this.session.reconnect();
      const tabs = this.session.listTabs();
      return {
        success: true,
        output: {
          reconnected: true,
          activeTab: tabs.find((t) => t.isActive) ?? null,
          tabCount: tabs.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Reconnect failed",
      };
    }
  }
}
