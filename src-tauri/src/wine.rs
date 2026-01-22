//! Wine prefix management for running BYOND on Linux.
//!
//! This module handles:
//! - Wine/winetricks detection and version checking
//! - Wine prefix initialization with required dependencies
//! - WebView2 installation within the prefix
//! - Launching executables via Wine

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::{AppHandle, Emitter, Manager};

/// Minimum required Wine version (major.minor)
const MIN_WINE_VERSION: (u32, u32) = (10, 5);

/// WebView2 installer URL (standalone archive version that works with Wine)
const WEBVIEW2_DOWNLOAD_URL: &str = "https://github.com/aedancullen/webview2-evergreen-standalone-installer-archive/releases/download/109.0.1518.78/MicrosoftEdgeWebView2RuntimeInstallerX64.exe";

/// Marker file to track initialization state
const INIT_MARKER_FILE: &str = ".cm_launcher_initialized";

/// Current initialization version - bump this to force re-initialization
const INIT_VERSION: u32 = 1;

/// Winetricks verbs to install, in order
const WINETRICKS_VERBS: &[(&str, &str)] = &[
    ("vcrun2022", "Visual C++ 2022 runtime"),
    ("dxtrans", "DirectX Transform libraries"),
    ("corefonts", "Microsoft core fonts"),
    ("dxvk", "DXVK (Vulkan-based DirectX)"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WineStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub meets_minimum_version: bool,
    pub winetricks_installed: bool,
    pub prefix_initialized: bool,
    pub webview2_installed: bool,
    pub error: Option<String>,
}

impl Default for WineStatus {
    fn default() -> Self {
        Self {
            installed: false,
            version: None,
            meets_minimum_version: false,
            winetricks_installed: false,
            prefix_initialized: false,
            webview2_installed: false,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WineSetupStage {
    Checking,
    CreatingPrefix,
    InstallingVcrun2022,
    InstallingDxtrans,
    InstallingCorefonts,
    InstallingDxvk,
    SettingRegistry,
    DownloadingWebview2,
    InstallingWebview2,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WineSetupProgress {
    pub stage: WineSetupStage,
    pub progress: u8,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum WineError {
    #[error("Wine is not installed. Please install Wine 10.5+ using your package manager.")]
    WineNotFound,

    #[error("Wine version {0} is too old. Please upgrade to Wine 10.5 or newer.")]
    WineVersionTooOld(String),

    #[error("Winetricks is not installed. Please install winetricks using your package manager.")]
    WinetricksNotFound,

    #[error("Failed to create Wine prefix: {0}")]
    PrefixCreationFailed(String),

    #[error("Failed to run winetricks {0}: {1}")]
    WinetricksFailed(String, String),

    #[error("Failed to download WebView2: {0}")]
    WebView2DownloadFailed(String),

    #[error("Failed to install WebView2: {0}")]
    WebView2InstallFailed(String),

    #[error("Failed to set registry key: {0}")]
    RegistryFailed(String),

    #[error("Failed to launch application: {0}")]
    LaunchFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

impl From<WineError> for String {
    fn from(e: WineError) -> Self {
        e.to_string()
    }
}

/// Check if Wine is installed and return its version
pub fn check_wine_installed() -> Result<(String, bool), WineError> {
    let wine_path = which::which("wine").map_err(|_| WineError::WineNotFound)?;

    let output = Command::new(&wine_path)
        .arg("--version")
        .output()
        .map_err(|_| WineError::WineNotFound)?;

    if !output.status.success() {
        return Err(WineError::WineNotFound);
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let meets_minimum = parse_and_check_wine_version(&version_str);

    tracing::info!(
        "Wine detected: {} (meets minimum: {})",
        version_str,
        meets_minimum
    );

    Ok((version_str, meets_minimum))
}

/// Parse Wine version string and check if it meets minimum requirements
fn parse_and_check_wine_version(version_str: &str) -> bool {
    // Wine version formats:
    // - "wine-10.5" (stable)
    // - "wine-10.5-rc1" (release candidate)
    // - "wine-10.5-staging" (staging)

    let version_part = version_str
        .strip_prefix("wine-")
        .unwrap_or(version_str)
        .split('-')
        .next()
        .unwrap_or("");

    let parts: Vec<&str> = version_part.split('.').collect();
    if parts.len() < 2 {
        return false;
    }

    let major: u32 = match parts[0].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };

    let minor: u32 = match parts[1].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };

    (major, minor) >= MIN_WINE_VERSION
}

/// Check if winetricks is installed
pub fn check_winetricks_installed() -> Result<PathBuf, WineError> {
    which::which("winetricks").map_err(|_| WineError::WinetricksNotFound)
}

/// Get the Wine prefix directory for this application
pub fn get_wine_prefix(app: &AppHandle) -> Result<PathBuf, WineError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| WineError::Other(format!("Failed to get app data directory: {}", e)))?;

    Ok(app_data.join("wine_prefix"))
}

/// Check if the Wine prefix has been initialized
fn check_prefix_initialized(prefix: &Path) -> bool {
    let marker_path = prefix.join(INIT_MARKER_FILE);
    if !marker_path.exists() {
        return false;
    }

    // Check initialization version
    if let Ok(contents) = fs::read_to_string(&marker_path) {
        if let Ok(version) = contents.trim().parse::<u32>() {
            return version >= INIT_VERSION;
        }
    }

    false
}

/// Check if WebView2 is installed in the prefix
fn check_webview2_installed(prefix: &Path) -> bool {
    // WebView2 installs to Program Files
    let webview2_path = prefix
        .join("drive_c")
        .join("Program Files (x86)")
        .join("Microsoft")
        .join("EdgeWebView");

    webview2_path.exists()
}

/// Get comprehensive Wine status
pub async fn check_prefix_status(app: &AppHandle) -> WineStatus {
    let mut status = WineStatus::default();

    // Check Wine
    match check_wine_installed() {
        Ok((version, meets_min)) => {
            status.installed = true;
            status.version = Some(version);
            status.meets_minimum_version = meets_min;
        }
        Err(e) => {
            status.error = Some(e.to_string());
            return status;
        }
    }

    // Check winetricks
    status.winetricks_installed = check_winetricks_installed().is_ok();

    // Check prefix
    if let Ok(prefix) = get_wine_prefix(app) {
        status.prefix_initialized = check_prefix_initialized(&prefix);
        status.webview2_installed = check_webview2_installed(&prefix);
    }

    status
}

/// Emit a progress event
fn emit_progress(app: &AppHandle, stage: WineSetupStage, progress: u8, message: &str) {
    let progress_event = WineSetupProgress {
        stage,
        progress,
        message: message.to_string(),
    };

    if let Err(e) = app.emit("wine-setup-progress", &progress_event) {
        tracing::warn!("Failed to emit progress event: {}", e);
    }

    tracing::info!("[{}%] {}", progress, message);
}

/// Run a Wine command with the specified prefix
fn run_wine_command(prefix: &Path, args: &[&str]) -> Result<Output, WineError> {
    let wine_path = which::which("wine").map_err(|_| WineError::WineNotFound)?;

    let output = Command::new(&wine_path)
        .args(args)
        .env("WINEPREFIX", prefix)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    Ok(output)
}

/// Run winetricks with a specific verb
fn run_winetricks(prefix: &Path, verb: &str) -> Result<(), WineError> {
    let winetricks_path = check_winetricks_installed()?;

    tracing::info!("Running winetricks {}", verb);

    let output = Command::new(&winetricks_path)
        .args(["-q", verb])
        .env("WINEPREFIX", prefix)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::WinetricksFailed(verb.to_string(), stderr.to_string()));
    }

    Ok(())
}

/// Set a registry key in the Wine prefix
fn set_registry_key(
    prefix: &Path,
    path: &str,
    key: &str,
    value: &str,
    reg_type: &str,
) -> Result<(), WineError> {
    let wine_path = which::which("wine").map_err(|_| WineError::WineNotFound)?;

    // Use wine reg add command
    let full_path = format!("{}\\{}", path, key);
    let output = Command::new(&wine_path)
        .args([
            "reg",
            "add",
            path,
            "/v",
            key,
            "/t",
            reg_type,
            "/d",
            value,
            "/f",
        ])
        .env("WINEPREFIX", prefix)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::RegistryFailed(format!(
            "Failed to set {}: {}",
            full_path, stderr
        )));
    }

    tracing::info!("Set registry key: {} = {}", full_path, value);
    Ok(())
}

