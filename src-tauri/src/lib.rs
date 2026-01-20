mod auth;
mod byond;
mod settings;

use auth::{
    background_refresh_task, get_access_token, get_auth_state, logout, refresh_auth, start_login,
};
use byond::{
    check_byond_version, connect_to_server, delete_byond_version, install_byond_version,
    list_installed_byond_versions,
};
use settings::{get_settings, set_auth_mode};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_byond_version,
            install_byond_version,
            connect_to_server,
            list_installed_byond_versions,
            delete_byond_version,
            start_login,
            logout,
            get_auth_state,
            refresh_auth,
            get_access_token,
            get_settings,
            set_auth_mode,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                background_refresh_task(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
