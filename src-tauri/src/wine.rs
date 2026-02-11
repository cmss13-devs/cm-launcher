//! Wine prefix management for running BYOND on Linux.
//!
//! This module handles:
//! - Wine/winetricks detection and version checking
//! - Wine prefix initialization with required dependencies
//! - WebView2 installation within the prefix
//! - Launching executables via Wine
//!
//! In production builds, Wine is bundled as a compressed archive (wine.tar.zst) and
//! extracted to the app data directory on first use. This avoids linuxdeploy scanning
//! Wine binaries during AppImage creation.
//!
//! In development builds, the system Wine is used as a fallback.

use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
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

/// Resource names for bundled Wine
const WINE_ARCHIVE_RESOURCE: &str = "wine.tar.zst";
const WINETRICKS_RESOURCE: &str = "winetricks";
/// Directory name for extracted Wine in app data
const WINE_EXTRACTED_DIR: &str = "wine";

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
    InProgress,
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

/// Wine binary paths resolved from bundled or system Wine
#[derive(Debug, Clone)]
pub struct WinePaths {
    /// Path to the wine binary (wine64 preferred)
    pub wine: PathBuf,
    /// Path to wine64 binary (same as wine in most cases)
    pub wine64: PathBuf,
    /// Path to wineserver binary
    pub wineserver: PathBuf,
    /// Path to wineboot binary
    pub wineboot: PathBuf,
    /// Path to winetricks script
    pub winetricks: PathBuf,
    /// Wine installation directory (for setting LD_LIBRARY_PATH, etc.)
    pub wine_dir: PathBuf,
    /// Whether using bundled Wine (vs system)
    pub is_bundled: bool,
}

impl WinePaths {
    /// Get environment variables needed to run Wine commands
    pub fn get_env_vars(&self) -> Vec<(String, String)> {
        let mut vars = Vec::new();

        if self.is_bundled {
            // Set LD_LIBRARY_PATH to include Wine's libraries
            let lib64_dir = self.wine_dir.join("lib64");
            let lib_dir = self.wine_dir.join("lib");

            let existing_ld_path = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
            let ld_library_path = if existing_ld_path.is_empty() {
                format!("{}:{}", lib64_dir.display(), lib_dir.display())
            } else {
                format!(
                    "{}:{}:{}",
                    lib64_dir.display(),
                    lib_dir.display(),
                    existing_ld_path
                )
            };
            vars.push(("LD_LIBRARY_PATH".to_string(), ld_library_path));

            // Set WINEDLLPATH to Wine's DLL directories
            let wine_dll_path = format!(
                "{}:{}",
                self.wine_dir.join("lib64/wine").display(),
                self.wine_dir.join("lib/wine").display()
            );
            vars.push(("WINEDLLPATH".to_string(), wine_dll_path));

            // Set WINESERVER path
            vars.push((
                "WINESERVER".to_string(),
                self.wineserver.to_string_lossy().to_string(),
            ));
        }

        // Always suppress Wine debug output for cleaner logs
        vars.push(("WINEDEBUG".to_string(), "-all".to_string()));

        vars
    }

    /// Get environment variables for winetricks (includes WINE and WINE64)
    pub fn get_winetricks_env_vars(&self) -> Vec<(String, String)> {
        let mut vars = self.get_env_vars();

        // Winetricks needs to know where Wine binaries are
        vars.push(("WINE".to_string(), self.wine.to_string_lossy().to_string()));
        vars.push((
            "WINE64".to_string(),
            self.wine64.to_string_lossy().to_string(),
        ));

        vars
    }
}

/// Get the extracted Wine directory in app data
fn get_wine_extract_dir(app: &AppHandle) -> Result<PathBuf, WineError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| WineError::Other(format!("Failed to get app data directory: {}", e)))?;
    Ok(app_data.join(WINE_EXTRACTED_DIR))
}

/// Get the bundled Wine archive path from resources
fn get_wine_archive_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let archive_path = resource_dir.join(WINE_ARCHIVE_RESOURCE);
        if archive_path.exists() {
            return Some(archive_path);
        }
    }
    None
}

/// Extract the bundled Wine archive to app data directory
fn extract_wine_archive(app: &AppHandle) -> Result<PathBuf, WineError> {
    let archive_path = get_wine_archive_path(app)
        .ok_or_else(|| WineError::Other("Wine archive not found in resources".to_string()))?;

    let extract_dir = get_wine_extract_dir(app)?;

    tracing::info!(
        "Extracting Wine from {:?} to {:?}",
        archive_path,
        extract_dir
    );

    // Remove existing extraction if present (in case of corruption or upgrade)
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir)?;
    }
    fs::create_dir_all(&extract_dir)?;

    // Extract using tar with zstd decompression
    let output = Command::new("tar")
        .args([
            "--zstd",
            "-xf",
            archive_path.to_str().unwrap(),
            "-C",
            extract_dir.to_str().unwrap(),
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::Other(format!(
            "Failed to extract Wine archive: {}",
            stderr
        )));
    }

    tracing::info!("Wine extracted successfully");
    Ok(extract_dir)
}