/// Kill a process running in the Wine prefix
fn kill_wine_process(prefix: &Path, process_name: &str) -> Result<(), WineError> {
    let wine_path = which::which("wine").map_err(|_| WineError::WineNotFound)?;

    // Use wineserver to kill the process
    let _ = Command::new(&wine_path)
        .args(["taskkill", "/f", "/im", process_name])
        .env("WINEPREFIX", prefix)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output();

    Ok(())
}

/// Initialize the Wine prefix with all required dependencies
pub async fn initialize_prefix(app: &AppHandle) -> Result<(), WineError> {
    let prefix = get_wine_prefix(app)?;

    // Check prerequisites
    emit_progress(
        app,
        WineSetupStage::Checking,
        0,
        "Checking Wine installation...",
    );

    let (version, meets_min) = check_wine_installed()?;
    if !meets_min {
        return Err(WineError::WineVersionTooOld(version));
    }

    check_winetricks_installed()?;

    // Create prefix directory
    fs::create_dir_all(&prefix)?;

    // Step 1: Create/initialize prefix
    emit_progress(
        app,
        WineSetupStage::CreatingPrefix,
        5,
        "Creating Wine prefix...",
    );

    let output = run_wine_command(&prefix, &["wineboot", "--init"])?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::PrefixCreationFailed(stderr.to_string()));
    }

    // Wait for wineboot to complete
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Step 2-5: Install winetricks verbs
    let verb_stages = [
        WineSetupStage::InstallingVcrun2022,
        WineSetupStage::InstallingDxtrans,
        WineSetupStage::InstallingCorefonts,
        WineSetupStage::InstallingDxvk,
    ];

    for (i, (verb, description)) in WINETRICKS_VERBS.iter().enumerate() {
        let progress = 15 + (i as u8 * 12); // 15, 27, 39, 51
        emit_progress(
            app,
            verb_stages[i].clone(),
            progress,
            &format!("Installing {}...", description),
        );

        run_winetricks(&prefix, verb)?;
    }

    // Step 6: Set registry key for WebView2 compatibility
    emit_progress(
        app,
        WineSetupStage::SettingRegistry,
        65,
        "Configuring WebView2 compatibility...",
    );

    set_registry_key(
        &prefix,
        "HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\msedgewebview2.exe",
        "version",
        "win7",
        "REG_SZ",
    )?;

    // Step 7: Download WebView2
    emit_progress(
        app,
        WineSetupStage::DownloadingWebview2,
        70,
        "Downloading WebView2 installer...",
    );

    let webview2_installer = prefix.join("webview2_installer.exe");
    download_webview2(&webview2_installer).await?;

    // Step 8: Install WebView2
    emit_progress(
        app,
        WineSetupStage::InstallingWebview2,
        85,
        "Installing WebView2 (this may take a while)...",
    );

    let output = run_wine_command(
        &prefix,
        &[webview2_installer.to_str().unwrap(), "/silent", "/install"],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Don't fail on WebView2 install errors - it often returns non-zero but succeeds
        tracing::warn!("WebView2 installer returned non-zero: {}", stderr);
    }

    // Wait for installation to complete
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Kill MicrosoftEdgeUpdate.exe if it's running
    let _ = kill_wine_process(&prefix, "MicrosoftEdgeUpdate.exe");

    // Clean up installer
    let _ = fs::remove_file(&webview2_installer);

    // Mark as initialized
    let marker_path = prefix.join(INIT_MARKER_FILE);
    fs::write(&marker_path, INIT_VERSION.to_string())?;

    emit_progress(
        app,
        WineSetupStage::Complete,
        100,
        "Wine environment setup complete!",
    );

    tracing::info!("Wine prefix initialization complete");
    Ok(())
}

