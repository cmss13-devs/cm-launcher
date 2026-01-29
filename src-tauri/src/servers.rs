use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

const SERVER_API_URL: &str = "https://db.cm-ss13.com/api/Round";
const SERVER_FETCH_INTERVAL_SECS: u64 = 30;

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

#[derive(Debug, Default)]
pub struct ServerState {
    servers: RwLock<Vec<Server>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self::default()
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
