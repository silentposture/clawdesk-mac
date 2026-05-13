# Changelog

本文件記錄 ClawDesk 的可交付版本變更。ClawDesk 定位為 OpenClaw-compatible、local-first desktop agent。

## [0.1.0] - 2026-05-13

狀態：`mock-candidate-ready`  
平台：macOS Apple Silicon / `aarch64-apple-darwin`

### Added

- 建立 ClawDesk 桌面 MVP：Tauri v2、Rust、React、TypeScript、Vite。
- 新增 restrained desktop-agent UI：左側對話、右側 Live Canvas、狀態列、模型與來源指示、權限對話框。
- 新增 mock Gateway sidecar，支援 health、chat、WebSocket streaming、Canvas declarative events 與 permission round trip。
- 新增穩定前端事件契約：`agent.message.delta`、`agent.message.done`、`canvas.begin`、`canvas.patch`、`canvas.data`、`permission.request`、`permission.result`、`gateway.status`。
- 新增 A2UI-inspired trusted renderer catalog：`Text`、`Button`、`Table`、`Metric`、`List`、`Progress`、`Panel`。
- 新增專案分類、釘選、專案資料夾選擇與沙盒權限模型。
- 新增 ChatGPT Pro safe handoff、API provider、Gemini、Ollama/local model 設定面板；登入與 API key 路徑分離。
- 新增 Microsoft、Google、瀏覽器、開發工具、工程軟體、雲端服務、通訊軟體等 MCP / connector catalog mock。
- 新增帳號與 SSO mock：Email、Apple、Google、Microsoft、企業 SSO、Email verification、開發者模式身份摘要。
- 新增多 Agent catalog、隔離知識庫、共享知識設定、長期記憶與 Context 壓縮面板。
- 新增工作流、自動化排程、通訊頻道、媒體、學習模式與模仿型預演流程。
- 新增 Paddle + Keygen mock 授權、machine binding、offline ticket、tamper fail-closed、支援更新到期日與更新資格檢查。
- 新增 Keygen production readonly validation scaffold；保留 mock path，不執行 revoke、suspend、delete、machine create 等破壞性操作。
- 新增版權與授權中心、OpenClaw MIT notice、安裝條款與隱私/使用者內容權利說明。
- 新增非個資故障診斷、故障碼、診斷包預覽、手動送出與匯出流程。
- 新增 GUI 人體工學驗證儀表，檢查主要任務路徑、tooltip coverage、文字溢出、鍵盤可達與風險提示。
- 新增 production backend simulation、deployment readiness panel、release guard、DMG smoke、Tauri app smoke 與 QA cycle scripts。

### Changed

- 品牌顯示改為 `ClawDesk`；保留既有 package、crate、bundle identifier，降低 build path 風險。
- macOS-first 交付目標改為 Apple Silicon release bundle 與 DMG mock-candidate。
- 將正式後台依賴清楚分層：桌面端不保存 production backend token，Paddle / Keygen / SSO production credentials 僅屬 server-side。

### Fixed

- 修正 GUI smoke 中登入預設值與 locator 模糊造成的自動化驗證不穩定。
- 修正長迴圈 QA 中 port cleanup 與 app 啟停 timing 的穩定性。
- 修正 TypeScript 測試與 build 中既有 UI 文字引用問題。
- 修正 packaged app smoke 與 DMG smoke 對 sidecar / backend simulator resources 的檢查。

### Security

- 專案外檔案改動需人工授權；專案內改動採先備份原則。
- 診斷資料不收集完整 Email、完整路徑、API key、license key、Paddle customer id、聊天內容或螢幕截圖。
- ChatGPT Pro 流程不保存密碼、不擷取 cookie，採安全 provider handoff / 狀態模擬。
- License tamper 進入 safe mode，清除離線票券並要求重新線上驗證。

### Validation

- 最新 release DMG QA：`artifacts/qa-loop/2026-05-13T14_41_50_391Z-qa-cycle-cycles-1.json`
- 最新 DMG smoke：`artifacts/dmg-smoke/2026-05-13T14_37_59_927Z-report.json`
- 最新 Tauri app smoke：`artifacts/tauri-app-smoke/2026-05-13T14_36_42_139Z-report.json`
- DMG SHA-256：`acfbd5a424e1a0928c1f172dcf8ac464962fb104406dc7dcae3573d71396e16d`
- App binary SHA-256：`f290fccc6ed85ba7c8f9cdff5f957e447bb1d16f52db5f888383116b6299476a`

### Known Limitations

- 此版本是 mock-candidate，不是正式商業 production build。
- 尚未完成 Apple Developer ID 簽章與 notarization。
- Paddle、Keygen、SSO、ChatGPT Pro OAuth 與 production gateway 尚未接真實 production credentials。
- Native WebView 內部署面板按鈕尚未做滑鼠點擊級自動化驗證。
- DMG 內含 backend simulator resources，僅供 mock-candidate 與本機驗證使用。
