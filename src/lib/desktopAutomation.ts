export type AccessibilityTrustState = "granted" | "not-granted" | "unknown";
export type DesktopActionRisk = "low" | "medium" | "high";
export type DesktopActionStage = "observe" | "rehearse" | "authorize";

export interface AccessibilityStatus {
  platform: "macOS" | "Windows" | "Linux" | "unknown";
  trusted: AccessibilityTrustState;
  canReadActiveWindow: boolean;
  setupHint: string;
  settingsUrl: string;
  checkedAt: string;
}

export interface DesktopElementSnapshot {
  id: string;
  role: string;
  label: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  enabled: boolean;
  children?: DesktopElementSnapshot[];
}

export interface DesktopWindowSnapshot {
  appName: string;
  windowTitle: string;
  processId?: number;
  capturedAt: string;
  fallback: "ax-tree" | "vision-preview";
  elements: DesktopElementSnapshot[];
}

export interface DesktopActionRehearsal {
  actionId: string;
  stage: DesktopActionStage;
  risk: DesktopActionRisk;
  executable: boolean;
  requiresHumanApproval: boolean;
  summary: string;
  blockedReason?: string;
  observedElement?: DesktopElementSnapshot;
}

export interface DesktopActionRequest {
  action: "click" | "type" | "shortcut" | "drag" | "read";
  targetLabel: string;
  text?: string;
  risk?: DesktopActionRisk;
}

export function createMockAccessibilityStatus(
  trusted: AccessibilityTrustState = "not-granted",
  now = new Date().toISOString(),
): AccessibilityStatus {
  return {
    platform: "macOS",
    trusted,
    canReadActiveWindow: trusted === "granted",
    setupHint: "系統設定 > 隱私權與安全性 > 輔助使用，允許 ClawDesk 讀取桌面元素。",
    settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    checkedAt: now,
  };
}

export function createMockActiveWindowSnapshot(now = new Date().toISOString()): DesktopWindowSnapshot {
  return {
    appName: "ClawDesk Preview",
    windowTitle: "桌面操作預演",
    processId: 0,
    capturedAt: now,
    fallback: "ax-tree",
    elements: [
      {
        id: "ax-submit",
        role: "AXButton",
        label: "預覽動作",
        bounds: { x: 420, y: 560, width: 112, height: 32 },
        enabled: true,
      },
      {
        id: "ax-target",
        role: "AXTextField",
        label: "目標路徑 / 資源",
        bounds: { x: 180, y: 498, width: 360, height: 34 },
        enabled: true,
      },
    ],
  };
}

export function buildDesktopActionRehearsal(
  request: DesktopActionRequest,
  snapshot: DesktopWindowSnapshot = createMockActiveWindowSnapshot(),
): DesktopActionRehearsal {
  const risk = request.risk ?? (request.action === "read" ? "low" : "medium");
  const observedElement = snapshot.elements.find((element) => element.label === request.targetLabel);
  const highRisk = risk === "high";

  return {
    actionId: `desktop-${request.action}-${request.targetLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    stage: highRisk ? "authorize" : "rehearse",
    risk,
    executable: !highRisk,
    requiresHumanApproval: request.action !== "read" || risk !== "low",
    summary: `觀察到 ${snapshot.appName} / ${snapshot.windowTitle}，預演 ${request.action} 於「${request.targetLabel}」。`,
    blockedReason: highRisk ? "v0.2 不自動執行高風險桌面操作，只能產生預演與授權提示。" : undefined,
    observedElement,
  };
}

export function desktopAutomationContractSummary(): string[] {
  return ["觀察 Accessibility tree", "預演低風險 UI 操作", "高風險動作固定要求人工授權"];
}
