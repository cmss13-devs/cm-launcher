use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use crate::control_server::ControlServer;
#[cfg(target_os = "windows")]
use crate::presence::{ConnectionParams, PresenceManager};
#[cfg(target_os = "windows")]
use std::process::Command;
#[cfg(target_os = "windows")]
use std::sync::Arc;
#[derive(Debug, Serialize, Deserialize)]
pub struct ByondVersionInfo {
    pub version: String,
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub success: bool,
    pub message: String,
}

/// Get the base directory for BYOND installations within the app's data directory
fn get_byond_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data.join("byond"))
}

/// Get the directory for a specific BYOND version
fn get_byond_version_dir(app: &AppHandle, version: &str) -> Result<PathBuf, String> {
    let base = get_byond_base_dir(app)?;
    Ok(base.join(version))
}

/// Get the path to DreamSeeker executable for a specific version
#[cfg(target_os = "windows")]
fn get_dreamseeker_path(app: &AppHandle, version: &str) -> Result<PathBuf, String> {
    let version_dir = get_byond_version_dir(app, version)?;
    Ok(version_dir
        .join("byond")
        .join("bin")
        .join("dreamseeker.exe"))
}

#[cfg(not(target_os = "windows"))]
fn get_dreamseeker_path(_app: &AppHandle, _version: &str) -> Result<PathBuf, String> {
    Err("BYOND is only natively supported on Windows".to_string())
}

/// Check if a specific BYOND version is installed
#[tauri::command]
pub async fn check_byond_version(
    app: AppHandle,
    version: String,
) -> Result<ByondVersionInfo, String> {
    tracing::debug!("Checking BYOND version: {}", version);
    let dreamseeker_path = get_dreamseeker_path(&app, &version)?;
    let installed = dreamseeker_path.exists();

    Ok(ByondVersionInfo {
        version: version.clone(),
        installed,
        path: if installed {
            Some(dreamseeker_path.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

/// Get the download URL for a specific BYOND version
fn get_byond_download_url(version: &str) -> Result<String, String> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid BYOND version format: {}", version));
    }

    let major = parts[0];

    Ok(format!(
        "https://www.byond.com/download/build/{}/{}_byond.zip",
        major, version
    ))
}

/// Download and install a specific BYOND version
#[tauri::command]
pub async fn install_byond_version(
    app: AppHandle,
    version: String,
) -> Result<ByondVersionInfo, String> {
    let existing = check_byond_version(app.clone(), version.clone()).await?;
    if existing.installed {
        tracing::debug!("BYOND version {} already installed", version);
        return Ok(existing);
    }

    tracing::info!("Installing BYOND version: {}", version);
    let download_url = get_byond_download_url(&version)?;
    let version_dir = get_byond_version_dir(&app, &version)?;

    fs::create_dir_all(&version_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let zip_path = version_dir.join("byond.zip");

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("Failed to download BYOND: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download BYOND version {}: HTTP {}",
            version,
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    fs::write(&zip_path, &bytes).map_err(|e| format!("Failed to save download: {}", e))?;

    let file = fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;

    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => version_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
            }
            let mut outfile =
                fs::File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                fs::set_permissions(&outpath, fs::Permissions::from_mode(mode)).ok();
            }
        }
    }

    fs::remove_file(&zip_path).ok();

    tracing::info!("BYOND version {} installed successfully", version);

    check_byond_version(app, version).await
}

/// Connect to a server using a specific BYOND version
#[tauri::command]
pub async fn connect_to_server(
    app: AppHandle,
    version: String,
    host: String,
    port: String,
    access_type: Option<String>,
    access_token: Option<String>,
    server_name: String,
) -> Result<ConnectionResult, String> {
    tracing::info!("Connecting to server {} (BYOND {})", server_name, version);
    let version_info = install_byond_version(app.clone(), version.clone()).await?;

    if !version_info.installed {
        let msg = format!("Failed to install BYOND version {}", version);
        tracing::error!("{}", msg);
        return Err(msg);
    }

    let dreamseeker_path = version_info.path.ok_or("DreamSeeker path not found")?;

    #[cfg(target_os = "windows")]
    {
        // Get the control server port to include in the connection URL
        let control_port = app
            .try_state::<ControlServer>()
            .map(|s| s.port.to_string());

        // Build query parameters
        let mut query_params = Vec::new();
        if let (Some(access_type), Some(token)) = (&access_type, &access_token) {
            query_params.push(format!("{}={}", access_type, token));
        }
        if let Some(port) = &control_port {
            query_params.push(format!("launcher_port={}", port));
        }

        let connect_url = if query_params.is_empty() {
            format!("byond://{}:{}", host, port)
        } else {
            format!("byond://{}:{}?{}", host, port, query_params.join("&"))
        };

        // Set a unique WebView2 user data folder to avoid conflicts with the system BYOND pager.
        // When the BYOND pager is running, it locks the default WebView2 user data directory,
        // preventing our DreamSeeker from using WebView2. Using a separate folder resolves this.
        let webview2_data_dir = get_byond_base_dir(&app)?.join("webview2_data");

        let child = Command::new(&dreamseeker_path)
            .arg(&connect_url)
            .env("WEBVIEW2_USER_DATA_FOLDER", &webview2_data_dir)
            .spawn()
            .map_err(|e| format!("Failed to launch DreamSeeker: {}", e))?;

        if let Some(manager) = app.try_state::<Arc<PresenceManager>>() {
            // Store connection params for potential restart
            manager.set_last_connection_params(ConnectionParams {
                version: version.clone(),
                host: host.clone(),
                port: port.clone(),
                access_type,
                access_token,
                server_name: server_name.clone(),
            });

            manager.start_game_session(
                server_name,
                "https://db.cm-ss13.com/api/Round".to_string(),
                child,
            );
        }

        Ok(ConnectionResult {
            success: true,
            message: format!("Connecting to {} with BYOND {}", host, version),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Suppress unused warnings
        let _ = (dreamseeker_path, host, port, server_name, access_type, access_token);
        Err("BYOND is only natively supported on Windows".to_string())
    }
}

/// List all installed BYOND versions
#[tauri::command]
pub async fn list_installed_byond_versions(
    app: AppHandle,
) -> Result<Vec<ByondVersionInfo>, String> {
    let base_dir = get_byond_base_dir(&app)?;

    if !base_dir.exists() {
        return Ok(vec![]);
    }

    let mut versions = Vec::new();

    let entries =
        fs::read_dir(&base_dir).map_err(|e| format!("Failed to read BYOND directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if let Some(version_name) = path.file_name().and_then(|n| n.to_str()) {
                let info = check_byond_version(app.clone(), version_name.to_string()).await?;
                if info.installed {
                    versions.push(info);
                }
            }
        }
    }

    Ok(versions)
}

/// Delete a specific BYOND version
#[tauri::command]
pub async fn delete_byond_version(app: AppHandle, version: String) -> Result<bool, String> {
    let version_dir = get_byond_version_dir(&app, &version)?;

    if version_dir.exists() {
        tracing::info!("Deleting BYOND version: {}", version);
        fs::remove_dir_all(&version_dir)
            .map_err(|e| format!("Failed to delete BYOND version: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}
