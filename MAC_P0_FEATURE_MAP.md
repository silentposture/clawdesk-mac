# P0 功能映射表（Windows 專有功能在 MAC 的保留策略）

## 目標
- 僅保留對 MAC 可用且必要的功能
- Windows 專屬能力不搬移
- 所有保留項目都可被 MAC 發佈 pipeline 驗證

## 專有能力分級

### P0（先做）
- release guard / preflight
  - Windows 專有
    - `release:guard`
    - `release:guard:strict`
    - `release:guard:beta`
    - `release:configs:check`
    - `gateway:doctor`
  - MAC 對應保留
    - `release:preflight:production`
    - `release:preflight:production:strict`
    - `release:summary`
    - `release:configs:check`

- verify
  - Windows 專有
    - `verify:backend:sim`
    - `verify:backend`
    - `verify:mvp`
    - `verify:production-gateway:sim`
    - `verify:mock-stack`
  - MAC 對應保留
    - `verify:backend:sim`
    - `verify:backend:production`
    - `verify:mvp`
    - `verify:production-gateway:sim`

- QA / Smoke
  - Windows 專有
    - `qa:full:win`
    - `qa:full:win:sign`
    - `qa:beta-direct:win`
    - `qa:release:win`
    - `qa:store:win`
    - `smoke:win-app`
    - `smoke:win-installer`
    - `smoke:store-installer:win`
  - MAC 對應保留
    - `qa:full-cycle`
    - `qa:release:dmg`
    - `smoke:tauri:app`
    - `smoke:dmg`

- release pipeline（build）
  - Windows 專有
    - `tauri:build:win`
    - `tauri:build:store:win`
    - `tauri:build:prod:win`
    - `tauri:dev:win`
  - MAC 對應保留
    - `tauri:build:app`
    - `tauri:build:m4`
    - `tauri:build:prod:app`
    - `tauri:build:prod:dmg`
    - `tauri:dev:mac`

- compliance / metadata
  - Windows 專有
    - `generate-windows-release-metadata`
    - `release:metadata:win`
    - `release:metadata:win:check`
  - MAC 對應保留
    - `release:metadata:mac`
    - `release:metadata:mac:check`
    - `release:summary`
    - `generate-legal-consent`（共用）

- SBOM / 可審計
  - Windows 專有
    - `sbom`
    - `sbom:check`
  - MAC 對應
    - `sbom`
    - `sbom:check`

- 簽章
  - Windows 專有
    - `sign:win-installer`
    - `sign:win:doctor`
    - `verify:windows-signing`
    - `windows-signing-doctor`
  - MAC 對應（保留）
    - `sign:mac:doctor`
    - `sign:mac:notarize`

### P1（可視節奏）
- `verify:production-gateway:compose`（Windows 特定 compose 流程）
- `verify:lemon:production`（Windows 商務化支付節點）
- `cert:windows:check`（Windows 只）

### P2（不建議移入）
- `beta:*`（beta 直達與 release beta 手工流程）
- `prepare-beta-handoff`
- `qa:release:mac`（已過時）
- `qa:store:win` / `smoke:store-installer:win`
- 所有 `prepare-*-website`、`prepare-gateway-deploy-package` 的 Windows 專用商務發佈流

## 決策原則（MAC）
1. Windows 平台特徵（nsis、windows signing、Win32 API）不搬移
2. 只要在 MAC 發佈前可驗證「可用、可測、可追溯」者就保留
3. 檢查項目必須可在 `release:preflight:production` 套件化

## 建議 MAC release 最小腳本（P0）
- `release:preflight:production`
- `verify:backend:production`
- `verify:backend:sim`
- `verify:mvp`
- `verify:production-gateway:sim`
- `qa:full-cycle`
- `qa:release:dmg`
- `smoke:tauri:app`
- `smoke:dmg`
- `tauri:build:prod:app` 或 `tauri:build:prod:dmg`
- `release:mac:build-and-notarize`

## 需要補齊（P0 後續）
- `release:summary` 需補齊欄位與 Windows `release-guard` 輸出對齊（metadata 欄位稽核）
- `sbom` 需要明確標註 macOS artifact 類型與輸出欄位
- 已完成簽章診斷入口：`sign:mac:doctor`
- 已完成簽章與公證：`sign:mac:notarize`

## Windows 功能自動判定（可加到 MAC）

### 已完成導入（已在 MAC 套件）
- `qa:release:mac`
- `release:guard:beta`
- `gateway:deploy:prepare`
- `gateway:doctor`
- `gateway:public:doctor`
- `i18n:audit`
- `i18n:audit:strict`
- `legal:notices`
- `legal:notices:check`
- `lemon:onboarding:prepare`
- `release:configs:check`
- `sbom`
- `sbom:check`
- `smoke:mac-dmg`
- `verify:lemon:production`
- `verify:production-gateway:compose`
- `verify:ui:visual`
- `website:prepare`
- `release:metadata:mac`
- `release:metadata:mac:check`
- `sign:mac:doctor`
- `sign:mac:notarize`

### 目前不建議加入（Windows 專有）
- `beta:env:doctor`
- `beta:readiness`
- `beta:readiness:check`
- `beta:handoff:prepare`
- `cert:windows:check`
- `qa:beta-direct:win`
- `qa:full:win`
- `qa:full:win:sign`
- `qa:release:win`
- `qa:store:win`
- `release:auto:beta:win`
- `sign:win-installer`
- `sign:win:doctor`
- `smoke:win-app`
- `smoke:win-installer`
- `smoke:store-installer:win`
- `tauri:build:win`
- `tauri:build:store:win`
- `tauri:build:prod:win`
- `tauri:dev:win`
- `release:metadata:win`
- `release:metadata:win:check`
