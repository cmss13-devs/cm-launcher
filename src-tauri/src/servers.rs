use crate::settings::load_settings;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::RwLock;

const SERVER_API_URL: &str = "https://db.cm-ss13.com/api/Round";
const SERVER_FETCH_INTERVAL_SECS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerData {
    pub round_id: i64,
    pub mode: String,
    pub map_name: String,
    pub round_duration: f64,
    pub gamestate: i32,
    pub players: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub name: String,
    pub url: String,
    pub status: String,
    #[serde(default)]
    pub data: Option<ServerData>,
    pub recommended_byond_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ServerApiResponse {
    servers: Vec<Server>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerUpdateEvent {
    pub servers: Vec<Server>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerErrorEvent {
    pub error: String,
}

#[derive(Debug, Clone, Default)]
struct PreviousServerState {
    was_online: bool,
    round_id: Option<i64>,
}

#[derive(Debug, Default)]
pub struct ServerState {
    servers: RwLock<Vec<Server>>,
    previous_states: RwLock<HashMap<String, PreviousServerState>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get_servers(&self) -> Vec<Server> {
        self.servers.read().await.clone()
    }
}

async fn fetch_servers_internal() -> Result<Vec<Server>, String> {
    let response = reqwest::get(SERVER_API_URL)
        .await
        .map_err(|e| format!("Failed to fetch servers: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let api_response: ServerApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse server response: {}", e))?;

    Ok(api_response.servers)
}

/// Fetch servers and populate the cache. Called during app setup.
pub async fn init_servers(state: &Arc<ServerState>) {
    match fetch_servers_internal().await {
        Ok(servers) => {
            let mut previous_states = state.previous_states.write().await;
            for server in &servers {
                let is_online = server.status == "available";
                let round_id = server.data.as_ref().map(|d| d.round_id);
                previous_states.insert(
                    server.name.clone(),
                    PreviousServerState {
                        was_online: is_online,
                        round_id,
                    },
                );
            }
            drop(previous_states);

            *state.servers.write().await = servers;
            tracing::info!("Initial server fetch complete");
        }
        Err(e) => {
            tracing::error!("Initial server fetch failed: {}", e);
        }
    }
}

#[tauri::command]
pub async fn get_servers(state: tauri::State<'_, Arc<ServerState>>) -> Result<Vec<Server>, String> {
    Ok(state.servers.read().await.clone())
}

pub async fn server_fetch_background_task(handle: AppHandle, state: Arc<ServerState>) {
    loop {
        tokio::time::sleep(Duration::from_secs(SERVER_FETCH_INTERVAL_SECS)).await;

        match fetch_servers_internal().await {
            Ok(servers) => {
                // Check for notification triggers before updating state
                check_and_send_notifications(&handle, &state, &servers).await;

                *state.servers.write().await = servers.clone();
                let _ = handle.emit("servers-updated", ServerUpdateEvent { servers });
            }
            Err(error) => {
                tracing::error!("Server fetch error: {}", error);
                let _ = handle.emit("servers-error", ServerErrorEvent { error });
            }
        }
    }
}

async fn check_and_send_notifications(
    handle: &AppHandle,
    state: &Arc<ServerState>,
    new_servers: &[Server],
) {
    let notification_servers = match load_settings(handle) {
        Ok(settings) => settings.notification_servers,
        Err(e) => {
            tracing::warn!("Failed to load settings for notifications: {}", e);
            return;
        }
    };

    if notification_servers.is_empty() {
        return;
    }

    let mut previous_states = state.previous_states.write().await;

    for server in new_servers {
        if !notification_servers.contains(&server.name) {
            continue;
        }

        let is_online = server.status == "available";
        let current_round_id = server.data.as_ref().map(|d| d.round_id);

        let prev = previous_states
            .entry(server.name.clone())
            .or_insert_with(|| PreviousServerState {
                was_online: is_online,
                round_id: current_round_id,
            });

        let mut should_notify = false;
        let mut notification_title = String::new();
        let mut notification_body = String::new();

        if is_online && !prev.was_online {
            should_notify = true;
            notification_title = format!("{} is now online", server.name);
            notification_body = "The server is available to join.".to_string();
        } else if is_online {
            if let (Some(current), Some(previous)) = (current_round_id, prev.round_id) {
                if current > previous {
                    should_notify = true;
                    notification_title = format!("{} has restarted", server.name);
                    if let Some(data) = &server.data {
                        notification_body = format!("Round #{} - {}", data.round_id, data.map_name);
                    } else {
                        notification_body = format!("Round #{}", current);
                    }
                }
            }
        }

        prev.was_online = is_online;
        prev.round_id = current_round_id;

        if should_notify {
            if let Err(e) = handle
                .notification()
                .builder()
                .title(&notification_title)
                .body(&notification_body)
                .show()
            {
                tracing::warn!("Failed to send notification: {}", e);
            } else {
                tracing::info!(
                    "Sent notification for {}: {}",
                    server.name,
                    notification_title
                );
            }
        }
    }
}
