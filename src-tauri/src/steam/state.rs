use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use steamworks::{AuthTicket, Client};

#[derive(Debug, Clone)]
pub struct GameSession {
    pub server_name: String,
    pub status_url: String,
}

pub struct SteamState {
    client: Client,
    game_session: Arc<Mutex<Option<GameSession>>>,
    game_process: Arc<Mutex<Option<Child>>>,
    active_ticket: Arc<Mutex<Option<AuthTicket>>>,
}

impl SteamState {
    pub fn init() -> Result<Self, steamworks::SteamAPIInitError> {
        let client = Client::init()?;
        Ok(Self {
            client,
            game_session: Arc::new(Mutex::new(None)),
            game_process: Arc::new(Mutex::new(None)),
            active_ticket: Arc::new(Mutex::new(None)),
        })
    }

    pub fn get_steam_id(&self) -> u64 {
        self.client.user().steam_id().raw()
    }

    pub fn get_display_name(&self) -> String {
        self.client.friends().name()
    }

    pub fn get_auth_session_ticket(&self) -> Result<Vec<u8>, String> {
        let identity = steamworks::networking_types::NetworkingIdentity::new();
        let (ticket, ticket_bytes) = self.client.user().authentication_session_ticket(identity);

        let mut active = self.active_ticket.lock().unwrap();
        *active = Some(ticket);

        Ok(ticket_bytes)
    }

    pub fn cancel_auth_ticket(&self) {
        let mut active = self.active_ticket.lock().unwrap();
        *active = None;
    }

    pub fn client(&self) -> &Client {
        &self.client
    }

    pub fn get_launch_command_line(&self) -> String {
        self.client.apps().launch_command_line()
    }

    pub fn run_callbacks(&self) {
        self.client.run_callbacks();
    }

    #[allow(dead_code)]
    pub fn start_game_session(&self, server_name: String, status_url: String, process: Child) {
        {
            let mut session = self.game_session.lock().unwrap();
            *session = Some(GameSession {
                server_name,
                status_url,
            });
        }
        {
            let mut proc = self.game_process.lock().unwrap();
            *proc = Some(process);
        }
    }

    pub fn check_game_running(&self) -> bool {
        let mut proc_guard = self.game_process.lock().unwrap();

        if let Some(ref mut child) = *proc_guard {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // Process has exited
                    drop(proc_guard);
                    self.clear_game_session();
                    false
                }
                Ok(None) => {
                    // Process still running
                    true
                }
                Err(_) => {
                    // Error checking process, assume dead
                    drop(proc_guard);
                    self.clear_game_session();
                    false
                }
            }
        } else {
            false
        }
    }

    pub fn get_game_session(&self) -> Option<GameSession> {
        self.game_session.lock().unwrap().clone()
    }

    pub fn clear_game_session(&self) {
        {
            let mut session = self.game_session.lock().unwrap();
            *session = None;
        }
        {
            let mut proc = self.game_process.lock().unwrap();
            *proc = None;
        }
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct StatusResponse {
    pub servers: Vec<ServerStatus>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ServerStatus {
    pub name: String,
    #[allow(dead_code)]
    pub status: String,
    pub data: Option<ServerData>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ServerData {
    pub players: u32,
}

pub async fn fetch_player_count(status_url: &str, server_name: &str) -> Option<u32> {
    let response = reqwest::get(status_url).await.ok()?;
    let status: StatusResponse = response.json().await.ok()?;

    status
        .servers
        .iter()
        .find(|s| s.name == server_name)
        .and_then(|s| s.data.as_ref())
        .map(|d| d.players)
}

const CALLBACK_INTERVAL: Duration = Duration::from_millis(100);
const STATUS_UPDATE_INTERVAL: Duration = Duration::from_secs(30);

pub fn start_steam_background_task(steam_state: Arc<SteamState>) {
    tauri::async_runtime::spawn(async move {
        let mut last_player_count: Option<u32> = None;
        let mut last_status_fetch = std::time::Instant::now() - STATUS_UPDATE_INTERVAL;

        loop {
            steam_state.run_callbacks();

            if steam_state.check_game_running() {
                if let Some(session) = steam_state.get_game_session() {
                    let now = std::time::Instant::now();
                    if now.duration_since(last_status_fetch) >= STATUS_UPDATE_INTERVAL {
                        last_status_fetch = now;

                        let player_count =
                            fetch_player_count(&session.status_url, &session.server_name).await;

                        if player_count != last_player_count {
                            last_player_count = player_count;

                            super::presence::set_playing_status(
                                steam_state.client(),
                                &session.server_name,
                                player_count.unwrap_or(0),
                            );
                        }
                    }
                }
            } else if last_player_count.is_some() {
                last_player_count = None;
                super::presence::set_launcher_status(steam_state.client());
            }

            tokio::time::sleep(CALLBACK_INTERVAL).await;
        }
    });
}
