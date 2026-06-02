export type ProviderStatus = "connected" | "not-connected" | "configured" | "account-required";

export type ProviderId =
  | "chatgpt-pro"
  | "openai-codex"
  | "openai"
  | "openai-api"
  | "anthropic"
  | "anthropic-vertex"
  | "alibaba"
  | "arcee"
  | "bedrock"
  | "bedrock-mantle"
  | "chutes"
  | "claude-max-api-proxy"
  | "azure-speech"
  | "google"
  | "google-gemini"
  | "google-vertex"
  | "google-gemini-cli"
  | "openrouter"
  | "perplexity"
  | "moonshot"
  | "byteplus"
  | "byteplus-plan"
  | "cloudflare-ai-gateway"
  | "comfy"
  | "deepgram"
  | "deepseek"
  | "deepinfra"
  | "ds4"
  | "elevenlabs"
  | "fal"
  | "fireworks"
  | "gradium"
  | "github-copilot"
  | "glm"
  | "xai"
  | "groq"
  | "inferrs"
  | "index"
  | "inworld"
  | "litellm"
  | "mistral"
  | "azure-openai"
  | "minimax"
  | "minimax-portal"
  | "nvidia"
  | "qianfan"
  | "qwen"
  | "qwen-portal"
  | "cerebras"
  | "microsoft-foundry"
  | "kimi"
  | "kilocode"
  | "opencode"
  | "opencode-go"
  | "runway"
  | "senseaudio"
  | "stepfun"
  | "stepfun-plan"
  | "together"
  | "venice"
  | "volcengine"
  | "volcengine-plan"
  | "xiaomi"
  | "zai"
  | "synthetic"
  | "tencent"
  | "vercel-ai-gateway"
  | "huggingface"
  | "vydra"
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "sglang"
  | "local-model"
  | "mock";

export type ProviderAuthMode = "oauth" | "api-key" | "local-endpoint" | "mock";

export interface ProviderSession {
  activeProvider: ProviderId;
  status: ProviderStatus;
  displayName: string;
  detail: string;
  model?: string;
  endpoint?: string;
  accountEmail?: string;
  maskedKey?: string;
}

export interface LlmProviderSpec {
  id: ProviderId;
  shortName: string;
  displayName: string;
  authMode: ProviderAuthMode;
  modelPlaceholder: string;
  modelDefault: string;
  keyPlaceholder?: string;
  keyPrefixes?: string[];
  endpointPlaceholder?: string;
  accountPlaceholder?: string;
  description: string;
}

export interface OpenAiAuthRoute {
  id: "openai-api-key" | "openai-codex-oauth";
  label: string;
  provider: "openai" | "openai-codex";
  modelRef: string;
  auth: "api-key" | "oauth";
  secretStorage: "api-key-profile" | "oauth-profile";
  desktopPolicy: string;
}

