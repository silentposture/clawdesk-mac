# ClawDesk CI Secrets Reference

此文件列出 `release-macos` workflow 所需的 GitHub Actions secrets。只記錄鍵名與用途，不記錄任何值。

## 必要 secrets

- `CLAWDESK_GATEWAY_BASE_URL`: production Gateway base URL。
- `PADDLE_API_KEY`: Paddle server-side API key。
- `PADDLE_WEBHOOK_SECRET`: Paddle webhook signature secret。
- `KEYGEN_ACCOUNT_ID`: Keygen account id。
- `KEYGEN_PRODUCT_ID`: Keygen product id。
- `KEYGEN_API_TOKEN`: Keygen API token。
- `KEYGEN_SIGNING_PUBLIC_KEY`: Keygen signing public key。
- `CLAWDESK_SSO_ISSUER_URL`: SSO issuer URL。
- `CLAWDESK_SSO_CLIENT_ID`: SSO client id。
- `APPLE_TEAM_ID`: Apple Developer Team ID。
- `APPLE_ID`: Apple ID email for notarization。
- `APPLE_APP_SPECIFIC_PASSWORD`: Apple app-specific password。

## 可選 secrets

- `APPLE_KEYCHAIN_PROFILE`: 已存在於 runner 的 notarytool keychain profile 名稱。
- `APPLE_CERT_BASE64`: Developer ID Application `.p12` 的 base64 字串。
- `APPLE_CERT_PASSWORD`: `.p12` 匯入密碼。

## 安全要求

- secrets 只能設定在 GitHub repository secrets 或 organization secrets。
- 不要把 secrets 放在 `.env.*`、shell script、workflow log 或 commit message。
- 若 key 可能外洩：先撤銷原 key，再更新 secrets，最後重跑 release workflow。

## 驗證方式

設定完成後，手動觸發 `release-macos` workflow。`verify` job 應先通過：

1. `npm run release:preflight:production:strict`
2. `npm run release:guard:strict`

若任一步驟失敗，先修正 secrets 或憑證，再重新觸發 workflow。
