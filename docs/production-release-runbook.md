# ClawDesk Production Release Runbook

本文件定義 ClawDesk 從 mock release candidate 進入 production build 的最小安全流程。重點是先建立可重複檢查的 release gate，再接入正式 Paddle、Keygen、SSO、Apple signing 與 notarization。

CI workflow 參考：

- [release-macos workflow](/Users/huangkuoling/Documents/New%20project/.github/workflows/release-macos.yml)
- [CI secrets reference](/Users/huangkuoling/Documents/New%20project/docs/ci-secrets-reference.md)

## 原則

- production credential 只存在於 CI secret store 或本機 shell session，不寫入 repo。
- 桌面端不保存 Paddle API key、Keygen API token、SSO client secret 或 Apple notarization 密碼。
- production Tauri config 不打包 mock Gateway、backend simulator 或 mock credential flow。
- 所有正式 build 必須先通過 `release:guard:strict`。
- Apple signing / notarization 失敗時不允許產出 production release。

## 環境變數

以 [.env.production.example](/Users/huangkuoling/Documents/New%20project/.env.production.example) 為準。正式 build 前至少需要：

```text
CLAWDESK_RELEASE_CHANNEL=production
CLAWDESK_GATEWAY_BASE_URL
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
KEYGEN_ACCOUNT_ID
KEYGEN_PRODUCT_ID
KEYGEN_API_TOKEN
KEYGEN_SIGNING_PUBLIC_KEY
CLAWDESK_SSO_ISSUER_URL
CLAWDESK_SSO_CLIENT_ID
APPLE_TEAM_ID
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD 或 APPLE_KEYCHAIN_PROFILE
```

## 本機 production preflight

先跑 report-only，確認缺口但不中止：

```bash
npm run release:preflight:production
```

正式 build 前跑 strict：

```bash
npm run release:preflight:production:strict
```

preflight report 會寫入 `artifacts/production-release-preflight/`。報告只記錄環境變數是否存在與 hash，不記錄明文值。

## Strict release guard

```bash
npm run release:guard:strict
```

此步會硬擋：

- 缺少 production Gateway、Paddle、Keygen、SSO env。
- 缺少 Apple signing / notarization env。
- 找不到 Developer ID Application certificate。
- production Tauri config 包含 mock resource。
- production build script 未受 strict guard 保護。

## Production app / DMG build

通過 preflight 與 strict guard 後：

```bash
npm run tauri:build:prod:app
npm run tauri:build:prod:dmg
```

目前 production build script 仍依賴 Tauri 內建 macOS signing 設定與本機 keychain。若要導入 CI，建議先建立暫時 keychain，匯入 Developer ID certificate，再執行同一組 npm scripts。

## Notarization 建議流程

第一版建議使用 Apple keychain profile：

```bash
xcrun notarytool store-credentials CLAWDESK_NOTARY_PROFILE \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"

export APPLE_KEYCHAIN_PROFILE=CLAWDESK_NOTARY_PROFILE
```

DMG 產生後：

```bash
xcrun notarytool submit path/to/ClawDesk_0.1.0_aarch64.dmg \
  --keychain-profile "$APPLE_KEYCHAIN_PROFILE" \
  --wait

xcrun stapler staple path/to/ClawDesk_0.1.0_aarch64.dmg
spctl --assess --type open --context context:primary-signature -v path/to/ClawDesk_0.1.0_aarch64.dmg
```

不要把 app-specific password、keychain profile 密碼或 certificate 私鑰提交到 repo。

## 發佈前驗證鏈

production release candidate 至少跑：

```bash
npm test
npm run build
npm run verify:mvp
npm run verify:backend
npm run verify:backend:sim
npm run verify:backend:production
npm run verify:production-gateway:sim
npm run smoke:gui:prod
cargo test --manifest-path src-tauri/Cargo.toml
npm run release:preflight:production:strict
npm run release:guard:strict
```

簽章與公證後再跑：

```bash
npm run smoke:tauri:app
npm run smoke:dmg
npm run release:summary
```

完成後可優先查看 `artifacts/release-summary/latest-release-summary.md` 作為單一總覽。

## 目前 production 阻塞項

- 尚未設定 production Gateway。
- 尚未設定 Paddle production credentials。
- 尚未設定 Keygen production credentials。
- 尚未設定 Apple / Google / Microsoft / Email SSO issuer。
- 尚未匯入 Developer ID Application certificate。
- 尚未完成 notarization credential。
- 尚未建立 CI secret store 與 macOS runner。
