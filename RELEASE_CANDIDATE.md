# ClawDesk 0.1.0 Mock Release Candidate

產出日期：2026-05-13  
狀態：`mock-candidate-ready`  
平台：macOS Apple Silicon / `aarch64-apple-darwin`  
定位：ClawDesk：OpenClaw-compatible desktop agent

## 發佈產物

| 項目 | 路徑 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| DMG | `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/ClawDesk_0.1.0_aarch64.dmg` | 2.3 MB | `acfbd5a424e1a0928c1f172dcf8ac464962fb104406dc7dcae3573d71396e16d` |
| App binary | `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/ClawDesk.app/Contents/MacOS/openclaw-desktop` | 4.9 MB | `f290fccc6ed85ba7c8f9cdff5f957e447bb1d16f52db5f888383116b6299476a` |

## 已驗證範圍

- React / TypeScript production build。
- Rust / Tauri unit tests。
- Mock Gateway health、WebSocket stream、Canvas patch、permission round trip。
- Paddle + Keygen mock 授權、machine binding、offline ticket、tamper fail-closed。
- Production backend adapter 模擬驗證，包含 Paddle webhook signature、Keygen offline license file、SSO fail-closed。
- Production Gateway simulator，不啟動 desktop mock sidecar。
- GUI smoke，包含登入、主功能面板、授權、診斷、人體工學指標。
- `.app` smoke，包含 packaged app 啟動、Gateway health、sidecar cleanup。
- `.dmg` smoke，包含掛載、`ClawDesk.app` 存在、backend simulator resources 存在、卸載。

## 最新驗證報告

| 類型 | 報告 |
| --- | --- |
| Full release DMG QA | `artifacts/qa-loop/2026-05-13T14_41_50_391Z-qa-cycle-cycles-1.json` |
| DMG smoke | `artifacts/dmg-smoke/2026-05-13T14_37_59_927Z-report.json` |
| Tauri app smoke | `artifacts/tauri-app-smoke/2026-05-13T14_36_42_139Z-report.json` |

## 內部測試安裝流程

1. 開啟 `ClawDesk_0.1.0_aarch64.dmg`。
2. 將 `ClawDesk.app` 拖到 Applications 或直接從掛載磁碟啟動。
3. 第一次啟動時完成條款同意與快速設定。
4. 使用開發者或測試帳號登入。
5. 依序檢查：
   - 關於
   - 正式檢查
   - 部署
   - 授權
   - 診斷
   - 驗證
6. 測試完成後，確認 app 關閉時沒有殘留 `openclaw-desktop` 或 `server.mjs` 背景程序。

## 回報流程

測試者遇到問題時，優先使用 app 內「診斷」面板產生故障回報。診斷包設計為不包含：

- 完整 Email。
- 完整檔案路徑。
- API key、license key、Paddle customer id。
- 聊天內容。
- 螢幕截圖。

若 app 無法啟動，請回報：

- macOS 版本。
- Apple Silicon 型號。
- 是否從 DMG、Applications 或命令列啟動。
- 錯誤畫面或系統提示文字。
- DMG SHA-256 是否等於本文件列出的值。

## 已知限制

- 目前是 mock-candidate，不是正式商業 production build。
- 尚未 Apple Developer ID 簽章與 notarization；第一次打開可能出現 macOS 安全提示。
- Paddle / Keygen / SSO 目前仍是 mock 或 production scaffold，不連接真實收款與授權後台。
- ChatGPT Pro 流程目前是安全 handoff / provider 狀態模擬，不保存密碼、不擷取 cookie。
- DMG 內包含 backend simulator resources，僅供 mock-candidate 與本機驗證使用；strict production build 不應打包模擬後端。
- Native WebView 內的部署面板按鈕尚未做滑鼠點擊級自動化，只透過 Tauri command、app smoke 與 resources 檢查間接驗證。

## 正式發佈前阻塞項

- 設定正式 `CLAWDESK_GATEWAY_BASE_URL`。
- 配置 Paddle production credentials 與 webhook secret。
- 配置 Keygen account、product、API token、signing public key。
- 配置 Apple / Google / Microsoft / Email SSO。
- 完成 Apple Developer ID 簽章。
- 完成 macOS notarization。
- 法務審核 EULA、隱私權、訂閱揭露、OpenClaw MIT notice。

## 建議小規模測試範圍

- 內部 3 至 5 台 Apple Silicon Mac。
- 只測 mock-candidate 功能，不對外收款。
- 每台機器至少測：
  - 初次啟動與快速設定。
  - 帳號登入。
  - 授權 mock 啟用與 tamper 降級。
  - 診斷包產生。
  - 部署面板狀態。
  - 關閉 app 後背景程序清理。