/// Download the WebView2 installer
async fn download_webview2(dest: &Path) -> Result<(), WineError> {
    tracing::info!("Downloading WebView2 from {}", WEBVIEW2_DOWNLOAD_URL);

    let response = reqwest::get(WEBVIEW2_DOWNLOAD_URL)
        .await
        .map_err(|e| WineError::WebView2DownloadFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(WineError::WebView2DownloadFailed(format!(
            "HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| WineError::WebView2DownloadFailed(e.to_string()))?;

    fs::write(dest, &bytes).map_err(|e| WineError::WebView2DownloadFailed(e.to_string()))?;

    tracing::info!("WebView2 installer downloaded to {:?}", dest);
    Ok(())
}

/// Reset the Wine prefix by deleting and recreating it
pub async fn reset_prefix(app: &AppHandle) -> Result<(), WineError> {
    let prefix = get_wine_prefix(app)?;

    tracing::info!("Resetting Wine prefix at {:?}", prefix);

    // Delete existing prefix
    if prefix.exists() {
        fs::remove_dir_all(&prefix)?;
    }

    // Reinitialize
    initialize_prefix(app).await
}

/// Launch an executable using Wine
pub fn launch_with_wine(
    app: &AppHandle,
    exe_path: &Path,
    args: &[&str],
    env_vars: &[(&str, &str)],
) -> Result<std::process::Child, WineError> {
    let prefix = get_wine_prefix(app)?;
    let wine_path = which::which("wine").map_err(|_| WineError::WineNotFound)?;

    let mut cmd = Command::new(&wine_path);
    cmd.arg(exe_path);
    cmd.args(args);
    cmd.env("WINEPREFIX", &prefix);

    for (key, value) in env_vars {
        cmd.env(key, value);
    }

    tracing::info!("Launching via Wine: {:?} {:?}", exe_path, args);

    let child = cmd
        .spawn()
        .map_err(|e| WineError::LaunchFailed(e.to_string()))?;

    Ok(child)
}

// Tauri commands

#[tauri::command]
pub async fn check_wine_status(app: AppHandle) -> Result<WineStatus, String> {
    Ok(check_prefix_status(&app).await)
}

#[tauri::command]
pub async fn initialize_wine_prefix(app: AppHandle) -> Result<(), String> {
    initialize_prefix(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_wine_prefix(app: AppHandle) -> Result<(), String> {
    reset_prefix(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "windows")]
    return "windows".to_string();

    #[cfg(target_os = "linux")]
    return "linux".to_string();

    #[cfg(target_os = "macos")]
    return "macos".to_string();

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return "unknown".to_string();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wine_version() {
        assert!(parse_and_check_wine_version("wine-10.5"));
        assert!(parse_and_check_wine_version("wine-10.6"));
        assert!(parse_and_check_wine_version("wine-11.0"));
        assert!(parse_and_check_wine_version("wine-10.5-staging"));
        assert!(parse_and_check_wine_version("wine-10.5-rc1"));

        assert!(!parse_and_check_wine_version("wine-10.4"));
        assert!(!parse_and_check_wine_version("wine-9.0"));
        assert!(!parse_and_check_wine_version("wine-8.21"));
        assert!(!parse_and_check_wine_version("invalid"));
    }
}
