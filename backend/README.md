# ClawDesk 後端授權模擬服務

這份模擬後端是「未來實際 Lemon Squeezy + Keygen 架構」的本地替代，目的是讓桌面端整套授權、帳號、webhook 與診斷流程先行自動化驗證。

## 啟動方式

```sh
node backend/server.mjs
```

或使用 npm：

```sh
npm run deploy:backend-sim
```

可直接呼叫 `http://127.0.0.1:19090`。

## 重要介面（canonical）

- `POST /api/auth/register`
- `GET /api/auth/verify-email`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/account/entitlements`
- `GET /api/license/public-keys`
- `POST /api/license/activate`
- `POST /api/license/validate`
- `POST /api/license/deactivate`
- `POST /api/license/refresh-certificate`
- `GET /api/license/me`
- `POST /api/webhooks/lemonsqueezy`
- `POST /api/payment/newebpay/notify`

## 相容介面（legacy shim）

- `GET /health`
- `GET /contract`
- `GET /machine/fingerprint`
- `POST /auth/register`
- `POST /auth/confirm`
- `POST /auth/login`
- `POST /auth/sso/start`
- `POST /auth/sso/finish`
- `GET /auth/sso/providers`
- `GET /auth/session`
- `POST /licenses/activate-key`
- `POST /licenses/validate`
- `POST /licenses/refresh-offline-ticket`
- `POST /licenses/report-tamper`
- `GET /license/status`
- `POST /webhooks/lemon-squeezy`
- `POST /webhooks/keygen`
- `GET /updates/check`

`/licenses/activate-key` 對應 Lemon Squeezy License API 的 activate flow：輸入 `licenseKey + machineFingerprintHash`，後端建立 Lemon Squeezy instance，回傳 `instance.id`、授權摘要與本機相容 offline ticket。`/licenses/validate` 可用 `licenseKey + instanceId` 執行 Lemon Squeezy validate；舊 offline ticket 驗證仍保留作為本機離線相容路徑。
- `GET /updates/manifest`
- `GET /updates/history`
- `GET /mcp/connectors`
- `POST /mcp/connect`
- `POST /mcp/revoke`
- `GET /mcp/audit`
- `GET /mcp/microsoft/oauth/start`
- `POST /mcp/microsoft/oauth/callback`
- `POST /mcp/microsoft/oauth/revoke`
- `POST /diagnostics/create-report`
- `GET /legal/documents`
- `GET /legal/notices`

`/api/license/activate` 會簽發 UniversalServer 風格的 signed certificate JSON；桌面端透過 `/api/license/public-keys` 取得 key ring，再做本機驗簽與定期遠端 validate。舊 `/licenses/activate-key` / `/licenses/validate` 仍保留作相容層。

## 簽章與防篡改

- 授權內容以 `key`, `issuedAt` 等欄位組合後做 HMAC-SHA256 簽章。
- `offlineTicket` 封裝成 `keyId.base64payload.signature`。
- `/licenses/validate` 可驗證簽章與機器雜湊，不符會回傳失敗。
- `/api/license/*` 則使用 ECDSA P-256 key ring + signed certificate payload，欄位包含 `productKey`、`planKey`、`licenseType`、`updatesUntilUtc`、`machineBindingHash`。

## Production adapter contract

- 共用合約定義在 `backend/contracts.mjs`。
- Adapter registry 定義在 `backend/adapters/`，目前有 `mock` 與 `production` 兩種模式。
- `CLAWDESK_BACKEND_ADAPTER_MODE=production` 會啟用 production adapter scaffold；在正式 Lemon Squeezy/Keygen/OIDC 串接完成前，live API 呼叫會回傳明確 `501/503`，避免誤以為已上線。
- `/health` 會回傳 `contractVersion`、`paymentProvider=lemon-squeezy`、`licenseProvider=keygen`，以及 production 必要環境變數是否存在；不回傳 secret 值。
- `/contract` 會回傳正式 Gateway、Lemon Squeezy、Keygen、Identity、Updates、Diagnostics、Legal 需要支援的 endpoint manifest。
- mock backend 與未來 production backend 必須共用同一份 Lemon Squeezy、Keygen webhook event mapping，避免桌面端與後端部署分裂。
- `npm run verify:backend:production` 會用測試 env 啟動 production adapter，驗證 Lemon Squeezy `X-Signature` HMAC、Keygen Ed25519 offline license、machine mismatch fail-closed、SSO/OIDC callback scaffold fail-closed，以及 smoke report 不含 secret。此驗證不呼叫真實 Lemon Squeezy/Keygen 服務。

## 開發注意

- 這是模擬環境，**所有機器資訊與信箱僅保留匿名化雜湊**。
- `CLAWDESK_BACKEND_STATE_FILE` 可指定持久化路徑，預設在 `.clawdesk-backend/state.json`。
