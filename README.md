# ClawDesk Desktop MVP

This repository publishes the macOS mainline and is released under `PolyForm Noncommercial 1.0.0`. The Windows version lives in [ClawDesk Windows repo](https://github.com/silentposture/clawdesk).

ClawDesk is an OpenClaw-compatible, local-first macOS desktop AI platform. Public inspection, forks, PRs, and multi-editor collaboration are welcome, but commercial use, resale, hosted paid use, and any direct or indirect monetization are prohibited. Model capability comes from the user’s own ChatGPT Pro, API key, or local Ollama/LLM provider; there is no paid unlock, subscription wall, or commercial license in this repository.

Developer note: Alisonsoftware is a personal developer display name, not a company, legal entity, partnership, or agency name. General support, project collaboration, and privacy contact: `huangkuoling@gmail.com`. If public legal or support contact details are needed later, they will be disclosed separately.

New public documentation is written in English first; legacy Chinese text remains only where it has not yet been migrated.

## Current Focus

- 優先支援 macOS 桌面 app 體驗。
- 產品名稱、Tauri `productName` 與視窗標題為 `ClawDesk`；npm package、Cargo crate 與 bundle identifier 保留原值以避免破壞 build path。
- Tauri 視窗使用 macOS overlay title bar，頂部區域保留交通燈按鈕空間。
- 打包目標先鎖定 `.app` 與 `.dmg`。
- 核心功能預設全部開放，不設付費解鎖或功能鎖；授權與帳號面板僅保留作相容性、測試與協作驗證。
- macOS 桌面代理能力採 AX-first：先讀 Accessibility tree 與 active window metadata，再做低風險預演；高風險操作固定停在人工授權提示，不自動執行。
- Windows 版本在 [ClawDesk Windows repo](https://github.com/silentposture/clawdesk)；Linux 原生整合先保留架構接口，不作為目前主要開發目標。

## Browser Dev Mode

啟動 mock Gateway：

```sh
npm run gateway
```

啟動 React/Vite 前端：

```sh
npm run dev
```

開啟：

```txt
http://127.0.0.1:5173/
```

瀏覽器開發模式會連到 `http://127.0.0.1:18790` 的 mock Gateway。

## macOS Tauri 桌面 App 模式

請先安裝 Rust toolchain：

```sh
rustup default stable
```

接著執行：

```sh
npm run tauri:dev:mac
```

建立 macOS `.app` / `.dmg`：

```sh
npm run tauri:build:mac
```

針對 Apple Silicon / M4 原生最佳化建置：

```sh
npm run tauri:build:m4
```

Tauri 外殼提供 Gateway 探測/啟動與權限回覆命令。開發模式會透過 Node 啟動 mock Gateway。macOS 打包會先把 mock Gateway 腳本作為 app resource 放入 bundle；之後若要產品化，再替換成簽章後的 sidecar binary，並維持相同 Gateway 合約。

## macOS / Apple M4 效能策略

- Rust release profile 啟用 LTO、單一 codegen unit、`opt-level = 3`、`panic = "abort"` 與 strip，降低啟動與執行開銷。
- Cargo 預設 target 為 `aarch64-apple-darwin`，並用 `target-cpu=native` 讓本機 M4 編譯時產生 Apple Silicon 原生最佳化。
- mock Gateway sidecar 以 `NODE_ENV=production` 與 `--max-old-space-size=128` 啟動，避免開發期記憶體無限制膨脹。
- Tauri 關閉時會清理 sidecar 子程序，避免背景程序殘留。
- React 串流文字用 `requestAnimationFrame` 批次更新，降低 token streaming 造成的重繪頻率。
- 聊天訊息保留最近 80 筆，避免長時間使用時 UI 記憶體持續成長。
- 主要滾動區與卡片使用 CSS containment / content visibility，減少 WebView layout 與 paint 成本。

## 事件合約

前端只接受以下可序列化 Gateway 事件：

- `agent.message.delta`
- `agent.message.done`
- `canvas.begin`
- `canvas.patch`
- `canvas.data`
- `permission.request`
- `permission.result`
- `gateway.status`

Canvas payload 是宣告式資料，會映射到受信任的 React 元件型錄：`Text`、`Button`、`Table`、`Metric`、`List`、`Progress`、`Panel`。

## AI 模型與連線設定

桌面端設定面板目前提供 OpenClaw-compatible provider/模式：

- `ChatGPT Pro`：需要使用者先完成 ChatGPT 網站 Pro 帳號登入；桌面端只登錄帳號 Email 與連線狀態，不保存密碼、不擷取 cookie，也不把 ChatGPT Pro 當成 API key。
- `OpenAI Codex OAuth`：參考 OpenClaw upstream 的 Codex OAuth 路徑，帳號登入 profile 可供 canonical `openai/gpt-*` route 使用；桌面端只做安全 handoff 與狀態紀錄。
- `OpenAI API key`：供後續真正 API 呼叫使用。MVP 只把 key 暫存在本機 mock Gateway 記憶體，並可在 GUI 內指定模型。
- `其他 API provider`：已納入 OpenClaw provider docs 中常見 LLM 供應商目錄，例如 Anthropic、Google、OpenRouter、Perplexity、Bedrock、Fireworks、LiteLLM、Microsoft Foundry、Tencent、Groq、Mistral、xAI 等，先以 mock contract 驗證設定與遮罩，不直接呼叫真實外部服務。
- `本機模型`：在 GUI 內設定 Ollama、LM Studio、vLLM、SGLang 或 OpenAI-compatible local endpoint；MVP 僅允許 `127.0.0.1` / `localhost` endpoint。
- `Mock Gateway`：預設模式，用來開發桌面 UI、串流事件、Live Canvas 與權限流程。

注意：ChatGPT Pro 訂閱與 OpenAI API 是不同平台與不同計費系統。正式 AI 呼叫應接官方 API key 或使用者明確設定的本機模型 endpoint。

## 工作區

- 工作區左側提供專案分類：`全部`、`AI 代理`、`資料分析`、`文件工作`、`系統自動化`。
- 專案可釘選，釘選專案會排序在前。
- 可切換「只顯示釘選專案」，方便把常用專案固定在工作流前排。

## MCP 與 Microsoft 文書能力

桌面端已新增 MCP 連接器中心，從 `MCP` 按鈕開啟。MVP 先提供 mock adapter，建立安全邊界與 UI 合約：

- `Word`：文件摘要、修訂建議。
- `Excel`：資料檢查、圖表草稿。
- `PowerPoint`：簡報大綱。
- `Outlook`：回信草稿，不自動寄送。
- `OneDrive`：受信任工作區與授權雲端文件搜尋。
- `Google Drive / Docs / Sheets / Slides`：搜尋、摘要、資料檢查與簡報大綱。
- `Gmail / Google Calendar`：草稿與排程建議，不自動寄送、不直接建立活動。
- `Browser / Chrome / 螢幕 GUI`：網際網路搜尋、受控瀏覽器與授權後的螢幕視覺辨識。
- `程式開發工具`：VS Code、Xcode、JetBrains、GitHub、GitLab、Docker、Terminal。
- `工程與設計軟體`：AutoCAD、Fusion 360、SolidWorks、MATLAB、Jupyter。
- `雲端服務`：AWS、Azure、Google Cloud、Cloudflare、Vercel、Supabase。

目前 MCP 已具備 production-ready contract：connector catalog、OAuth/API protocol metadata、scope grant、撤銷、audit trail 與動作預演。mock Gateway 不會直接修改本機文件、寄信、建立行事曆活動或連接真實帳號；中高風險工具會轉成 `permission.request`，必須由使用者在桌面 UI 允許後才可進入正式執行階段。後續可把同一個 `/mcp/*` adapter 邊界替換為真正 MCP server、Microsoft Graph、Google API、Chrome DevTools、GitHub API、雲端 API、AppleScript/JXA 或文件處理 sidecar。

Microsoft Graph 是第一條真實 OAuth scaffold：`/mcp/microsoft/oauth/start` 產生含 PKCE/state/scope 的 Microsoft authorize URL，`/mcp/microsoft/oauth/callback` 僅在後端 production credentials 完整時交換 token，並只保存 server-side token hash / grant metadata；沒有 credentials 時會以 `CLWD-MCP-MS-9001` fail-closed。桌面端不保存 Microsoft client secret、access token 或 refresh token。

## 安全沙盒、多模態上傳與快速設定

新程式啟動時會先顯示快速設定，引導一般使用者設定：

- 專案資料夾：所有上傳檔案都先複製到專案資料夾的 `uploads`，再做分析或改寫。
- 備份資料夾：專案內每次改動前先備份。
- 專案外改動：任何超出專案資料夾的改動都需要人工授權。
- 不主動刪除：刪除動作不自動執行。
- 多模態資料：文件、試算表、簡報、圖片、音訊、影片、壓縮檔都走上傳副本流程。
- 網際網路與螢幕 GUI 視覺辨識：可在權限面板啟用，並透過 tooltip 說明用途。

## 多媒體與文字記錄

`媒體` 面板列出桌面端自帶的本機處理能力，所有檔案仍先複製到專案沙盒再分析或轉換：

- 影片：macOS AVFoundation / VideoToolbox，支援 mp4、mov、m4v、HEVC、H.264，優先 Apple Silicon 硬體加速。
- 音訊：macOS CoreAudio，支援 mp3、wav、m4a、aac、flac，可作為逐字稿與會議摘要前處理。
- 圖片：macOS CoreImage / ImageIO，支援 png、jpg、webp、heic、tiff，先建立縮圖與預覽副本。
- 文字記錄：Rust 本機索引器合約，支援 txt、md、jsonl、log、csv，保留聊天、操作與工具輸出記錄。

MVP 先建立桌面 GUI、Gateway 合約與安全限制；正式產品化時可把相同合約接到簽章後的 ffmpeg/Whisper/OCR sidecar 或原生 Rust adapter。

## 學習模式

`學習` 面板用來觀察人類一般操作，拆解成可審核的自動化工作流草稿。安全預設如下：

- 必須由使用者按下「開始學習」才會記錄。
- 不記錄密碼、token、付款資料或私密欄位。
- 螢幕影像只在授權後做摘要，不保存原始畫面。
- 停止學習後只建立草稿工作流，正式啟用前仍需人工審核與授權。
- 檔案動作、跨專案動作與中高風險步驟會標記為需要人工授權。

## OpenClaw 完整設定導引

`相容` 面板把 OpenClaw-compatible 的複雜設定搬成兩層：

- 一般設定：用「你要做什麼」「要用哪個 AI」「專案資料夾在哪」「要不要網路/螢幕辨識」帶使用者完成。
- 進階設定：保留底層 key 對照，例如 `agents.defaults.workspace`、`models.providers`、`channels.telegram`、`gateway.auth`、`tools.web.search`、`contextPruning`。

目前已整理的 OpenClaw-compatible 設定群組：

- 工作區與專案沙盒：workspace、project config。
- 模型與 AI 供應商：providers、primary model、fallbacks、model params。
- Agent 身分、多 Agent 與記憶：identity、memory、concurrency。
- 訊息頻道：Telegram、Discord、WhatsApp、Slack/Teams。
- Gateway 與背景服務：mode、bind、port、auth、daemon。
- 祕密、安全與權限：`.env`、SecretRef、API key、sandbox policy。
- Plugins、Skills、Tools、多模態：web search、media/audio、plugins、skills。
- Hooks 與進階行為：BOOT/HEARTBEAT、context pruning、compaction、messages、commands、update。

## 自動化排程與工作流

`工作流` 面板提供範本與排程管理：

- 每日文件摘要：Drive 搜尋與 Docs 摘要。
- 每週文書報告：Excel/Sheets 檢查與 Slides 大綱。
- 信件與行事曆追蹤：Gmail 草稿與 Calendar 建議。

工作流建立後先是草稿，包含跨專案或中高風險步驟時仍會走人工授權。

## 通訊頻道

`通訊` 面板用來搭建聊天軟體與 ClawDesk 桌面程式的入口。MVP 只做設定、允許名單、串流模式與測試訊息預覽，不會直接送出外部訊息。

每個頻道都有桌面內建的逐步設定精靈，會用對話式卡片拆解「去哪裡建立 token」「要貼什麼欄位」「允許誰使用」「如何先做不送出的測試預覽」。Telegram 會從 BotFather 建 bot 開始引導，適合非 IT 使用者照著一步一步完成。

- Telegram：BotFather token、允許使用者/群組。
- Discord：bot token、application id、允許 server/channel。
- WhatsApp：phone number id、access token、verify token。
- Slack：bot token、app token、signing secret。
- Microsoft Teams：tenant/team/channel allowlist。
- Gmail / Email：draft-only 原則，寄送前人工確認。
- LINE：Messaging API channel token / secret。
- Matrix：homeserver、room allowlist。
- iMessage：macOS 本機訊息預覽，正式版需額外隱私授權。

所有通訊頻道啟用與測試都走授權預覽；高風險頻道不會自動寄信、發訊息或加入群組。

## 帳號與多人協作

`帳號` 面板用來建立多入口登入與授權狀態，方便後續工作流依照專案與指定軟體進行多人協作。MVP 不保存密碼、不保存真 token，只保存 mock 授權狀態與 scope。

- ChatGPT Pro：AI 對話與工作流協助狀態。
- Google Workspace：Drive、Gmail、Calendar scopes。
- Microsoft 365：OneDrive/Office、Outlook、Teams scopes。
- GitHub：repository、issue/PR 草稿 scopes。
- Slack / LINE / Email：通訊草稿與允許名單。
- 雲端服務帳號：AWS、Azure、Google Cloud、Cloudflare、Vercel、Supabase 的讀取與變更計畫 scopes。

每個帳號可設定協作角色：擁有者、管理員、編輯者、檢視者、自動化服務帳號。高風險 scope 會要求人工授權。

## 授權、更新與診斷

`授權` 面板已加入 Lemon Squeezy License API + Keygen 相容離線票券架構：

- `授權` 面板保留作 mock / 相容性驗證，不代表付費解鎖機制。
- 更新系統提供 `/updates/manifest` 與 `/updates/check`：manifest 內含 macOS DMG download URL、release notes、版本日期與 `supportUpdatesUntil` 資格規則；到期後仍保留最後符合資格版本，但核心功能不因付款而關閉。
- macOS machine fingerprint 只保存 salted hash，不保存明文 CPU/主機板序號。

目前 MAC 專案也已開始對齊 NaviaWorks `UniversalServer` 接入規範：canonical API 入口改為 `/api/auth/*`、`/api/account/entitlements`、`/api/license/*`、`/api/webhooks/lemonsqueezy`。既有 `/auth/*`、`/licenses/*`、`/license/*` 仍保留作相容層，避免打斷現有 GUI 與 smoke tests。

`版權` 面板顯示 ClawDesk 非商業授權、安裝同意條款、OpenClaw-compatible 聲明、OpenClaw upstream notice、第三方 NOTICE、隱私與使用者內容權利。使用者保留輸入、上傳檔案、專案資料與 AI 輸出內容權利；ClawDesk 不主張使用者內容所有權。

安裝與發布條款草案放在 `docs/legal/INSTALLER_TERMS.md`，並會被打包到 Tauri app resources 的 `legal/INSTALLER_TERMS.md`。OpenClaw upstream notice 放在 `docs/legal/OPENCLAW_MIT_NOTICE.md`，並會被打包到 `legal/OPENCLAW_MIT_NOTICE.md`。這兩份文件是歷史/規劃草案，不構成法律意見；若未來要轉為其他發行方案，需另外建立獨立條款與法務審閱流程。

`診斷` 面板會在本機建立非個資診斷包，使用者確認後才送出或匯出。診斷包不包含 Email、完整路徑、完整金鑰、API key、聊天內容、螢幕截圖或 Lemon Squeezy customer id 明文，故障碼格式為 `CLWD-AREA-NNNN`。

## 記憶、Agent 與人體工學驗證

- `記憶` 面板：SQLite mock 索引 + Markdown/YAML mock 可讀記憶，支援釘選事實、長期記憶、Context token 估算與壓縮。
- `Agent` 面板：預設個人助理、文書助理、自動化助理、研究助理；每個 Agent 有獨立模型、工具權限、工作區、知識庫、記憶範圍與學習模式。
- `驗證` 面板：GUI 人體工學 smoke tests，檢查任務步數、最小視窗、文字不溢出、鍵盤可達、tooltip coverage 與危險操作提示，產生 ergonomics score。

## 驗證

```sh
npm test
npm run build
npm run verify:mvp
npm run release:guard
```

`cargo test` 需要先安裝 Rust/Cargo，且 `cargo` 必須在 `PATH` 中。

## 發佈前檢查

`npm run release:guard` 是 mock 候選版檢查，會確認 ClawDesk 品牌、Tauri 版本、legal manifest、bundle resources 與可用 artifact 狀態。這個模式允許 mock Gateway、mock Lemon Squeezy 與 mock Keygen，但報告會明確標示 `mock-candidate`，不能視為正式發布版本。

桌面殼層有兩份 Tauri 設定：

- `src-tauri/tauri.conf.json`：開發與 mock 候選版，會打包 `sidecars/mock-gateway/server.mjs`。
- `src-tauri/tauri.prod.conf.json`：正式發布版，不打包 mock Gateway，只保留安裝條款與 OpenClaw upstream notice。正式版需由 `CLAWDESK_GATEWAY_BASE_URL` 指向 production Gateway，必要時用 `CLAWDESK_GATEWAY_WS_URL` 指定事件串流端點。

正式 production 發佈需使用：

```sh
CLAWDESK_RELEASE_CHANNEL=production npm run release:guard:strict
```

strict 模式會要求 Lemon Squeezy、Keygen、SSO、Apple Developer ID 簽章與 macOS notarization 相關環境變數；變數名稱請參考 `.env.production.example`。檢查報告只記錄環境變數是否存在，不會輸出 secret 值。

Release guard report 會輸出 production readiness matrix，分類包含：

- Legal：安裝條款、NOTICE 與 legal manifest 是否同步。
- Gateway：正式版是否已設定 production Gateway endpoint。
- Payment：僅作歷史/相容性驗證，不代表本倉庫提供收費功能。
- Licensing：僅作歷史/相容性驗證，不代表本倉庫提供收費功能。
- Identity：SSO issuer/client 是否存在。
- macOS：Apple Team、Developer ID certificate 與 notarization credential 是否存在。
- Packaging：正式打包 script 是否受 strict guard 保護、是否仍包含 mock resource、`.app` / `.dmg` artifact 是否存在。

正式發布打包入口必須使用 guard-protected scripts：

```sh
npm run tauri:build:prod:app
npm run tauri:build:prod:dmg
npm run sign:mac:notarize
```

若要用一個指令完成 DMG 打包與公證驗證，可改用：

```sh
npm run release:mac:build-and-notarize
```

這兩個指令會先執行 `CLAWDESK_RELEASE_CHANNEL=production npm run release:guard:strict`。只要仍打包 mock Gateway、缺少 Lemon Squeezy/Keygen/SSO production credentials、或缺少 Apple Developer ID 簽章/公證環境，就會在 build 前失敗，避免把 mock 候選版誤當正式發布版。`sign:mac:notarize` 在 macOS 環境會進行 `codesign`/`notarytool`/`stapler` 的最終驗證並產出報告。

Rust Gateway adapter 的啟動順序：

1. 若環境變數提供 `CLAWDESK_GATEWAY_BASE_URL`，只連線該 Gateway；健康檢查失敗就中止，不回退到 mock sidecar。
2. 正式 build 會設定 `CLAWDESK_BUILD_PROFILE=production`，Rust runtime 會停用 mock Gateway fallback；即使在開發機上執行 production app，也不能因 repo 中存在 mock script 而啟動 mock。
3. mock 候選版若未設定正式 Gateway，才使用本機 mock Gateway 偵測與 sidecar 啟動流程。
4. 權限結果會送到目前 active Gateway 的 `/permission-result`，避免正式版仍固定打到 mock port。

本機 production Gateway contract simulator：

```sh
npm run verify:production-gateway:sim
```

這個驗證會啟動 `backend/server.mjs` 與 `backend/production-gateway-sim.mjs`，由外部 Gateway 提供 `/health`、`/contract`、`/events`、`/chat`、`/permission-result`、`/identity/*`、`/license/*`、`/updates/check`、`/legal/*`、`/diagnostics/create-report`，並確認沒有啟動 `sidecars/mock-gateway/server.mjs`。它是 production runtime contract simulator，不是正式金流或授權服務。

本機 production backend adapter smoke：

```sh
npm run verify:backend:production
```

這個驗證會以 `CLAWDESK_BACKEND_ADAPTER_MODE=production` 啟動 `backend/server.mjs`，使用測試用 env 檢查 production readiness、Lemon Squeezy webhook HMAC 驗簽、Keygen Ed25519 offline license 驗證、機器雜湊不符 fail-closed、SSO/OIDC callback scaffold fail-closed，以及報告不含 secret 值。它不呼叫真實 Lemon Squeezy/Keygen 網路 API。

完整本機 release 候選驗證：

```sh
npm run qa:release:dmg
```

這會依序執行 preflight、release guard、unit tests、build、MVP/backend 驗證、backend production adapter smoke、production Gateway simulator、production preview GUI smoke、Cargo tests、Tauri `.app` smoke 與 DMG mount smoke。

## 後端服務數量與模擬部署

- **MVP 本機版**（最少後端）：`mock-gateway` 1 個服務即可。已覆蓋帳號、授權、MCP、工作流、記憶、診斷、人體工學與語音/影像能力驗證。
- **模擬完整授權與通知鏈路**：再加 `backend-auth`（模擬 Lemon Squeezy/Keygen + 訂閱 webhook）與 `mock-mail`（驗證信預覽）與可選 `reverse-proxy`，總計 3～4 個服務。
  - 不含 reverse-proxy：3 服務（gateway + backend-auth + mock-mail）
  - 含 reverse-proxy：4 服務
- **推薦環境差異**：
  - 開發者只測前端與事件合約：用 `docker-compose.mock-gateway.yml`。
  - 模擬帳號/授權全鏈路：用 `docker-compose.backend-sim.yml` + `docker-compose.mock-gateway.yml`。
  - 一鍵整體模擬：用 `docker-compose.mock-gateway.full.yml`（gateway + mock-mail + reverse-proxy）。

```sh
# 1) MVP（含 gateway）
npm run deploy:mock
npm run deploy:mock:logs
npm run deploy:mock:down

# 2) gateway + backend-auth + mail
npm run deploy:backend-sim
docker compose -f docker-compose.mock-gateway.yml -f docker-compose.backend-sim.yml up -d
docker compose -f docker-compose.mock-gateway.yml -f docker-compose.backend-sim.yml logs -f
docker compose -f docker-compose.mock-gateway.yml -f docker-compose.backend-sim.yml down

# 3) 一鍵完整模擬（含反向代理）
# 預設會自動偵測 docker：
# - 有 docker：使用 docker-compose 啟用 mock-gateway + mock-mail + reverse-proxy
# - 沒有 docker：降級為本機簡化堆疊（僅 mock gateway + backend，仍保留主要登入、授權與事件鏈路）
npm run deploy:mock:full
npm run deploy:mock:full:check
npm run deploy:mock:full:logs
npm run deploy:mock:full:down

# 4) 一鍵全鏈路（gateway + backend-auth + mail + reverse-proxy）
# 預設會自動偵測 docker：
# - 有 docker：使用 compose 啟動
# - 沒有 docker：自動降級為本機 Node stack（與 `npm run stack:local` 行為一致）
npm run deploy:full:stack
npm run deploy:full:stack:check
npm run deploy:full:stack:logs
npm run deploy:full:stack:down

# 5) 本機無 Docker fallback（本地 Node 啟動，適合 CI/開發機無 Docker 環境）
npm run stack:local
npm run stack:local:check
```

連線端點：

- mock-gateway：`http://127.0.0.1:18890`（WebSocket `ws://127.0.0.1:18890/events`）
- backend-auth：`http://127.0.0.1:19090`（Health `http://127.0.0.1:19090/health`）
- mock mail UI：`http://127.0.0.1:8025`
- 反向代理：`http://127.0.0.1:18889`（轉送 gateway）

完整部署說明、模擬架構與服務拆分，請見 `docs/backend-architecture-simulated-deploy.md`，裡面列出正式版的拆模建議（Gateway / 身分服務 / 授權服務 / 通知服務 / 觀測服務）。
## MAC 專案對應

- 請先參考 [MAC_P0_FEATURE_MAP.md](./MAC_P0_FEATURE_MAP.md)
- 檢查腳本與清單請參考 [MAC_P0_FEATURE_MAP_CHECKLIST.json](./MAC_P0_FEATURE_MAP_CHECKLIST.json)
- Windows 功能可加到 MAC 的自動判定請參考 [MAC_WINDOWS_FEATURE_ADOPTION_DECISIONS.json](./MAC_WINDOWS_FEATURE_ADOPTION_DECISIONS.json)
