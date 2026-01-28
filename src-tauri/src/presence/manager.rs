//! Manages multiple presence providers and game session state

use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::status::fetch_player_count;
use super::traits::{ConnectionParams, GameSession, PresenceProvider, PresenceState};

const STATUS_UPDATE_INTERVAL: Duration = Duration::from_secs(30);

/// Manages game session state and multiple presence providers
pub struct PresenceManager {
    providers: Vec<Box<dyn PresenceProvider>>,
    game_session: Arc<Mutex<Option<GameSession>>>,
    game_process: Arc<Mutex<Option<Child>>>,
    last_connection_params: Arc<Mutex<Option<ConnectionParams>>>,
}

impl PresenceManager {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            game_session: Arc::new(Mutex::new(None)),
            game_process: Arc::new(Mutex::new(None)),
            last_connection_params: Arc::new(Mutex::new(None)),
        }
    }

    /// Add a presence provider
    #[allow(dead_code)]
    pub fn add_provider(&mut self, provider: Box<dyn PresenceProvider>) {
        tracing::info!("Adding presence provider: {}", provider.name());
        provider.update_presence(&PresenceState::InLauncher);
        self.providers.push(provider);
    }

    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub fn start_game_session(&self, server_name: String, status_url: String, process: Child) {
        tracing::info!("Starting game session on {}", server_name);
        {
            let mut session = self.game_session.lock().unwrap();
            *session = Some(GameSession {
                server_name: server_name.clone(),
                status_url,
            });
        }
        {
            let mut proc = self.game_process.lock().unwrap();
            *proc = Some(process);
        }

        // Initial presence update
        self.update_all_presence(&PresenceState::Playing {
            server_name,
            player_count: 0,
        });
    }

    /// Check if the game is still running
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

    /// Get the current game session
    pub fn get_game_session(&self) -> Option<GameSession> {
        self.game_session.lock().unwrap().clone()
    }

    /// Clear the game session
    pub fn clear_game_session(&self) {
        {
            let mut session = self.game_session.lock().unwrap();
            *session = None;
        }
        {
            let mut proc = self.game_process.lock().unwrap();
            *proc = None;
        }
        self.update_all_presence(&PresenceState::InLauncher);
    }

    /// Store connection parameters for potential restart
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub fn set_last_connection_params(&self, params: ConnectionParams) {
        let mut connection_params = self.last_connection_params.lock().unwrap();
        *connection_params = Some(params);
    }

    /// Get the last connection parameters
    pub fn get_last_connection_params(&self) -> Option<ConnectionParams> {
        self.last_connection_params.lock().unwrap().clone()
    }

    /// Kill the current game process
    pub fn kill_game_process(&self) -> bool {
        let mut proc_guard = self.game_process.lock().unwrap();

        if let Some(ref mut child) = *proc_guard {
            match child.kill() {
                Ok(()) => {
                    tracing::info!("Game process killed successfully");

                    let _ = child.wait();
                    drop(proc_guard);
                    self.clear_game_session();
                    true
                }
                Err(e) => {
                    tracing::error!("Failed to kill game process: {}", e);
                    false
                }
            }
        } else {
            tracing::debug!("No game process to kill");
            false
        }
    }

    /// Update presence on all providers
    pub fn update_all_presence(&self, state: &PresenceState) {
        tracing::debug!("Updating presence: {:?}", state);
        for provider in &self.providers {
            provider.update_presence(state);
        }
    }

    /// Clear presence on all providers
    #[allow(dead_code)]
    pub fn clear_all_presence(&self) {
        for provider in &self.providers {
            provider.clear_presence();
        }
    }
}

impl Default for PresenceManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Start the background task that updates presence based on game state
pub fn start_presence_background_task(
    presence_manager: Arc<PresenceManager>,
    poll_callback: Option<Box<dyn Fn() + Send + Sync>>,
    app_handle: tauri::AppHandle,
) {
    use tauri::Emitter;

    tauri::async_runtime::spawn(async move {
        let poll_interval = Duration::from_millis(100);
        let mut was_game_running = false;
        let mut last_player_count: Option<u32> = None;
        let mut last_status_fetch = std::time::Instant::now() - STATUS_UPDATE_INTERVAL;

        loop {
            // Run any poll callbacks (e.g., Steam callbacks)
            if let Some(ref callback) = poll_callback {
                callback();
            }

            let game_running = presence_manager.check_game_running();

            if game_running {
                was_game_running = true;

                if let Some(session) = presence_manager.get_game_session() {
                    let now = std::time::Instant::now();
                    if now.duration_since(last_status_fetch) >= STATUS_UPDATE_INTERVAL {
                        last_status_fetch = now;

                        let player_count =
                            fetch_player_count(&session.status_url, &session.server_name).await;

                        if player_count != last_player_count {
                            last_player_count = player_count;

                            presence_manager.update_all_presence(&PresenceState::Playing {
                                server_name: session.server_name.clone(),
                                player_count: player_count.unwrap_or(0),
                            });
                        }
                    }
                }
            } else if was_game_running {
                was_game_running = false;
                last_player_count = None;
                presence_manager.update_all_presence(&PresenceState::InLauncher);
                app_handle.emit("game-closed", ()).ok();
            }

            tokio::time::sleep(poll_interval).await;
        }
    });
}
