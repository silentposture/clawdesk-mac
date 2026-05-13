import { describe, expect, it } from "vitest";
import {
  buildDesktopActionRehearsal,
  createMockAccessibilityStatus,
  createMockActiveWindowSnapshot,
  desktopAutomationContractSummary,
} from "./desktopAutomation";

describe("macOS desktop automation contract", () => {
  it("returns stable accessibility status for granted and ungranted states", () => {
    expect(createMockAccessibilityStatus("granted").canReadActiveWindow).toBe(true);
    expect(createMockAccessibilityStatus("not-granted").canReadActiveWindow).toBe(false);
    expect(createMockAccessibilityStatus("unknown").setupHint).toContain("輔助使用");
  });

  it("describes active window metadata and AX-first elements", () => {
    const snapshot = createMockActiveWindowSnapshot("2026-05-14T00:00:00.000Z");

    expect(snapshot.fallback).toBe("ax-tree");
    expect(snapshot.elements[0]).toMatchObject({
      role: "AXButton",
      label: "預覽動作",
      enabled: true,
    });
  });

  it("rehearses low-risk actions and blocks high-risk execution", () => {
    const lowRisk = buildDesktopActionRehearsal({ action: "read", targetLabel: "預覽動作" });
    const highRisk = buildDesktopActionRehearsal({ action: "click", targetLabel: "預覽動作", risk: "high" });

    expect(lowRisk.executable).toBe(true);
    expect(lowRisk.requiresHumanApproval).toBe(false);
    expect(highRisk.executable).toBe(false);
    expect(highRisk.stage).toBe("authorize");
    expect(highRisk.blockedReason).toContain("不自動執行高風險");
  });

  it("documents observe-rehearse-authorize as the v0.2 contract", () => {
    expect(desktopAutomationContractSummary()).toEqual([
      "觀察 Accessibility tree",
      "預演低風險 UI 操作",
      "高風險動作固定要求人工授權",
    ]);
  });
});