export const llmProviderCatalog: LlmProviderSpec[] = [
  {
    id: "chatgpt-pro",
    shortName: "ChatGPT Pro",
    displayName: "ChatGPT Pro",
    authMode: "oauth",
    modelPlaceholder: "gpt-5.4",
    modelDefault: "gpt-5.4",
    accountPlaceholder: "ChatGPT Pro 帳號 Email",
    description: "無金鑰協議（Keyless），使用 ChatGPT Pro 訂閱權限進行 Cloud-Main 路由。",
  },
  {
    id: "openai-codex",
    shortName: "OpenAI Codex",
    displayName: "OpenAI Codex",
    authMode: "oauth",
    modelPlaceholder: "gpt-5.5",
    modelDefault: "gpt-5.5",
    accountPlaceholder: "OpenAI Codex 帳號 Email",
    description: "OpenAI Codex / ChatGPT OAuth。依 OpenClaw 規則，登入 profile 可供 canonical openai/gpt-* route 使用。",
  },
  {
    id: "openai",
    shortName: "OpenAI API",
    displayName: "OpenAI API",
    authMode: "api-key",
    modelPlaceholder: "gpt-5.2",
    modelDefault: "gpt-5.2",
    keyPlaceholder: "sk-...",
    keyPrefixes: ["sk-"],
    description: "官方 OpenAI API 金鑰。",
  },
  {
    id: "openai-api",
    shortName: "OpenAI API",
    displayName: "OpenAI API",
    authMode: "api-key",
    modelPlaceholder: "gpt-5.2",
    modelDefault: "gpt-5.2",
    keyPlaceholder: "sk-...",
    keyPrefixes: ["sk-"],
    description: "舊版 OpenAI API 相容欄位。",
  },
  {
    id: "anthropic",
    shortName: "Anthropic",
    displayName: "Anthropic",
    authMode: "api-key",
    modelPlaceholder: "claude-opus-4-6",
    modelDefault: "claude-opus-4-6",
    keyPlaceholder: "sk-ant-...",
    keyPrefixes: ["sk-ant-", "sk-ant-api03-"],
    description: "Anthropic Claude 系列模型。",
  },
  {
    id: "anthropic-vertex",
    shortName: "Anthropic Vertex",
    displayName: "Anthropic Vertex",
    authMode: "api-key",
    modelPlaceholder: "anthropic-vertex/claude-sonnet-4-5",
    modelDefault: "anthropic-vertex/claude-sonnet-4-5",
    keyPlaceholder: "GOOGLE_APPLICATION_CREDENTIALS / Vertex auth",
    description: "OpenClaw provider docs: Anthropic Vertex provider。",
  },
  {
    id: "alibaba",
    shortName: "Alibaba",
    displayName: "Alibaba Cloud",
    authMode: "api-key",
    modelPlaceholder: "alibaba/qwen-plus",
    modelDefault: "alibaba/qwen-plus",
    keyPlaceholder: "ALIBABA_API_KEY",
    description: "OpenClaw provider docs: Alibaba / DashScope 類模型入口。",
  },
  {
    id: "arcee",
    shortName: "Arcee",
    displayName: "Arcee",
    authMode: "api-key",
    modelPlaceholder: "arcee/default",
    modelDefault: "arcee/default",
    keyPlaceholder: "ARCEE_API_KEY",
    description: "OpenClaw provider docs: Arcee model provider。",
  },
  {
    id: "bedrock",
    shortName: "Bedrock",
    displayName: "AWS Bedrock",
    authMode: "api-key",
    modelPlaceholder: "bedrock/anthropic.claude-sonnet-4-5",
    modelDefault: "bedrock/anthropic.claude-sonnet-4-5",
    keyPlaceholder: "AWS credentials profile",
    description: "OpenClaw provider docs: AWS Bedrock provider。",
  },
  {
    id: "bedrock-mantle",
    shortName: "Bedrock Mantle",
    displayName: "Bedrock Mantle",
    authMode: "api-key",
    modelPlaceholder: "bedrock-mantle/default",
    modelDefault: "bedrock-mantle/default",
    keyPlaceholder: "AWS credentials profile",
    description: "OpenClaw provider docs: Bedrock Mantle provider。",
  },
  {
    id: "chutes",
    shortName: "Chutes",
    displayName: "Chutes",
    authMode: "api-key",
    modelPlaceholder: "chutes/default",
    modelDefault: "chutes/default",
    keyPlaceholder: "CHUTES_API_KEY",
    description: "OpenClaw provider docs: Chutes model provider。",
  },
  {
    id: "claude-max-api-proxy",
    shortName: "Claude Max Proxy",
    displayName: "Claude Max API Proxy",
    authMode: "local-endpoint",
    modelPlaceholder: "anthropic/claude-opus-4-6",
    modelDefault: "anthropic/claude-opus-4-6",
    endpointPlaceholder: "http://127.0.0.1:8082/v1",
    description: "OpenClaw provider docs: Claude Max API proxy。",
  },
  {
    id: "google",
    shortName: "Gemini",
    displayName: "Google Gemini API",
    authMode: "api-key",
    modelPlaceholder: "gemini-1.5-flash",
    modelDefault: "gemini-1.5-flash",
    keyPlaceholder: "AIza...",
    keyPrefixes: ["AIza"],
    description: "Google Gemini API Key。",
  },
  {
    id: "google-gemini",
    shortName: "Gemini",
    displayName: "Google Gemini API",
    authMode: "api-key",
    modelPlaceholder: "gemini-1.5-flash",
    modelDefault: "gemini-1.5-flash",
    keyPlaceholder: "AIza...",
    keyPrefixes: ["AIza"],
    description: "OpenClaw 既有 Gemini 欄位名稱相容。",
  },
  {
    id: "google-vertex",
    shortName: "Vertex AI",
    displayName: "Google Vertex AI",
    authMode: "api-key",
    modelPlaceholder: "vertex-flash",
    modelDefault: "vertex-flash",
    keyPlaceholder: "GOOGLE_API_KEY",
    description: "Google Vertex AI API Key。",
  },
  {
    id: "google-gemini-cli",
    shortName: "Gemini CLI",
    displayName: "Google Gemini CLI（OAuth）",
    authMode: "oauth",
    modelPlaceholder: "gemini-1.5-flash",
    modelDefault: "gemini-1.5-flash",
    accountPlaceholder: "Google 帳號 Email",
    description: "Gemini CLI / OAuth 模式。",
  },
  {
    id: "openrouter",
    shortName: "OpenRouter",
    displayName: "OpenRouter",
    authMode: "api-key",
    modelPlaceholder: "anthropic/claude-3.5-sonnet",
    modelDefault: "anthropic/claude-3.5-sonnet",
    keyPlaceholder: "sk-or-v1-...",
    keyPrefixes: ["sk-or-v1-"],
    description: "聚合多家模型供應商。",
  },
  {
    id: "perplexity",
    shortName: "Perplexity",
    displayName: "Perplexity",
    authMode: "api-key",
    modelPlaceholder: "perplexity/sonar-pro",
    modelDefault: "perplexity/sonar-pro",
    keyPlaceholder: "PERPLEXITY_API_KEY",
    keyPrefixes: ["pplx-", "sk-"],
    description: "OpenClaw provider docs: Perplexity provider。",
  },
  {
    id: "byteplus",
    shortName: "BytePlus",
    displayName: "BytePlus",
    authMode: "api-key",
    modelPlaceholder: "byteplus-plan/ark-code-latest",
    modelDefault: "byteplus-plan/ark-code-latest",
    keyPlaceholder: "BYTEPLUS_API_KEY",
    keyPrefixes: ["sk-", "bp_"],
    description: "BytePlus/Ark 平台。",
  },
  {
    id: "byteplus-plan",
    shortName: "BytePlus Plan",
    displayName: "BytePlus Plan",
    authMode: "api-key",
    modelPlaceholder: "byteplus-plan/ark-code-latest",
    modelDefault: "byteplus-plan/ark-code-latest",
    keyPlaceholder: "BYTEPLUS_API_KEY",
    keyPrefixes: ["sk-", "bp_"],
    description: "BytePlus coding surface。",
  },
  {
    id: "cloudflare-ai-gateway",
    shortName: "Cloudflare AI Gateway",
    displayName: "Cloudflare AI Gateway",
    authMode: "api-key",
    modelPlaceholder: "cloudflare/model",
    modelDefault: "cloudflare/model",
    keyPlaceholder: "CLOUDFLARE_AI_GATEWAY_API_KEY",
    description: "Cloudflare AI Gateway OpenAI 相容轉發。",
  },
  {
    id: "azure-speech",
    shortName: "Azure Speech",
    displayName: "Azure Speech",
    authMode: "api-key",
    modelPlaceholder: "azure-speech/default",
    modelDefault: "azure-speech/default",
    keyPlaceholder: "AZURE_SPEECH_KEY",
    description: "OpenClaw provider docs: Azure Speech provider（語音能力，MVP 以 mock contract 呈現）。",
  },
  {
    id: "comfy",
    shortName: "ComfyUI",
    displayName: "ComfyUI",
    authMode: "local-endpoint",
    modelPlaceholder: "comfy/workflow",
    modelDefault: "comfy/workflow",
    endpointPlaceholder: "http://127.0.0.1:8188",
    description: "OpenClaw provider docs: ComfyUI provider（影像工作流，本機 endpoint）。",
  },
  {
    id: "deepgram",
    shortName: "Deepgram",
    displayName: "Deepgram",
    authMode: "api-key",
    modelPlaceholder: "deepgram/nova-3",
    modelDefault: "deepgram/nova-3",
    keyPlaceholder: "DEEPGRAM_API_KEY",
    description: "OpenClaw provider docs: Deepgram provider（語音辨識）。",
  },
  {
    id: "deepseek",
    shortName: "DeepSeek",
    displayName: "DeepSeek",
    authMode: "api-key",
    modelPlaceholder: "deepseek/deepseek-v4-flash",
    modelDefault: "deepseek/deepseek-v4-flash",
    keyPlaceholder: "DEEPSEEK_API_KEY",
    keyPrefixes: ["sk-"],
    description: "DeepSeek 深度推理供應商。",
  },
  {
    id: "deepinfra",
    shortName: "DeepInfra",
    displayName: "DeepInfra",
    authMode: "api-key",
    modelPlaceholder: "deepinfra/deepseek-ai/DeepSeek-V3.2",
    modelDefault: "deepinfra/deepseek-ai/DeepSeek-V3.2",
    keyPlaceholder: "DEEPINFRA_API_KEY",
    keyPrefixes: ["sk-"],
    description: "DeepInfra OpenAI 相容模型。",
  },
  {
    id: "ds4",
    shortName: "DS4",
    displayName: "DS4",
    authMode: "api-key",
    modelPlaceholder: "ds4/default",
    modelDefault: "ds4/default",
    keyPlaceholder: "DS4_API_KEY",
    description: "OpenClaw provider docs: DS4 provider。",
  },
  {
    id: "elevenlabs",
    shortName: "ElevenLabs",
    displayName: "ElevenLabs",
    authMode: "api-key",
    modelPlaceholder: "elevenlabs/voice",
    modelDefault: "elevenlabs/voice",
    keyPlaceholder: "ELEVENLABS_API_KEY",
    description: "OpenClaw provider docs: ElevenLabs provider（語音合成）。",
  },
  {
    id: "fal",
    shortName: "fal",
    displayName: "fal.ai",
    authMode: "api-key",
    modelPlaceholder: "fal/default",
    modelDefault: "fal/default",
    keyPlaceholder: "FAL_KEY",
    description: "OpenClaw provider docs: fal provider。",
  },
  {
    id: "fireworks",
    shortName: "Fireworks",
    displayName: "Fireworks AI",
    authMode: "api-key",
    modelPlaceholder: "fireworks/default",
    modelDefault: "fireworks/default",
    keyPlaceholder: "FIREWORKS_API_KEY",
    description: "OpenClaw provider docs: Fireworks model provider。",
  },
  {
    id: "gradium",
    shortName: "Gradium",
    displayName: "Gradium",
    authMode: "api-key",
    modelPlaceholder: "gradium/default",
    modelDefault: "gradium/default",
    keyPlaceholder: "GRADIUM_API_KEY",
    description: "OpenClaw provider docs: Gradium provider。",
  },
  {
    id: "github-copilot",
    shortName: "GitHub Copilot",
    displayName: "GitHub Copilot",
    authMode: "api-key",
    modelPlaceholder: "copilot/default",
    modelDefault: "copilot/default",
    keyPlaceholder: "COPILOT_GITHUB_TOKEN",
    description: "使用 GitHub Copilot Token 的模型代理。",
  },
  {
    id: "minimax",
    shortName: "MiniMax",
    displayName: "MiniMax",
    authMode: "api-key",
    modelPlaceholder: "minimax/MiniMax-M2.7",
    modelDefault: "minimax/MiniMax-M2.7",
    keyPlaceholder: "MINIMAX_API_KEY",
    keyPrefixes: ["sk-", "minimax_"],
    description: "MiniMax 模型服務。",
  },
  {
    id: "glm",
    shortName: "GLM",
    displayName: "GLM",
    authMode: "api-key",
    modelPlaceholder: "glm/glm-4.7",
    modelDefault: "glm/glm-4.7",
    keyPlaceholder: "GLM_API_KEY",
    description: "OpenClaw provider docs: GLM provider。",
  },
  {
    id: "inferrs",
    shortName: "Inferrs",
    displayName: "Inferrs",
    authMode: "api-key",
    modelPlaceholder: "inferrs/default",
    modelDefault: "inferrs/default",
    keyPlaceholder: "INFERRS_API_KEY",
    description: "OpenClaw provider docs: Inferrs provider。",
  },
  {
    id: "index",
    shortName: "Index",
    displayName: "Index",
    authMode: "api-key",
    modelPlaceholder: "index/default",
    modelDefault: "index/default",
    keyPlaceholder: "INDEX_API_KEY",
    description: "OpenClaw provider docs: Index provider。",
  },
  {
    id: "inworld",
    shortName: "Inworld",
    displayName: "Inworld",
    authMode: "api-key",
    modelPlaceholder: "inworld/default",
    modelDefault: "inworld/default",
    keyPlaceholder: "INWORLD_API_KEY",
    description: "OpenClaw provider docs: Inworld provider。",
  },
  {
    id: "litellm",
    shortName: "LiteLLM",
    displayName: "LiteLLM",
    authMode: "local-endpoint",
    modelPlaceholder: "openai/gpt-5.5",
    modelDefault: "openai/gpt-5.5",
    endpointPlaceholder: "http://127.0.0.1:4000/v1",
    keyPlaceholder: "LITELLM_API_KEY",
    description: "OpenClaw provider docs: LiteLLM OpenAI-compatible router。",
  },
  {
    id: "minimax-portal",
    shortName: "MiniMax Portal",
    displayName: "MiniMax Portal",
    authMode: "api-key",
    modelPlaceholder: "minimax/MiniMax-M2.7",
    modelDefault: "minimax/MiniMax-M2.7",
    keyPlaceholder: "MINIMAX_OAUTH_TOKEN",
    description: "MiniMax Coding Plan 專用入口。",
  },
  {
    id: "moonshot",
    shortName: "Moonshot",
    displayName: "Moonshot",
    authMode: "api-key",
    modelPlaceholder: "moonshot/kimi-k2.6",
    modelDefault: "moonshot/kimi-k2.6",
    keyPlaceholder: "MOONSHOT_API_KEY",
    keyPrefixes: ["sk-", "moonshot_"],
    description: "Moonshot Kimi model 平台。",
  },
  {
    id: "nvidia",
    shortName: "NVIDIA",
    displayName: "NVIDIA",
    authMode: "api-key",
    modelPlaceholder: "nvidia/nvidia/nemotron-3-super-120b-a12b",
    modelDefault: "nvidia/nvidia/nemotron-3-super-120b-a12b",
    keyPlaceholder: "NVIDIA_API_KEY",
    description: "NVIDIA 平台模型。",
  },
  {
    id: "qianfan",
    shortName: "Qianfan",
    displayName: "Qianfan",
    authMode: "api-key",
    modelPlaceholder: "qianfan/deepseek-v3.2",
    modelDefault: "qianfan/deepseek-v3.2",
    keyPlaceholder: "QIANFAN_API_KEY",
    keyPrefixes: ["sk-", "qf_"],
    description: "百度 Qianfan。",
  },
  {
    id: "qwen",
    shortName: "Qwen",
    displayName: "Qwen",
    authMode: "api-key",
    modelPlaceholder: "qwen/qwen3.5-plus",
    modelDefault: "qwen/qwen3.5-plus",
    keyPlaceholder: "QWEN_API_KEY",
    keyPrefixes: ["sk-", "qwen_"],
    description: "Qwen Cloud / DashScope。",
  },
  {
    id: "kimi",
    shortName: "Kimi",
    displayName: "Kimi Coding",
    authMode: "api-key",
    modelPlaceholder: "kimi/kimi-for-coding",
    modelDefault: "kimi/kimi-for-coding",
    keyPlaceholder: "KIMI_API_KEY",
    keyPrefixes: ["sk-", "kimi_"],
    description: "Kimi Coding 平台入口。",
  },
  {
    id: "kilocode",
    shortName: "Kilo Gateway",
    displayName: "Kilo Gateway",
    authMode: "api-key",
    modelPlaceholder: "kilocode/kilo/auto",
    modelDefault: "kilocode/kilo/auto",
    keyPlaceholder: "KILOCODE_API_KEY",
    description: "Kilo Gateway 聚合式入口。",
  },
  {
    id: "opencode",
    shortName: "OpenCode",
    displayName: "OpenCode",
    authMode: "api-key",
    modelPlaceholder: "opencode/claude-opus-4-6",
    modelDefault: "opencode/claude-opus-4-6",
    keyPlaceholder: "OPENCODE_API_KEY",
    keyPrefixes: ["sk-"] ,
    description: "OpenCode Zen runtime。",
  },
  {
    id: "opencode-go",
    shortName: "OpenCode Go",
    displayName: "OpenCode Go",
    authMode: "api-key",
    modelPlaceholder: "opencode-go/kimi-k2.6",
    modelDefault: "opencode-go/kimi-k2.6",
    keyPlaceholder: "OPENCODE_ZEN_API_KEY",
    keyPrefixes: ["sk-"] ,
    description: "OpenCode Go runtime。",
  },
  {
    id: "runway",
    shortName: "Runway",
    displayName: "Runway",
    authMode: "api-key",
    modelPlaceholder: "runway/gpt",
    modelDefault: "runway/gpt",
    keyPlaceholder: "RUNWAY_API_KEY",
    description: "Runway 模型供應層。",
  },
  {
    id: "senseaudio",
    shortName: "SenseAudio",
    displayName: "SenseAudio",
    authMode: "api-key",
    modelPlaceholder: "senseaudio/default",
    modelDefault: "senseaudio/default",
    keyPlaceholder: "SENSEAUDIO_API_KEY",
    description: "OpenClaw provider docs: SenseAudio provider（語音能力）。",
  },
  {
    id: "stepfun",
    shortName: "StepFun",
    displayName: "StepFun",
    authMode: "api-key",
    modelPlaceholder: "stepfun/step-3.5-flash",
    modelDefault: "stepfun/step-3.5-flash",
    keyPlaceholder: "STEPFUN_API_KEY",
    keyPrefixes: ["sk-", "sf_"],
    description: "StepFun 模型入口。",
  },
  {
    id: "stepfun-plan",
    shortName: "StepFun Plan",
    displayName: "StepFun Plan",
    authMode: "api-key",
    modelPlaceholder: "stepfun/step-3.5-flash",
    modelDefault: "stepfun/step-3.5-flash",
    keyPlaceholder: "STEPFUN_API_KEY",
    keyPrefixes: ["sk-", "sf_"],
    description: "StepFun coding surface。",
  },
  {
    id: "together",
    shortName: "Together AI",
    displayName: "Together",
    authMode: "api-key",
    modelPlaceholder: "together/moonshotai/Kimi-K2.5",
    modelDefault: "together/moonshotai/Kimi-K2.5",
    keyPlaceholder: "TOGETHER_API_KEY",
    keyPrefixes: ["sk-"] ,
    description: "Together 代理。",
  },
  {
    id: "venice",
    shortName: "Venice AI",
    displayName: "Venice",
    authMode: "api-key",
    modelPlaceholder: "venice/default",
    modelDefault: "venice/default",
    keyPlaceholder: "VENICE_API_KEY",
    description: "Venice AI 平台。",
  },
  {
    id: "volcengine",
    shortName: "Volcengine",
    displayName: "Volcengine",
    authMode: "api-key",
    modelPlaceholder: "volcengine/doubao-seed-1-8-251228",
    modelDefault: "volcengine/doubao-seed-1-8-251228",
    keyPlaceholder: "VOLCANO_ENGINE_API_KEY",
    keyPrefixes: ["sk-", "vo_"],
    description: "火山引擎 Doubao 通道。",
  },
  {
    id: "volcengine-plan",
    shortName: "Volcengine Plan",
    displayName: "Volcengine Plan",
    authMode: "api-key",
    modelPlaceholder: "volcengine-plan/ark-code-latest",
    modelDefault: "volcengine-plan/ark-code-latest",
    keyPlaceholder: "VOLCANO_ENGINE_API_KEY",
    keyPrefixes: ["sk-", "vo_"],
    description: "火山引擎 coding surface。",
  },
  {
    id: "xiaomi",
    shortName: "Xiaomi",
    displayName: "Xiaomi",
    authMode: "api-key",
    modelPlaceholder: "xiaomi/mimo-v2-flash",
    modelDefault: "xiaomi/mimo-v2-flash",
    keyPlaceholder: "XIAOMI_API_KEY",
    keyPrefixes: ["sk-", "xm_"],
    description: "Xiaomi MiMo 平台。",
  },
  {
    id: "xai",
    shortName: "xAI",
    displayName: "xAI",
    authMode: "api-key",
    modelPlaceholder: "grok-beta",
    modelDefault: "grok-beta",
    keyPlaceholder: "xai-...",
    description: "xAI API。",
  },
  {
    id: "groq",
    shortName: "Groq",
    displayName: "Groq",
    authMode: "api-key",
    modelPlaceholder: "llama-3.1-70b-versatile",
    modelDefault: "llama-3.1-70b-versatile",
    keyPlaceholder: "gsk_...",
    keyPrefixes: ["gsk_", "xai-"],
    description: "Groq API。",
  },
  {
    id: "mistral",
    shortName: "Mistral",
    displayName: "Mistral",
    authMode: "api-key",
    modelPlaceholder: "mistral-large-latest",
    modelDefault: "mistral-large-latest",
    keyPlaceholder: "mist_...",
    description: "Mistral API。",
  },
  {
    id: "azure-openai",
    shortName: "Azure OpenAI",
    displayName: "Azure OpenAI",
    authMode: "local-endpoint",
    modelPlaceholder: "gpt-4.1",
    modelDefault: "gpt-4.1",
    endpointPlaceholder: "https://xxx.openai.azure.com/openai/deployments/xxx/chat/completions",
    keyPlaceholder: "Azure API key",
    description: "Azure OpenAI 相容 API endpoint。",
  },
  {
    id: "cerebras",
    shortName: "Cerebras",
    displayName: "Cerebras",
    authMode: "api-key",
    modelPlaceholder: "llama-4-maverick",
    modelDefault: "llama-4-maverick",
    keyPlaceholder: "CEREBRAS_API_KEY",
    description: "Cerebras API。",
  },
  {
    id: "microsoft-foundry",
    shortName: "Microsoft Foundry",
    displayName: "Microsoft Foundry",
    authMode: "api-key",
    modelPlaceholder: "microsoft-foundry/default",
    modelDefault: "microsoft-foundry/default",
    keyPlaceholder: "MICROSOFT_FOUNDRY_API_KEY",
    description: "OpenClaw extension provider: Microsoft Foundry。",
  },
  {
    id: "zai",
    shortName: "Z.AI",
    displayName: "Z.AI（GLM）",
    authMode: "api-key",
    modelPlaceholder: "zai/glm-4.7",
    modelDefault: "zai/glm-4.7",
    keyPlaceholder: "ZAI_API_KEY",
    description: "Z.AI / GLM。",
  },
  {
    id: "vercel-ai-gateway",
    shortName: "Vercel AI Gateway",
    displayName: "Vercel AI Gateway",
    authMode: "api-key",
    modelPlaceholder: "anthropic/claude-sonnet-4-5",
    modelDefault: "anthropic/claude-sonnet-4-5",
    keyPlaceholder: "AI_GATEWAY_API_KEY",
    description: "Vercel AI Gateway API。",
  },
  {
    id: "synthetic",
    shortName: "Synthetic",
    displayName: "Synthetic",
    authMode: "api-key",
    modelPlaceholder: "synthetic/default",
    modelDefault: "synthetic/default",
    keyPlaceholder: "SYNTHETIC_API_KEY",
    description: "OpenClaw provider docs: Synthetic provider。",
  },
  {
    id: "tencent",
    shortName: "Tencent",
    displayName: "Tencent Cloud",
    authMode: "api-key",
    modelPlaceholder: "tencent/hunyuan",
    modelDefault: "tencent/hunyuan",
    keyPlaceholder: "TENCENT_API_KEY",
    description: "OpenClaw provider docs: Tencent provider。",
  },
  {
    id: "huggingface",
    shortName: "Hugging Face",
    displayName: "Hugging Face Inference",
    authMode: "api-key",
    modelPlaceholder: "deepseek-ai/DeepSeek-R1",
    modelDefault: "deepseek-ai/DeepSeek-R1",
    keyPlaceholder: "HF_TOKEN",
    description: "Hugging Face Inference API。",
  },
  {
    id: "vydra",
    shortName: "Vydra",
    displayName: "Vydra",
    authMode: "api-key",
    modelPlaceholder: "vydra/default",
    modelDefault: "vydra/default",
    keyPlaceholder: "VYDRA_API_KEY",
    description: "OpenClaw provider docs: Vydra provider。",
  },
  {
    id: "qwen-portal",
    shortName: "Qwen",
    displayName: "Qwen",
    authMode: "oauth",
    modelPlaceholder: "qwen/coder",
    modelDefault: "qwen/coder",
    accountPlaceholder: "Qwen 帳號 Email",
    description: "Qwen OAuth/Portal。",
  },
  {
    id: "ollama",
    shortName: "Ollama",
    displayName: "Ollama",
    authMode: "local-endpoint",
    modelPlaceholder: "llama3.3",
    modelDefault: "llama3.3",
    endpointPlaceholder: "http://127.0.0.1:11434",
    description: "本機模型 server（Ollama）。",
  },
  {
    id: "lmstudio",
    shortName: "LM Studio",
    displayName: "LM Studio",
    authMode: "local-endpoint",
    modelPlaceholder: "local-model",
    modelDefault: "local-model",
    endpointPlaceholder: "http://127.0.0.1:1234/v1",
    description: "本機 OpenAI 相容伺服器。",
  },
  {
    id: "vllm",
    shortName: "vLLM",
    displayName: "vLLM",
    authMode: "local-endpoint",
    modelPlaceholder: "your-model-id",
    modelDefault: "your-model-id",
    endpointPlaceholder: "http://127.0.0.1:8000/v1",
    keyPlaceholder: "vllm-local",
    description: "本機或自架 vLLM 相容 endpoint。",
  },
  {
    id: "sglang",
    shortName: "SGLang",
    displayName: "SGLang",
    authMode: "local-endpoint",
    modelPlaceholder: "your-model-id",
    modelDefault: "your-model-id",
    endpointPlaceholder: "http://127.0.0.1:30000/v1",
    keyPlaceholder: "sglang-local",
    description: "本機或自架 SGLang 相容 endpoint。",
  },
  {
    id: "local-model",
    shortName: "本機模型",
    displayName: "本機模型",
    authMode: "local-endpoint",
    modelPlaceholder: "llama3.2",
    modelDefault: "llama3.2",
    endpointPlaceholder: "http://127.0.0.1:11434",
    description: "通用本機/OpenAI 相容 endpoint。",
  },
  {
    id: "mock",
    shortName: "Mock Gateway",
    displayName: "Mock Gateway",
    authMode: "mock",
    modelPlaceholder: "mock-model",
    modelDefault: "mock-model",
    description: "本機 Mock 回覆與測試模式。",
  },
];