/// Get the bundled Wine directory path, extracting from archive if needed
fn get_bundled_wine_dir(app: &AppHandle) -> Option<PathBuf> {
    // Check if Wine is already extracted in app data
    if let Ok(extract_dir) = get_wine_extract_dir(app) {
        if extract_dir.exists()
            && (extract_dir.join("bin/wine64").exists() || extract_dir.join("bin/wine").exists())
        {
            return Some(extract_dir);
        }
    }

    // Check if archive exists and extract it
    if get_wine_archive_path(app).is_some() {
        match extract_wine_archive(app) {
            Ok(extract_dir) => return Some(extract_dir),
            Err(e) => {
                tracing::error!("Failed to extract Wine archive: {}", e);
            }
        }
    }

    // In development, check if Wine was extracted locally in src-tauri/wine/
    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_wine_dir = PathBuf::from(manifest_dir).join("wine");
            if dev_wine_dir.exists()
                && (dev_wine_dir.join("bin/wine64").exists()
                    || dev_wine_dir.join("bin/wine").exists())
            {
                return Some(dev_wine_dir);
            }
        }
    }

    None
}

/// Get the bundled winetricks path
fn get_bundled_winetricks(app: &AppHandle) -> Option<PathBuf> {
    // In production, winetricks is bundled as a resource
    if let Ok(resource_dir) = app.path().resource_dir() {
        let winetricks_path = resource_dir.join(WINETRICKS_RESOURCE);
        if winetricks_path.exists() {
            return Some(winetricks_path);
        }
    }

    // In development, check if winetricks was downloaded locally
    #[cfg(debug_assertions)]
    {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let dev_winetricks = PathBuf::from(manifest_dir).join("winetricks");
            if dev_winetricks.exists() {
                return Some(dev_winetricks);
            }
        }
    }

    None
}

/// Resolve Wine paths - prefers bundled Wine, falls back to system Wine
pub fn resolve_wine_paths(app: &AppHandle) -> Result<WinePaths, WineError> {
    // Try bundled Wine first
    if let Some(wine_dir) = get_bundled_wine_dir(app) {
        let bin_dir = wine_dir.join("bin");

        let wine64 = if bin_dir.join("wine64").exists() {
            bin_dir.join("wine64")
        } else {
            bin_dir.join("wine")
        };
        let wine = if bin_dir.join("wine").exists() {
            bin_dir.join("wine")
        } else {
            wine64.clone()
        };
        let wineserver = bin_dir.join("wineserver");
        let wineboot = bin_dir.join("wineboot");

        if wine.exists() && wineserver.exists() {
            let winetricks = get_bundled_winetricks(app)
                .or_else(|| which::which("winetricks").ok())
                .ok_or(WineError::WinetricksNotFound)?;

            tracing::info!("Using bundled Wine from: {:?}", wine_dir);
            return Ok(WinePaths {
                wine,
                wine64,
                wineserver,
                wineboot,
                winetricks,
                wine_dir,
                is_bundled: true,
            });
        }
    }

    // Fall back to system Wine
    tracing::info!("Bundled Wine not found, falling back to system Wine");
    resolve_system_wine_paths()
}

/// Resolve system Wine paths using which
fn resolve_system_wine_paths() -> Result<WinePaths, WineError> {
    let wine64 = which::which("wine64")
        .or_else(|_| which::which("wine"))
        .map_err(|_| WineError::WineNotFound)?;

    let wine = which::which("wine").unwrap_or_else(|_| wine64.clone());

    // Derive wine_dir from the binary path (e.g., /usr/bin/wine64 -> /usr)
    let wine_dir = wine64
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("/usr"));

    let wineserver = which::which("wineserver").unwrap_or_else(|_| wine_dir.join("bin/wineserver"));

    let wineboot = which::which("wineboot").unwrap_or_else(|_| wine_dir.join("bin/wineboot"));

    let winetricks = which::which("winetricks").map_err(|_| WineError::WinetricksNotFound)?;

    Ok(WinePaths {
        wine,
        wine64,
        wineserver,
        wineboot,
        winetricks,
        wine_dir,
        is_bundled: false,
    })
}

/// Check if Wine is installed and return its version
pub fn check_wine_installed_with_paths(paths: &WinePaths) -> Result<(String, bool), WineError> {
    let mut cmd = Command::new(&paths.wine);
    cmd.arg("--version");

    // Apply environment variables for bundled Wine
    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }

    let output = cmd.output().map_err(|_| WineError::WineNotFound)?;

    if !output.status.success() {
        return Err(WineError::WineNotFound);
    }

    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let meets_minimum = parse_and_check_wine_version(&version_str);

    tracing::info!(
        "Wine detected: {} (bundled: {}, meets minimum: {})",
        version_str,
        paths.is_bundled,
        meets_minimum
    );

    Ok((version_str, meets_minimum))
}

