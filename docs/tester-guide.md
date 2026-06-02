# ClawDesk 0.1.0 內測指南

本指南提供 ClawDesk 0.1.0 mock release candidate 的安裝、功能檢查與問題回報流程。此版本只用於內部驗證，不用於正式收款、正式授權或企業部署。

## 測試前提

- Apple Silicon Mac。
- 建議 macOS 13 或更新版本。
- 測試產物：`ClawDesk_0.1.0_aarch64.dmg`。
- 預期 DMG SHA-256：`acfbd5a424e1a0928c1f172dcf8ac464962fb104406dc7dcae3573d71396e16d`。
- 使用提供給測試者的帳號登入；不要在問題回報中提供密碼、API key、license key 或私人 token。

## 安裝檢查

1. 在終端機確認 DMG hash：

   ```bash
   shasum -a 256 /path/to/ClawDesk_0.1.0_aarch64.dmg
   ```

2. 確認輸出等於：

   ```text
   acfbd5a424e1a0928c1f172dcf8ac464962fb104406dc7dcae3573d71396e16d
   ```

3. 開啟 DMG。
4. 將 `ClawDesk.app` 拖到 Applications，或直接從掛載磁碟啟動。
5. 若 macOS 顯示安全提示，依內測規範使用右鍵開啟或到系統設定允許該 app；不要關閉 Gatekeeper 或修改系統安全設定。
6. 啟動後確認視窗標題與品牌顯示為 `ClawDesk`。

## 必測流程

### 1. 初次啟動與快速設定

- 確認第一次開啟會顯示條款、快速設定或引導流程。
- 確認可看到 OpenClaw-compatible 定位與授權/隱私提示。
- 確認 tooltip 會在主要設定項目 hover 時出現。

### 2. 登入與身份摘要

- 使用測試帳號登入。
- 確認身份摘要顯示目前帳號狀態。
- 若使用開發者測試帳號，確認 UI 顯示「開發者繞過授權已啟用」或同等狀態。
- 測試登出後，確認完整權限狀態不再顯示。

### 3. 核心桌面介面

- 確認第一畫面是可用桌面 agent UI，不是 landing page。
- 測試左側對話、右側 Live Canvas、狀態列、模型/來源指示。
- 輸入一段測試 prompt，確認文字 streaming、Canvas 更新與完成狀態正常。
- 觸發 mock 權限請求，分別測試允許與拒絕。

### 4. 專案與沙盒

- 使用 UI 選擇專案資料夾，不要手打路徑。
- 建立或切換專案分類。
- 測試釘選專案。
- 測試上傳本機檔案後，確認檔案是複製到專案資料夾後再處理。
- 嘗試專案外路徑操作時，確認會要求人工授權。

### 5. AI 模型供應商

- 測試 Mock provider。
- 測試 ChatGPT Pro handoff 狀態；此版本不應要求輸入或保存 ChatGPT 密碼。
- 測試 API provider 設定頁，只使用假的測試 key。
- 測試 Gemini provider 設定欄位是否可保存/清除。
- 測試 Ollama/local model host 設定是否可保存/清除。
- 確認 provider 切換後狀態列會更新。

### 6. 授權、更新與商業設定

- 開啟授權中心。
- 使用 mock Keygen license key 測試啟用流程。
- 確認可看到方案、裝置狀態、支援更新到期日、離線寬限期與更新資格。
- 測試 mock tamper 流程，確認授權降級並提示重新線上驗證。
- 開啟更新面板，確認目前版本、最新版本、可安裝版本與續買入口文案。

### 7. MCP、帳號、通訊與工作流

- 開啟 Microsoft、Google、瀏覽器、開發工具、工程軟體與雲端服務 catalog。
- 確認每個 connector 都有清楚用途、狀態與設定入口。
- 開啟帳號/SSO 設定，確認 Email、Apple、Google、Microsoft、企業 SSO 顯示合理。
- 開啟通訊軟體設定，確認 Telegram 等設定流程有分步引導。
- 建立一個 mock workflow，確認可儲存、預覽與停用。

### 8. Agent、知識庫、記憶與 Context

- 檢查預設 Agent：個人助理、文書助理、自動化助理、研究助理。
- 確認每個 Agent 有名稱、角色、模型、工具權限、工作區、知識庫、記憶範圍與學習設定。
- 測試新增知識來源 mock：雲端硬碟、資料庫、圖片集合或文件集合。
- 確認 Agent 知識庫預設隔離；共享知識需明確勾選。
- 開啟記憶與 Context 面板，確認 rolling summary、pinned facts、token 使用估算與壓縮狀態。

### 9. 學習模式與媒體能力

- 開啟學習模式。
- 確認流程固定為觀察、拆解、預演、授權執行。
- 確認高風險動作只能預演，執行前需要人工授權。
- 確認媒體面板列出影片、音頻、圖片、文字記錄能力。
- 確認不會記錄密碼、付款資料、token 或私密欄位。

### 10. 診斷與人體工學驗證

- 開啟故障回報面板。
- 產生診斷摘要，確認不含完整 Email、完整路徑、API key、license key、聊天內容或螢幕截圖。
- 測試匯出診斷包。
- 開啟 GUI 人體工學驗證儀表。
- 執行 smoke check，確認顯示 task steps、keyboard reachable、no text overflow、tooltip coverage、risk prompt coverage 與 score。

### 11. 關閉與背景程序

- 正常關閉 ClawDesk。
- 確認沒有殘留 app 或 sidecar 背景程序。
- 若有殘留程序，記錄程序名稱、PID 與關閉方式。

## 問題回報格式

請用以下格式回報：

```text
測試者：
機器型號：
macOS 版本：
ClawDesk 版本：
安裝方式：DMG / Applications / 直接從掛載磁碟
問題類型：啟動 / 登入 / 授權 / AI provider / MCP / 工作流 / 診斷 / UI / 其他
重現步驟：
預期結果：
實際結果：
是否可重現：
診斷包檔名：
補充說明：
```

若手動附加截圖，請先遮蔽 Email、路徑、金鑰、聊天內容、公司機密與個人資料。

## 通過標準

- App 可從 DMG 安裝並啟動。
- 初次啟動、登入、對話、Canvas、權限、專案、授權、更新、診斷、人體工學面板可完成基本操作。
- 所有 mock 商業功能都清楚標示，不誤導為 production 連線。
- 診斷包不含敏感資料。
- 關閉後沒有殘留 sidecar 程序。

## 已知限制

- 目前是 mock-candidate，不是正式商業 production build。
- 尚未完成 Apple Developer ID 簽章與 notarization。
- Lemon Squeezy、Keygen、SSO、ChatGPT Pro OAuth 與 production gateway 尚未連接真實 production credentials。
- Native WebView 內部署面板按鈕尚未做滑鼠點擊級自動化驗證。
- DMG 內包含 backend simulator resources，僅供 mock-candidate 與本機驗證使用。

## 測試後清理

- 移除 Applications 中的 `ClawDesk.app`。
- 卸載 DMG 掛載磁碟。
- 保留診斷包與問題回報，直到測試負責人確認已收件。
