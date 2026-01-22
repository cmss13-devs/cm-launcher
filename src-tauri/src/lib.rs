mod auth;
mod byond;
mod discord;
mod presence;
mod settings;
#[cfg(feature = "steam")]
mod steam;
#[cfg(target_os = "linux")]
mod wine;

pub const DEFAULT_STEAM_ID: u32 = 4313790;

mod webview2;

use auth::{
    background_refresh_task, get_access_token, get_auth_state, logout, refresh_auth, start_login,
};
use byond::{
    check_byond_version, connect_to_server, delete_byond_version, install_byond_version,
    list_installed_byond_versions,
};
use settings::{get_settings, set_auth_mode};

#[cfg(target_os = "linux")]
use wine::{check_wine_status, initialize_wine_prefix, reset_wine_prefix, WineStatus};

#[cfg(target_os = "linux")]
pub use wine::get_platform;

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn get_platform() -> String {
    #[cfg(target_os = "windows")]
    return "windows".to_string();

    #[cfg(target_os = "macos")]
    return "macos".to_string();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return "unknown".to_string();
}

#[cfg(not(target_os = "linux"))]
#[derive(serde::Serialize)]
struct WineStatus {
    installed: bool,
    version: Option<String>,
    meets_minimum_version: bool,
    winetricks_installed: bool,
    prefix_initialized: bool,
    webview2_installed: bool,
    error: Option<String>,
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn check_wine_status() -> Result<WineStatus, String> {
    Ok(WineStatus {
        installed: false,
        version: None,
        meets_minimum_version: false,
        winetricks_installed: false,
        prefix_initialized: false,
        webview2_installed: false,
        error: Some("Wine is only available on Linux".to_string()),
    })
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn initialize_wine_prefix() -> Result<(), String> {
    Err("Wine is only available on Linux".to_string())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn reset_wine_prefix() -> Result<(), String> {
    Err("Wine is only available on Linux".to_string())
}

#[cfg(feature = "steam")]
use steam::{
    cancel_steam_auth_ticket, get_steam_auth_ticket, get_steam_launch_options, get_steam_user_info,
    steam_authenticate,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    #[cfg(target_os = "windows")]
    {
        if !webview2::check_webview2_installed() {
            webview2::show_webview2_error();
            let _ = open::that("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
            std::process::exit(1);
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(not(feature = "steam"))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
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
            get_platform,
            check_wine_status,
            initialize_wine_prefix,
            reset_wine_prefix,
        ]);
    }

    #[cfg(feature = "steam")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
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
            get_steam_user_info,
            get_steam_auth_ticket,
            cancel_steam_auth_ticket,
            steam_authenticate,
            get_steam_launch_options,
            get_platform,
            check_wine_status,
            initialize_wine_prefix,
            reset_wine_prefix,
        ]);
    }

    let mut manager = presence::PresenceManager::new();
    #[allow(unused_mut)]
    let mut steam_poll_callback: Option<Box<dyn Fn() + Send + Sync>> = None;

    #[cfg(feature = "steam")]
    {
        use std::sync::Arc;

        use crate::steam::get_steam_app_id;

        if steamworks::restart_app_if_necessary(steamworks::AppId(get_steam_app_id())) {
            std::process::exit(1);
        }

        match steam::SteamState::init() {
            Ok(steam_state) => {
                let steam_state = Arc::new(steam_state);

                let steam_presence = steam::SteamPresence::new(steam_state.client().clone());
                manager.add_provider(Box::new(steam_presence));

                let steam_state_clone = Arc::clone(&steam_state);
                steam_poll_callback = Some(Box::new(move || steam_state_clone.run_callbacks()));

                builder = builder.manage(steam_state);
            }
            Err(e) => {
                tracing::error!("Failed to initialize Steam: {:?}", e);
            }
        }
    }

    {
        use std::sync::Arc;
        use std::time::Duration;

        match tauri::async_runtime::block_on(discord::DiscordState::init()) {
            Ok(discord_state) => {
                let discord_state = Arc::new(discord_state);

                // Wait for Discord connection before adding the provider
                // This ensures the initial "In Launcher" presence is sent after connection
                let connected = tauri::async_runtime::block_on(
                    discord_state.wait_for_connection(Duration::from_secs(10)),
                );

                if connected {
                    tracing::info!("Discord connection established, adding presence provider");
                } else {
                    tracing::warn!(
                        "Discord connection not established within timeout, adding provider anyway"
                    );
                }

                let discord_presence = discord::DiscordPresence::new(Arc::clone(&discord_state));
                manager.add_provider(Box::new(discord_presence));
            }
            Err(e) => {
                tracing::error!("Failed to initialize Discord: {:?}", e);
            }
        }
    }

    let presence_manager = std::sync::Arc::new(manager);

    presence::start_presence_background_task(
        std::sync::Arc::clone(&presence_manager),
        steam_poll_callback,
    );

    builder = builder.manage(presence_manager);

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
