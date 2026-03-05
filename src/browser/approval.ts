import type { ApprovalRequest, ApprovalResponse, BrowserConfig } from "./types.ts";

type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalResponse>;

export class ApprovalManager {
  private callback: ApprovalCallback | null = null;
  private pendingApprovals = new Map<string, {
    request: ApprovalRequest;
    resolve: (response: ApprovalResponse) => void;
    timeout: number;
  }>();
  private approvalTimeout: number;

  constructor(config: BrowserConfig) {
    this.approvalTimeout = config.approvalTimeout * 1000;
  }

  setCallback(callback: ApprovalCallback): void {
    this.callback = callback;
  }

  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    const cb = this.callback;
    if (!cb) {
      return Promise.resolve({ approved: true });
    }

    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      const timeoutHandle = setTimeout(() => {
        this.pendingApprovals.delete(id);
        resolve({ approved: false, reason: "Approval timeout" });
      }, this.approvalTimeout);

      this.pendingApprovals.set(id, { request, resolve, timeout: timeoutHandle });

      cb(request).then((response) => {
        const pending = this.pendingApprovals.get(id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingApprovals.delete(id);
          resolve(response);
        }
      });
    });
  }

  respondToApproval(id: string, response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingApprovals.delete(id);
      pending.resolve(response);
      return true;
    }
    return false;
  }

  getPendingApprovals(): Array<{ id: string; request: ApprovalRequest }> {
    const result: Array<{ id: string; request: ApprovalRequest }> = [];
    for (const [id, { request }] of this.pendingApprovals) {
      result.push({ id, request });
    }
    return result;
  }

  cancelAllApprovals(): void {
    for (const [id, { resolve, timeout }] of this.pendingApprovals) {
      clearTimeout(timeout);
      resolve({ approved: false, reason: "Cancelled" });
      this.pendingApprovals.delete(id);
    }
  }
}

export function shouldRequireApproval(
  action: string,
  input: Record<string, unknown>,
  config: BrowserConfig,
): ApprovalRequest | null {
  switch (action) {
    case "navigate":
      if (config.autoApproveNavigate) {
        return null;
      }
      return {
        action: "Navigate to URL",
        details: `URL: ${input.url as string}`,
        sensitiveAction: false,
      };

    case "click":
      if (config.autoApproveForms) {
        return null;
      }
      return {
        action: "Click element",
        details: `Selector: ${input.selector as string}`,
        sensitiveAction: false,
      };

    case "type": {
      const selector = input.selector as string;
      const isPasswordField = /password|passwd|pwd/i.test(selector);
      const isFormInput = /input|textarea/i.test(selector);

      if (isPasswordField) {
        return {
          action: "Type into password field",
          details: `Selector: ${selector}`,
          requiresPassword: true,
          sensitiveAction: true,
        };
      }

      if (config.autoApproveForms || !isFormInput) {
        return null;
      }

      return {
        action: "Type into input field",
        details: `Selector: ${selector}, Text length: ${
          (input.text as string)?.length ?? 0
        } characters`,
        sensitiveAction: false,
      };
    }

    case "select":
      if (config.autoApproveForms) {
        return null;
      }
      return {
        action: "Select dropdown option",
        details: `Selector: ${input.selector as string}, Value: ${input.value as string}`,
        sensitiveAction: false,
      };

    case "evaluate":
      return {
        action: "Execute JavaScript",
        details: `Expression: ${(input.expression as string)?.substring(0, 100)}...`,
        sensitiveAction: true,
      };

    default:
      return null;
  }
}
