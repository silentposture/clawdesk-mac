use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use rfd::FileDialog;
use tauri::Manager;

const MOCK_PORT: u16 = 18890;
const LOCAL_STACK_BACKEND_PORT: u16 = 19120;
const LOCAL_STACK_GATEWAY_PORT: u16 = 19130;
const BUILD_PROFILE: Option<&str> = option_env!("CLAWDESK_BUILD_PROFILE");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayInfo {
    base_url: String,
    ws_url: String,
    mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccessibilityStatus {
    platform: String,
    trusted: String,
    can_read_active_window: bool,
    setup_hint: String,
    settings_url: String,
    checked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopElementSnapshot {
    id: String,
    role: String,
    label: String,
    bounds: DesktopBounds,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopWindowSnapshot {
    app_name: String,
    window_title: String,
    process_id: Option<u32>,
    captured_at: String,
    fallback: String,
    elements: Vec<DesktopElementSnapshot>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopActionRequest {
    action: String,
    target_label: String,
    risk: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopActionRehearsal {
    action_id: String,
    stage: String,
    risk: String,
    executable: bool,
    requires_human_approval: bool,
    summary: String,
    blocked_reason: Option<String>,
    observed_element: Option<DesktopElementSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionResult {
    request_id: String,
    allowed: bool,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegalConsentRecord {
    version: String,
    accepted_at: String,
    document_hash: String,
    documents: Vec<String>,
}

#[derive(Default)]
struct GatewayState {
    child: Option<Child>,
    info: Option<GatewayInfo>,
}

impl Drop for GatewayState {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

type SharedGatewayState = Mutex<GatewayState>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStackStatus {
    available: bool,
    running: bool,
    backend_pid: Option<u32>,
    gateway_pid: Option<u32>,
    backend_url: String,
    gateway_url: String,
    gateway_ws_url: String,
    backend_healthy: bool,
    gateway_healthy: bool,
    logs: Vec<String>,
}

#[derive(Default)]
struct LocalStackState {
    backend: Option<Child>,
    gateway: Option<Child>,
    logs: Vec<String>,
}

impl Drop for LocalStackState {
    fn drop(&mut self) {
        stop_local_stack_children(self);
    }
}

type SharedLocalStackState = Mutex<LocalStackState>;

fn default_gateway_info(mode: &str) -> GatewayInfo {
    GatewayInfo {
        base_url: format!("http://127.0.0.1:{MOCK_PORT}"),
        ws_url: format!("ws://127.0.0.1:{MOCK_PORT}/events"),
        mode: mode.to_string(),
    }
}

fn gateway_info_from_base_url(
    base_url: &str,
    ws_url_override: Option<&str>,
    mode: &str,
) -> Result<GatewayInfo, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Gateway base URL cannot be empty".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Gateway base URL must start with http:// or https://".to_string());
    }

    let ws_url = match ws_url_override.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => value.trim_end_matches('/').to_string(),
        None if trimmed.starts_with("https://") => {
            format!("wss://{}/events", trimmed.trim_start_matches("https://"))
        }
        None => format!("ws://{}/events", trimmed.trim_start_matches("http://")),
    };

    Ok(GatewayInfo {
        base_url: trimmed.to_string(),
        ws_url,
        mode: mode.to_string(),
    })
}

fn configured_gateway_info_from_env() -> Result<Option<GatewayInfo>, String> {
    match std::env::var("CLAWDESK_GATEWAY_BASE_URL") {
        Ok(base_url) => gateway_info_from_base_url(
            &base_url,
            std::env::var("CLAWDESK_GATEWAY_WS_URL").ok().as_deref(),
            "external",
        )
        .map(Some),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(format!("Failed to read CLAWDESK_GATEWAY_BASE_URL: {error}")),
    }
}

fn mock_gateway_allowed() -> bool {
    let runtime_disabled = std::env::var("CLAWDESK_DISABLE_MOCK_GATEWAY")
        .map(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    mock_gateway_allowed_for(BUILD_PROFILE, runtime_disabled)
}

fn mock_gateway_allowed_for(build_profile: Option<&str>, runtime_disabled: bool) -> bool {
    let build_profile_is_production = build_profile == Some("production");
    !build_profile_is_production && !runtime_disabled
}

fn gateway_health_url(base_url: &str) -> String {
    format!("{}/health", base_url.trim_end_matches('/'))
}

fn gateway_health_ok_for(base_url: &str) -> bool {
    let url = gateway_health_url(base_url);
    ureq::get(&url)
        .timeout(Duration::from_millis(450))
        .call()
        .map(|response| response.status() == 200)
        .unwrap_or(false)
}

fn gateway_health_ok() -> bool {
    gateway_health_ok_for(&default_gateway_info("external").base_url)
}

fn now_rfc3339_fallback() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("{}Z", duration.as_secs()))
        .unwrap_or_else(|_| "0Z".to_string())
}

fn accessibility_status_for_platform() -> AccessibilityStatus {
    AccessibilityStatus {
        platform: if cfg!(target_os = "macos") {
            "macOS".to_string()
        } else if cfg!(target_os = "windows") {
            "Windows".to_string()
        } else if cfg!(target_os = "linux") {
            "Linux".to_string()
        } else {
            "unknown".to_string()
        },
        trusted: "unknown".to_string(),
        can_read_active_window: false,
        setup_hint: "系統設定 > 隱私權與安全性 > 輔助使用，允許 ClawDesk 讀取桌面元素。".to_string(),
        settings_url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility".to_string(),
        checked_at: now_rfc3339_fallback(),
    }
}

fn mock_active_window_snapshot() -> DesktopWindowSnapshot {
    DesktopWindowSnapshot {
        app_name: "ClawDesk Preview".to_string(),
        window_title: "桌面操作預演".to_string(),
        process_id: Some(0),
        captured_at: now_rfc3339_fallback(),
        fallback: "ax-tree".to_string(),
        elements: vec![
            DesktopElementSnapshot {
                id: "ax-submit".to_string(),
                role: "AXButton".to_string(),
                label: "預覽動作".to_string(),
                bounds: DesktopBounds {
                    x: 420,
                    y: 560,
                    width: 112,
                    height: 32,
                },
                enabled: true,
            },
            DesktopElementSnapshot {
                id: "ax-target".to_string(),
                role: "AXTextField".to_string(),
                label: "目標路徑 / 資源".to_string(),
                bounds: DesktopBounds {
                    x: 180,
                    y: 498,
                    width: 360,
                    height: 34,
                },
                enabled: true,
            },
        ],
    }
}

fn rehearse_desktop_action_for(request: DesktopActionRequest) -> DesktopActionRehearsal {
    let snapshot = mock_active_window_snapshot();
    let risk = request.risk.unwrap_or_else(|| {
        if request.action == "read" {
            "low".to_string()
        } else {
            "medium".to_string()
        }
    });
    let high_risk = risk == "high";
    let observed_element = snapshot
        .elements
        .into_iter()
        .find(|element| element.label == request.target_label);

    DesktopActionRehearsal {
        action_id: format!(
            "desktop-{}-{}",
            request.action,
            request
                .target_label
                .chars()
                .map(|value| if value.is_ascii_alphanumeric() { value } else { '-' })
                .collect::<String>()
        ),
        stage: if high_risk { "authorize" } else { "rehearse" }.to_string(),
        risk: risk.clone(),
        executable: !high_risk,
        requires_human_approval: request.action != "read" || risk != "low",
        summary: format!("觀察 active window 後，預演 {} 於「{}」。", request.action, request.target_label),
        blocked_reason: if high_risk {
            Some("v0.2 不自動執行高風險桌面操作，只能產生預演與授權提示。".to_string())
        } else {
            None
        },
        observed_element,
    }
}

fn local_stack_backend_url() -> String {
    format!("http://127.0.0.1:{LOCAL_STACK_BACKEND_PORT}")
}

fn local_stack_gateway_url() -> String {
    format!("http://127.0.0.1:{LOCAL_STACK_GATEWAY_PORT}")
}

fn local_stack_gateway_ws_url() -> String {
    format!("ws://127.0.0.1:{LOCAL_STACK_GATEWAY_PORT}/events")
}

fn bounded_log(logs: &mut Vec<String>, line: impl Into<String>) {
    logs.push(line.into());
    if logs.len() > 40 {
        let drain_count = logs.len() - 40;
        logs.drain(0..drain_count);
    }
}

fn health_ok(base_url: &str) -> bool {
    ureq::get(&gateway_health_url(base_url))
        .timeout(Duration::from_millis(550))
        .call()
        .map(|response| response.status() == 200)
        .unwrap_or(false)
}

fn local_stack_script_path(app: &tauri::AppHandle, relative_parts: &[&str]) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let mut packaged = resource_dir;
        for part in relative_parts {
            packaged = packaged.join(part);
        }
        if packaged.exists() {
            return Ok(packaged);
        }
    }

    let mut path = std::env::current_dir()
        .map_err(|error| format!("Failed to resolve cwd: {error}"))?;
    for part in relative_parts {
        path = path.join(part);
    }
    if !path.exists() {
        return Err(format!("Local stack script not found at {}", path.display()));
    }
    Ok(path)
}

fn local_stack_status_from(state: &mut LocalStackState) -> LocalStackStatus {
    if let Some(child) = state.backend.as_mut() {
        if let Ok(Some(status)) = child.try_wait() {
            bounded_log(&mut state.logs, format!("backend exited: {status}"));
            state.backend = None;
        }
    }
    if let Some(child) = state.gateway.as_mut() {
        if let Ok(Some(status)) = child.try_wait() {
            bounded_log(&mut state.logs, format!("production gateway exited: {status}"));
            state.gateway = None;
        }
    }

    let backend_url = local_stack_backend_url();
    let gateway_url = local_stack_gateway_url();
    let backend_healthy = health_ok(&backend_url);
    let gateway_healthy = health_ok(&gateway_url);

    LocalStackStatus {
        available: true,
        running: state.backend.is_some() && state.gateway.is_some(),
        backend_pid: state.backend.as_ref().map(Child::id),
        gateway_pid: state.gateway.as_ref().map(Child::id),
        backend_url,
        gateway_url,
        gateway_ws_url: local_stack_gateway_ws_url(),
        backend_healthy,
        gateway_healthy,
        logs: state.logs.clone(),
    }
}

fn spawn_local_stack_child(script: PathBuf, envs: &[(&str, String)]) -> Result<Child, String> {
    let mut command = Command::new("node");
    command
        .arg(script)
        .env("NODE_ENV", "production")
        .env("NODE_OPTIONS", "--max-old-space-size=128")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for (key, value) in envs {
        command.env(key, value);
    }
    command
        .spawn()
        .map_err(|error| format!("Failed to spawn local stack process: {error}"))
}

fn stop_local_stack_children(state: &mut LocalStackState) {
    if let Some(mut child) = state.gateway.take() {
        let _ = child.kill();
        let _ = child.wait();
        bounded_log(&mut state.logs, "production gateway stopped");
    }
    if let Some(mut child) = state.backend.take() {
        let _ = child.kill();
        let _ = child.wait();
        bounded_log(&mut state.logs, "backend stopped");
    }
}

fn permission_result_payload(result: &PermissionResult) -> serde_json::Value {
    serde_json::json!({
        "type": "permission.result",
        "requestId": result.request_id,
        "allowed": result.allowed,
        "reason": result.reason,
    })
}

fn initial_project_directory(initial_path: Option<String>) -> Option<PathBuf> {
    let path = initial_path?.trim().to_string();
    if path.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(path);
    candidate.exists().then_some(candidate)
}

fn legal_consent_path_from_config_dir(config_dir: PathBuf) -> PathBuf {
    config_dir.join("legal-consent.json")
}

fn legal_consent_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve app config dir: {error}"))?;
    Ok(legal_consent_path_from_config_dir(config_dir))
}

