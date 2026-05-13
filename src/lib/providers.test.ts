import { describe, expect, it } from "vitest";
import { providerName, providerStatusLabel } from "./providers";

describe("provider labels", () => {
  it("returns Traditional Chinese status labels", () => {
    expect(providerStatusLabel("connected")).toBe("已連線");
    expect(providerStatusLabel("configured")).toBe("已設定");
    expect(providerStatusLabel("account-required")).toBe("需網站帳號登入");
    expect(providerStatusLabel("not-connected")).toBe("未連線");
  });

  it("returns provider display names", () => {
    expect(providerName("chatgpt-pro")).toBe("ChatGPT Pro");
    expect(providerName("openai-api")).toBe("OpenAI API");
    expect(providerName("google-gemini")).toBe("Google Gemini API");
    expect(providerName("local-model")).toBe("本機模型");
    expect(providerName("mock")).toBe("Mock Gateway");
  });
});
