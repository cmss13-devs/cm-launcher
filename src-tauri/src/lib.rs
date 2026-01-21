mod auth;
mod byond;
mod settings;
mod steam;
mod webview2;

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
    #[cfg(target_os = "windows")]
    {
        if !webview2::check_webview2_installed() {
            webview2::show_webview2_error();
            let _ = open::that("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
            std::process::exit(1);
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
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
        ]);

    // Initialize Steam state if feature is enabled
    #[cfg(feature = "steam")]
    {
        use std::sync::Arc;

        if steamworks::restart_app_if_necessary(steamworks::AppId(4313790)) {
            std::process::exit(1);
        }

        match steam::SteamState::init() {
            Ok(steam_state) => {
                let steam_state = Arc::new(steam_state);

                steam::presence::set_launcher_status(steam_state.client());

                steam::state::start_steam_background_task(Arc::clone(&steam_state));

                builder = builder.manage(steam_state);
            }
            Err(e) => {
                eprintln!("Failed to initialize Steam: {:?}", e);
            }
        }
    }

    builder
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