fn read_legal_consent_from_path(path: PathBuf) -> Result<Option<LegalConsentRecord>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read legal consent record: {error}"))?;
    serde_json::from_str::<LegalConsentRecord>(&raw)
        .map(Some)
        .map_err(|error| format!("Failed to parse legal consent record: {error}"))
}

fn write_legal_consent_to_path(path: PathBuf, record: &LegalConsentRecord) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create app config dir: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(record)
        .map_err(|error| format!("Failed to serialize legal consent record: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to write legal consent record: {error}"))
}

fn write_legal_export_to_path(path: PathBuf, contents: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|error| format!("Legal export must be valid JSON: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create export directory: {error}"))?;
    }
    fs::write(path, contents).map_err(|error| format!("Failed to write legal export: {error}"))
}

fn sidecar_script_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to resolve resource dir: {error}"))?;
    let packaged = resource_dir.join("sidecars").join("mock-gateway").join("server.mjs");
    if packaged.exists() {
        return Ok(packaged);
    }

    let dev_path = std::env::current_dir()
        .map_err(|error| format!("Failed to resolve cwd: {error}"))?
        .join("sidecars")
        .join("mock-gateway")
        .join("server.mjs");

    Ok(dev_path)
}

fn spawn_mock_gateway(app: &tauri::AppHandle) -> Result<Child, String> {
    let script = sidecar_script_path(app)?;
    if !script.exists() {
        return Err(format!("Mock gateway script not found at {}", script.display()));
    }

    Command::new("node")
        .arg(script)
        .env("OPENCLAW_MOCK_PORT", MOCK_PORT.to_string())
        .env("NODE_ENV", "production")
        .env("NODE_OPTIONS", "--max-old-space-size=128")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to spawn mock gateway: {error}"))
}

