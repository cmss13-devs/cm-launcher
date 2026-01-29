use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    #[default]
    CmSs13,
    Byond,
    Steam,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    Default,
    Ntos,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auth_mode: AuthMode,
    #[serde(default)]
    pub theme: Theme,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auth_mode: AuthMode::CmSs13,
            theme: Theme::Default,
        }
    }
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data.join(SETTINGS_FILE))
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    tracing::debug!("Loading settings");
    let path = get_settings_path(app)?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read settings file: {}", e))?;

    serde_json::from_str(&contents).map_err(|e| format!("Failed to parse settings: {}", e))
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    tracing::debug!("Saving settings");
    let path = get_settings_path(app)?;

    let contents = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, contents).map_err(|e| format!("Failed to write settings file: {}", e))
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub async fn set_auth_mode(app: AppHandle, mode: AuthMode) -> Result<AppSettings, String> {
    let mut settings = load_settings(&app)?;
    settings.auth_mode = mode;
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn set_theme(app: AppHandle, theme: Theme) -> Result<AppSettings, String> {
    let mut settings = load_settings(&app)?;
    settings.theme = theme;
    save_settings(&app, &settings)?;
    Ok(settings)
}
