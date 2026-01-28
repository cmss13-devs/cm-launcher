mod auth;
mod byond;
mod control_server;
mod discord;
mod presence;
mod settings;
#[cfg(feature = "steam")]
mod steam;

pub const DEFAULT_STEAM_ID: u32 = 4313790;
pub const DEFAULT_STEAM_NAME: &str = "production";

mod webview2;

use tauri::Manager;

use auth::{
    background_refresh_task, get_access_token, get_auth_state, logout, refresh_auth, start_login,
};
use byond::{
    check_byond_version, connect_to_server, delete_byond_version, install_byond_version,
    list_installed_byond_versions,
};
use settings::{get_settings, set_auth_mode};

#[cfg(feature = "steam")]
use steam::{
    cancel_steam_auth_ticket, get_steam_auth_ticket, get_steam_launch_options, get_steam_user_info,
    steam_authenticate,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_control_server_port(control_server: tauri::State<'_, control_server::ControlServer>) -> u16 {
    control_server.port
}

#[tauri::command]
fn kill_game(presence_manager: tauri::State<'_, std::sync::Arc<presence::PresenceManager>>) -> bool {
    presence_manager.kill_game_process()
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
            get_control_server_port,
            kill_game,
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
            get_control_server_port,
            kill_game,
            get_steam_user_info,
            get_steam_auth_ticket,
            cancel_steam_auth_ticket,
            steam_authenticate,
            get_steam_launch_options,
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

    builder = builder.manage(std::sync::Arc::clone(&presence_manager));

    builder
        .setup(move |app| {
            let handle = app.handle().clone();

            presence::start_presence_background_task(
                std::sync::Arc::clone(&presence_manager),
                steam_poll_callback,
                handle.clone(),
            );

            match control_server::ControlServer::start(
                handle.clone(),
                std::sync::Arc::clone(&presence_manager),
            ) {
                Ok(server) => {
                    tracing::info!("Control server running on port {}", server.port);
                    app.manage(server);
                }
                Err(e) => {
                    tracing::error!("Failed to start control server: {}", e);
                }
            }

            tauri::async_runtime::spawn(async move {
                background_refresh_task(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