fn cleanup_gateway(app: &tauri::AppHandle) {
    let state = app.state::<SharedGatewayState>();
    if let Ok(mut guard) = state.lock() {
        if let Some(mut child) = guard.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        guard.info = None;
    };
}

#[tauri::command]
fn get_gateway_info(state: tauri::State<'_, SharedGatewayState>) -> Result<GatewayInfo, String> {
    let guard = state.lock().map_err(|_| "Gateway state is poisoned".to_string())?;
    Ok(guard
        .info
        .clone()
        .unwrap_or_else(|| default_gateway_info("external")))
}

#[tauri::command]
fn ensure_gateway(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedGatewayState>,
) -> Result<GatewayInfo, String> {
    if let Some(info) = configured_gateway_info_from_env()? {
        if gateway_health_ok_for(&info.base_url) {
            let mut guard = state.lock().map_err(|_| "Gateway state is poisoned".to_string())?;
            guard.info = Some(info.clone());
            return Ok(info);
        }

        return Err(format!(
            "Configured production gateway is not healthy: {}",
            gateway_health_url(&info.base_url)
        ));
    }

    if !mock_gateway_allowed() {
        return Err(
            "Production Gateway is required. Set CLAWDESK_GATEWAY_BASE_URL; mock Gateway fallback is disabled."
                .to_string(),
        );
    }

    if gateway_health_ok() {
        let info = default_gateway_info("external");
        let mut guard = state.lock().map_err(|_| "Gateway state is poisoned".to_string())?;
        guard.info = Some(info.clone());
        return Ok(info);
    }

    {
        let guard = state.lock().map_err(|_| "Gateway state is poisoned".to_string())?;
        if guard.child.is_some() {
            return Ok(guard
                .info
                .clone()
                .unwrap_or_else(|| default_gateway_info("sidecar")));
        }
    }

    let child = spawn_mock_gateway(&app)?;
    for _ in 0..20 {
        std::thread::sleep(Duration::from_millis(100));
        if gateway_health_ok() {
            let info = default_gateway_info("sidecar");
            let mut guard = state.lock().map_err(|_| "Gateway state is poisoned".to_string())?;
            guard.child = Some(child);
            guard.info = Some(info.clone());
            return Ok(info);
        }
    }

    Err("Mock gateway did not become healthy in time".to_string())
}