/// Check if Wine is installed and return its version (legacy, uses system Wine only)
pub fn check_wine_installed() -> Result<(String, bool), WineError> {
    let paths = resolve_system_wine_paths()?;
    check_wine_installed_with_paths(&paths)
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

/// Check if winetricks is installed (using resolved paths)
pub fn check_winetricks_installed_with_paths(paths: &WinePaths) -> Result<PathBuf, WineError> {
    if paths.winetricks.exists() {
        Ok(paths.winetricks.clone())
    } else {
        Err(WineError::WinetricksNotFound)
    }
}

/// Check if winetricks is installed (legacy, uses system winetricks only)
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

    // Resolve Wine paths (bundled or system)
    let paths = match resolve_wine_paths(app) {
        Ok(p) => p,
        Err(e) => {
            status.error = Some(e.to_string());
            return status;
        }
    };

    // Check Wine
    match check_wine_installed_with_paths(&paths) {
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
    status.winetricks_installed = check_winetricks_installed_with_paths(&paths).is_ok();

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
fn run_wine_command_with_paths(
    paths: &WinePaths,
    prefix: &Path,
    args: &[impl AsRef<OsStr>],
) -> Result<Output, WineError> {
    let mut cmd = Command::new(&paths.wine);
    cmd.args(args);
    cmd.env("WINEPREFIX", prefix);

    // Apply environment variables for bundled Wine
    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output()?;
    Ok(output)
}

/// Run a Wine command with the specified prefix (legacy, uses system Wine)
#[allow(dead_code)]
fn run_wine_command(prefix: &Path, args: &[&str]) -> Result<Output, WineError> {
    let paths = resolve_system_wine_paths()?;
    run_wine_command_with_paths(&paths, prefix, args)
}

/// Run winetricks with a specific verb
fn run_winetricks_with_paths(
    paths: &WinePaths,
    prefix: &Path,
    verb: &str,
) -> Result<(), WineError> {
    tracing::info!("Running winetricks {}", verb);

    let mut cmd = Command::new(&paths.winetricks);
    cmd.args(["-q", verb]);
    cmd.env("WINEPREFIX", prefix);

    // Apply environment variables for bundled Wine (includes WINE and WINE64)
    for (key, value) in paths.get_winetricks_env_vars() {
        cmd.env(key, value);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::WinetricksFailed(
            verb.to_string(),
            stderr.to_string(),
        ));
    }

    Ok(())
}

/// Run winetricks with a specific verb (legacy, uses system Wine)
#[allow(dead_code)]
fn run_winetricks(prefix: &Path, verb: &str) -> Result<(), WineError> {
    let paths = resolve_system_wine_paths()?;
    run_winetricks_with_paths(&paths, prefix, verb)
}

/// Set a registry key in the Wine prefix
fn set_registry_key_with_paths(
    paths: &WinePaths,
    prefix: &Path,
    path: &str,
    key: &str,
    value: &str,
    reg_type: &str,
) -> Result<(), WineError> {
    // Use wine reg add command
    let full_path = format!("{}\\{}", path, key);

    let mut cmd = Command::new(&paths.wine);
    cmd.args([
        "reg", "add", path, "/v", key, "/t", reg_type, "/d", value, "/f",
    ]);
    cmd.env("WINEPREFIX", prefix);

    // Apply environment variables for bundled Wine
    for (k, v) in paths.get_env_vars() {
        cmd.env(k, v);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output()?;

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

/// Set a registry key in the Wine prefix (legacy, uses system Wine)
#[allow(dead_code)]
fn set_registry_key(
    prefix: &Path,
    path: &str,
    key: &str,
    value: &str,
    reg_type: &str,
) -> Result<(), WineError> {
    let paths = resolve_system_wine_paths()?;
    set_registry_key_with_paths(&paths, prefix, path, key, value, reg_type)
}

/// Check if a registry key/value exists in the Wine prefix
fn check_registry_key_exists(
    paths: &WinePaths,
    prefix: &Path,
    path: &str,
    value_name: &str,
) -> bool {
    let mut cmd = Command::new(&paths.wine);
    cmd.args(["reg", "query", path, "/v", value_name]);
    cmd.env("WINEPREFIX", prefix);

    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());

    match cmd.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

/// Kill a process running in the Wine prefix
fn kill_wine_process_with_paths(
    paths: &WinePaths,
    prefix: &Path,
    process_name: &str,
) -> Result<(), WineError> {
    let mut cmd = Command::new(&paths.wine);
    cmd.args(["taskkill", "/f", "/im", process_name]);
    cmd.env("WINEPREFIX", prefix);

    // Apply environment variables for bundled Wine
    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }

    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    let _ = cmd.output();
    Ok(())
}

/// Kill a process running in the Wine prefix (legacy, uses system Wine)
#[allow(dead_code)]
fn kill_wine_process(prefix: &Path, process_name: &str) -> Result<(), WineError> {
    let paths = resolve_system_wine_paths()?;
    kill_wine_process_with_paths(&paths, prefix, process_name)
}

/// Initialize the Wine prefix with all required dependencies
pub async fn initialize_prefix(app: &AppHandle) -> Result<(), WineError> {
    let prefix = get_wine_prefix(app)?;

    emit_progress(
        app,
        WineSetupStage::InProgress,
        0,
        "Checking Wine installation...",
    );

    // Resolve Wine paths (bundled or system)
    let paths = resolve_wine_paths(app)?;

    let (version, meets_min) = check_wine_installed_with_paths(&paths)?;
    if !meets_min {
        return Err(WineError::WineVersionTooOld(version));
    }

    check_winetricks_installed_with_paths(&paths)?;

    fs::create_dir_all(&prefix)?;

    emit_progress(
        app,
        WineSetupStage::InProgress,
        5,
        "Creating Wine prefix...",
    );

    let output = {
        let mut cmd = Command::new(&paths.wine);
        cmd.args(["wineboot", "--init"]);
        cmd.env("WINEPREFIX", &prefix);
        cmd.env("WINEDLLOVERRIDES", "mscoree=d;mshtml=d");
        for (key, value) in paths.get_env_vars() {
            cmd.env(key, value);
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.output()?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WineError::PrefixCreationFailed(stderr.to_string()));
    }

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let verb_count = WINETRICKS_VERBS.len();
    for (i, (verb, description)) in WINETRICKS_VERBS.iter().enumerate() {
        let progress = 10 + ((i as u8 * 40) / verb_count as u8);
        emit_progress(
            app,
            WineSetupStage::InProgress,
            progress,
            &format!("Installing {}...", description),
        );
        run_winetricks_with_paths(&paths, &prefix, verb)?;
    }

    emit_progress(
        app,
        WineSetupStage::InProgress,
        55,
        "Configuring WebView2 compatibility...",
    );

    set_registry_key_with_paths(
        &paths,
        &prefix,
        "HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\msedgewebview2.exe",
        "version",
        "win7",
        "REG_SZ",
    )?;

    emit_progress(
        app,
        WineSetupStage::InProgress,
        60,
        "Downloading WebView2 installer...",
    );

    let webview2_installer = prefix.join("webview2_installer.exe");
    download_webview2(&webview2_installer).await?;

    emit_progress(
        app,
        WineSetupStage::InProgress,
        80,
        "Installing WebView2 (this may take a while)...",
    );

    let installer_path = webview2_installer.to_string_lossy().to_string();

    // Spawn installer with timeout - it spawns background processes that never exit
    let mut cmd = Command::new(&paths.wine);
    cmd.args([installer_path.as_str(), "/silent", "/install"]);
    cmd.env("WINEPREFIX", &prefix);
    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    let mut child = cmd.spawn()?;

    // Poll registry key to detect when WebView2 is installed
    let webview2_reg_key = r"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let timeout = tokio::time::Duration::from_secs(300); // 5 min max
    let start = std::time::Instant::now();

    loop {
        if check_registry_key_exists(&paths, &prefix, webview2_reg_key, "pv") {
            tracing::info!("WebView2 installation detected via registry");
            break;
        }

        if let Ok(Some(_)) = child.try_wait() {
            tracing::info!("WebView2 installer exited");

            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            break;
        }

        if start.elapsed() > timeout {
            tracing::warn!("WebView2 installer timed out after 5 minutes");
            let _ = child.kill();
            break;
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    for process in &[
        "MicrosoftEdgeUpdate.exe",
        "MicrosoftEdgeWebView2Setup.exe",
        "setup.exe",
    ] {
        let _ = kill_wine_process_with_paths(&paths, &prefix, process);
    }

    let _ = fs::remove_file(&webview2_installer);

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

    if prefix.exists() {
        fs::remove_dir_all(&prefix)?;
    }

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
    let paths = resolve_wine_paths(app)?;

    let mut cmd = Command::new(&paths.wine);
    cmd.arg(exe_path);
    cmd.args(args);
    cmd.env("WINEPREFIX", &prefix);

    for (key, value) in paths.get_env_vars() {
        cmd.env(key, value);
    }

    for (key, value) in env_vars {
        cmd.env(key, value);
    }

    tracing::info!(
        "Launching via Wine (bundled: {}): {:?} {:?}",
        paths.is_bundled,
        exe_path,
        args
    );

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
