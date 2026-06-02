import { describe, expect, it } from "vitest";
import { openAiAuthRoutes, providerIdsByAuthMode, providerName, providerStatusLabel } from "./providers";
import type { ProviderId } from "./providers";

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

  it("keeps OpenAI API-key and ChatGPT/Codex OAuth as separate auth routes", () => {
    expect(openAiAuthRoutes).toEqual([
      expect.objectContaining({
        id: "openai-codex-oauth",
        provider: "openai-codex",
        auth: "oauth",
        modelRef: "openai/gpt-5.5",
      }),
      expect.objectContaining({
        id: "openai-api-key",
        provider: "openai",
        auth: "api-key",
        modelRef: "openai/gpt-5.5",
      }),
    ]);
  });

  it("covers OpenClaw model provider docs imported into ClawDesk catalog", () => {
    const required: ProviderId[] = [
      "openai-codex",
      "openai",
      "anthropic",
      "anthropic-vertex",
      "google",
      "google-gemini-cli",
      "ollama",
      "lmstudio",
      "vllm",
      "sglang",
      "openrouter",
      "perplexity",
      "deepseek",
      "deepinfra",
      "mistral",
      "groq",
      "xai",
      "bedrock",
      "bedrock-mantle",
      "arcee",
      "azure-speech",
      "chutes",
      "comfy",
      "deepgram",
      "elevenlabs",
      "fireworks",
      "gradium",
      "index",
      "inworld",
      "litellm",
      "tencent",
      "synthetic",
      "microsoft-foundry",
      "senseaudio",
      "vydra",
    ];

    const configured = new Set([...providerIdsByAuthMode("api-key"), ...providerIdsByAuthMode("oauth"), ...providerIdsByAuthMode("local-endpoint")]);
    for (const provider of required) {
      expect(configured.has(provider), provider).toBe(true);
    }
  });
});