#[tauri::command]
fn resolve_permission(
    result: PermissionResult,
    state: tauri::State<'_, SharedGatewayState>,
) -> Result<(), String> {
    let base_url = state
        .lock()
        .map_err(|_| "Gateway state is poisoned".to_string())?
        .info
        .as_ref()
        .map(|info| info.base_url.clone())
        .unwrap_or_else(|| default_gateway_info("external").base_url);
    let url = format!("{}/permission-result", base_url.trim_end_matches('/'));
    let body = permission_result_payload(&result);

    ureq::post(&url)
        .timeout(Duration::from_secs(2))
        .send_json(body)
        .map(|_| ())
        .map_err(|error| format!("Failed to send permission result: {error}"))
}

#[tauri::command]
fn pick_project_folder(initial_path: Option<String>) -> Result<String, String> {
    let mut dialog = FileDialog::new().set_title("選擇專案資料夾");
    if let Some(fallback) = initial_project_directory(initial_path) {
        dialog = dialog.set_directory(&fallback);
    }

    match dialog.pick_folder() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("未選取資料夾".to_string()),
    }
}

#[tauri::command]
fn read_legal_consent(app: tauri::AppHandle) -> Result<Option<LegalConsentRecord>, String> {
    read_legal_consent_from_path(legal_consent_path(&app)?)
}