export const defaultProviderSession: ProviderSession = {
  activeProvider: "mock",
  status: "connected",
  displayName: "Mock Gateway",
  detail: "目前使用本機 mock provider，可驗證桌面端流程。",
};

export const openAiAuthRoutes: OpenAiAuthRoute[] = [
  {
    id: "openai-codex-oauth",
    label: "ChatGPT / Codex 帳號登入",
    provider: "openai-codex",
    modelRef: "openai/gpt-5.5",
    auth: "oauth",
    secretStorage: "oauth-profile",
    desktopPolicy: "桌面端只保存已授權狀態與帳號 Email，不保存密碼、cookie 或 refresh token。",
  },
  {
    id: "openai-api-key",
    label: "OpenAI API key",
    provider: "openai",
    modelRef: "openai/gpt-5.5",
    auth: "api-key",
    secretStorage: "api-key-profile",
    desktopPolicy: "API key 只進本機受控設定流程；診斷、log、UI 不輸出明文。",
  },
];

export function providerIdsByAuthMode(authMode: ProviderAuthMode): ProviderId[] {
  return llmProviderCatalog.filter((provider) => provider.authMode === authMode).map((provider) => provider.id);
}

export function providerStatusLabel(status: ProviderStatus): string {
  if (status === "connected") return "已連線";
  if (status === "configured") return "已設定";
  if (status === "account-required") return "需網站帳號登入";
  return "未連線";
}

export function providerName(provider: ProviderId): string {
  return llmProviderCatalog.find((item) => item.id === provider)?.displayName ?? provider;
}

export function isProviderId(value: string): value is ProviderId {
  return llmProviderCatalog.some((provider) => provider.id === value);
}

export function canonicalProviderForSession(providerId: ProviderId): ProviderId {
  return providerId;
}