#[tauri::command]
fn write_legal_consent(
    app: tauri::AppHandle,
    record: LegalConsentRecord,
) -> Result<LegalConsentRecord, String> {
    write_legal_consent_to_path(legal_consent_path(&app)?, &record)?;
    Ok(record)
}

#[tauri::command]
fn save_legal_export(default_file_name: String, contents: String) -> Result<Option<String>, String> {
    let file_name = if default_file_name.trim().is_empty() {
        "clawdesk-legal-summary.json".to_string()
    } else {
        default_file_name
    };
    let selected = FileDialog::new()
        .set_title("匯出 ClawDesk 法務摘要")
        .set_file_name(&file_name)
        .add_filter("JSON", &["json"])
        .save_file();

    match selected {
        Some(path) => {
            write_legal_export_to_path(path.clone(), &contents)?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn local_stack_status(
    state: tauri::State<'_, SharedLocalStackState>,
) -> Result<LocalStackStatus, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Local stack state is poisoned".to_string())?;
    Ok(local_stack_status_from(&mut guard))
}

#[tauri::command]
fn start_local_stack(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLocalStackState>,
) -> Result<LocalStackStatus, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Local stack state is poisoned".to_string())?;
    let current = local_stack_status_from(&mut guard);
    if current.running {
        bounded_log(&mut guard.logs, "local stack already running");
        return Ok(local_stack_status_from(&mut guard));
    }

    stop_local_stack_children(&mut guard);

    let backend_script = local_stack_script_path(&app, &["backend", "server.mjs"])?;
    let gateway_script = local_stack_script_path(&app, &["backend", "production-gateway-sim.mjs"])?;
    let state_dir = std::env::current_dir()
        .map_err(|error| format!("Failed to resolve cwd: {error}"))?
        .join(".clawdesk-local-stack");
    fs::create_dir_all(&state_dir)
        .map_err(|error| format!("Failed to create local stack state dir: {error}"))?;
    let backend_state_file = state_dir.join("tauri-backend-state.json");

    let backend = spawn_local_stack_child(
        backend_script,
        &[
            ("CLAWDESK_BACKEND_PORT", LOCAL_STACK_BACKEND_PORT.to_string()),
            (
                "CLAWDESK_BACKEND_STATE_FILE",
                backend_state_file.to_string_lossy().to_string(),
            ),
            (
                "CLAWDESK_LICENSE_HMAC_KEY",
                "tauri-local-stack-hmac".to_string(),
            ),
        ],
    )?;
    bounded_log(&mut guard.logs, format!("backend started pid={}", backend.id()));
    guard.backend = Some(backend);

    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(100));
        if health_ok(&local_stack_backend_url()) {
            break;
        }
    }

    let gateway = spawn_local_stack_child(
        gateway_script,
        &[
            (
                "CLAWDESK_PRODUCTION_GATEWAY_PORT",
                LOCAL_STACK_GATEWAY_PORT.to_string(),
            ),
            ("CLAWDESK_BACKEND_BASE_URL", local_stack_backend_url()),
        ],
    )?;
    bounded_log(
        &mut guard.logs,
        format!("production gateway started pid={}", gateway.id()),
    );
    guard.gateway = Some(gateway);

    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(100));
        if health_ok(&local_stack_gateway_url()) {
            break;
        }
    }

    Ok(local_stack_status_from(&mut guard))
}

#[tauri::command]
fn stop_local_stack(
    state: tauri::State<'_, SharedLocalStackState>,
) -> Result<LocalStackStatus, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Local stack state is poisoned".to_string())?;
    stop_local_stack_children(&mut guard);
    Ok(local_stack_status_from(&mut guard))
}

#[tauri::command]
fn restart_local_stack(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLocalStackState>,
) -> Result<LocalStackStatus, String> {
    {
        let mut guard = state
            .lock()
            .map_err(|_| "Local stack state is poisoned".to_string())?;
        stop_local_stack_children(&mut guard);
        bounded_log(&mut guard.logs, "local stack restarting");
    }
    start_local_stack(app, state)
}

#[tauri::command]
fn get_accessibility_status() -> Result<AccessibilityStatus, String> {
    Ok(accessibility_status_for_platform())
}

#[tauri::command]
fn open_accessibility_settings() -> Result<bool, String> {
    if cfg!(target_os = "macos") {
        Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| true)
            .map_err(|error| format!("Failed to open Accessibility settings: {error}"))
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn get_active_window_snapshot() -> Result<DesktopWindowSnapshot, String> {
    Ok(mock_active_window_snapshot())
}

#[tauri::command]
fn rehearse_desktop_action(
    request: DesktopActionRequest,
) -> Result<DesktopActionRehearsal, String> {
    Ok(rehearse_desktop_action_for(request))
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(SharedGatewayState::default())
        .manage(SharedLocalStackState::default())
        .invoke_handler(tauri::generate_handler![
            ensure_gateway,
            get_gateway_info,
            resolve_permission,
            pick_project_folder,
            read_legal_consent,
            write_legal_consent,
            save_legal_export,
            local_stack_status,
            start_local_stack,
            stop_local_stack,
            restart_local_stack,
            get_accessibility_status,
            open_accessibility_settings,
            get_active_window_snapshot,
            rehearse_desktop_action
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                cleanup_gateway(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building ClawDesk");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            cleanup_gateway(app_handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_gateway_info_uses_mock_gateway_contract() {
        let info = default_gateway_info("sidecar");

        assert_eq!(info.base_url, "http://127.0.0.1:18890");
        assert_eq!(info.ws_url, "ws://127.0.0.1:18890/events");
        assert_eq!(info.mode, "sidecar");
    }

    #[test]
    fn gateway_info_from_base_url_builds_ws_contract() {
        let info =
            gateway_info_from_base_url("https://gateway.example.test/root/", None, "external")
                .expect("https gateway should be valid");

        assert_eq!(info.base_url, "https://gateway.example.test/root");
        assert_eq!(info.ws_url, "wss://gateway.example.test/root/events");
        assert_eq!(info.mode, "external");
    }

    #[test]
    fn gateway_info_from_base_url_uses_ws_override() {
        let info = gateway_info_from_base_url(
            "http://127.0.0.1:18891",
            Some("ws://127.0.0.1:18891/custom-events/"),
            "external",
        )
        .expect("gateway should accept ws override");

        assert_eq!(info.base_url, "http://127.0.0.1:18891");
        assert_eq!(info.ws_url, "ws://127.0.0.1:18891/custom-events");
    }

    #[test]
    fn gateway_info_from_base_url_rejects_invalid_base_url() {
        let result = gateway_info_from_base_url("file:///tmp/gateway.sock", None, "external");

        assert!(result.is_err());
    }

    #[test]
    fn gateway_health_url_normalizes_trailing_slash() {
        assert_eq!(
            gateway_health_url("http://127.0.0.1:18891/"),
            "http://127.0.0.1:18891/health"
        );
    }

    #[test]
    fn mock_gateway_allowed_by_default_in_test_builds() {
        assert!(mock_gateway_allowed_for(None, false));
    }

    #[test]
    fn mock_gateway_is_disabled_for_production_profile_or_runtime_flag() {
        assert!(!mock_gateway_allowed_for(Some("production"), false));
        assert!(!mock_gateway_allowed_for(None, true));
        assert!(mock_gateway_allowed_for(Some("mock-candidate"), false));
    }

    #[test]
    fn permission_payload_preserves_frontend_contract() {
        let payload = permission_result_payload(&PermissionResult {
            request_id: "perm-123".to_string(),
            allowed: false,
            reason: Some("人工拒絕".to_string()),
        });

        assert_eq!(payload["type"], "permission.result");
        assert_eq!(payload["requestId"], "perm-123");
        assert_eq!(payload["allowed"], false);
        assert_eq!(payload["reason"], "人工拒絕");
    }

    #[test]
    fn permission_payload_keeps_null_reason_when_absent() {
        let payload = permission_result_payload(&PermissionResult {
            request_id: "perm-456".to_string(),
            allowed: true,
            reason: None,
        });

        assert!(payload["reason"].is_null());
    }

    #[test]
    fn initial_project_directory_accepts_existing_directory() {
        let cwd = std::env::current_dir().expect("cwd should exist");
        let resolved = initial_project_directory(Some(cwd.to_string_lossy().to_string()));

        assert_eq!(resolved, Some(cwd));
    }

    #[test]
    fn initial_project_directory_rejects_empty_or_missing_path() {
        assert_eq!(initial_project_directory(None), None);
        assert_eq!(initial_project_directory(Some("   ".to_string())), None);
        assert_eq!(
            initial_project_directory(Some("__clawdesk_missing_test_dir__".to_string())),
            None
        );
    }

    #[test]
    fn legal_consent_persistence_round_trip() {
        let base = std::env::temp_dir().join(format!(
            "clawdesk-legal-consent-test-{}",
            std::process::id()
        ));
        let path = base.join("record.json");
        let record = LegalConsentRecord {
            version: "2026-05-13.install-terms.v1".to_string(),
            accepted_at: "2026-05-13T00:00:00.000Z".to_string(),
            document_hash: "fnv1a-test".to_string(),
            documents: vec!["INSTALLER_TERMS.md".to_string()],
        };

        write_legal_consent_to_path(path.clone(), &record).expect("record should write");
        let stored = read_legal_consent_from_path(path.clone())
            .expect("record should read")
            .expect("record should exist");

        assert_eq!(stored.version, record.version);
        assert_eq!(stored.document_hash, record.document_hash);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn legal_export_requires_valid_json() {
        let base = std::env::temp_dir().join(format!(
            "clawdesk-legal-export-test-{}",
            std::process::id()
        ));
        let path = base.join("legal-summary.json");

        write_legal_export_to_path(path.clone(), r#"{"product":"ClawDesk"}"#)
            .expect("valid json should export");
        assert!(path.exists());

        let invalid = write_legal_export_to_path(base.join("invalid.json"), "not json");
        assert!(invalid.is_err());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn local_stack_urls_use_production_sim_ports() {
        assert_eq!(local_stack_backend_url(), "http://127.0.0.1:19120");
        assert_eq!(local_stack_gateway_url(), "http://127.0.0.1:19130");
        assert_eq!(local_stack_gateway_ws_url(), "ws://127.0.0.1:19130/events");
    }

    #[test]
    fn bounded_log_keeps_recent_entries() {
        let mut logs = Vec::new();
        for index in 0..45 {
            bounded_log(&mut logs, format!("line-{index}"));
        }

        assert_eq!(logs.len(), 40);
        assert_eq!(logs.first().map(String::as_str), Some("line-5"));
        assert_eq!(logs.last().map(String::as_str), Some("line-44"));
    }

    #[test]
    fn accessibility_status_has_macos_setup_contract() {
        let status = accessibility_status_for_platform();

        assert!(status.settings_url.contains("Privacy_Accessibility"));
        assert!(status.setup_hint.contains("輔助使用"));
        assert!(!status.can_read_active_window);
    }

    #[test]
    fn desktop_rehearsal_blocks_high_risk_actions() {
        let rehearsal = rehearse_desktop_action_for(DesktopActionRequest {
            action: "click".to_string(),
            target_label: "預覽動作".to_string(),
            risk: Some("high".to_string()),
        });

        assert_eq!(rehearsal.stage, "authorize");
        assert!(!rehearsal.executable);
        assert!(rehearsal.blocked_reason.is_some());
        assert!(rehearsal.observed_element.is_some());
    }
}
