//! Discord Rich Presence integration using discord-sdk

use std::sync::Arc;
use std::time::Duration;

use discord_sdk::{
    activity::{ActivityBuilder, Assets, Button},
    registration::{Application, LaunchCommand},
    wheel::{UserState, Wheel},
    Discord, Subscriptions,
};
use tokio::sync::{mpsc, watch};

#[cfg(feature = "steam")]
use crate::steam::get_steam_app_id;
use crate::{
    presence::{PresenceProvider, PresenceState},
    DEFAULT_STEAM_ID,
};

/// Discord Application ID for CM Launcher
const DISCORD_APP_ID: i64 = 1383904378154651768;

#[cfg(feature = "steam")]
/// Steam URL to launch the game
fn steam_launch_url() -> String {
    use crate::steam::get_steam_app_id;

    format!("steam://run/{}", get_steam_app_id())
}

#[cfg(not(feature = "steam"))]
fn steam_launch_url() -> String {
    String::new()
}

/// Timeout for waiting for Discord handshake
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Manages the Discord connection and background task
pub struct DiscordState {
    update_tx: mpsc::UnboundedSender<PresenceState>,
    /// Watch channel to monitor connection status
    connected_rx: watch::Receiver<bool>,
}

impl DiscordState {
    /// Initialize Discord integration
    ///
    /// This registers the application with Discord and spawns a background task
    /// to manage the Discord connection and presence updates.
    pub async fn init() -> Result<Self, discord_sdk::Error> {
        // Register app with Discord (allows Discord to launch via Steam)

        #[allow(unused_assignments, unused_mut)]
        let mut app_id: Option<u32> = None;

        #[cfg(feature = "steam")]
        {
            app_id = Some(get_steam_app_id());
        }

        if let Err(e) = discord_sdk::registration::register_app(Application {
            id: DISCORD_APP_ID,
            name: Some("CM Launcher".to_string()),
            command: LaunchCommand::Steam(app_id.unwrap_or(DEFAULT_STEAM_ID)),
        }) {
            tracing::warn!("Failed to register Discord app: {:?}", e);
        }

        let (update_tx, update_rx) = mpsc::unbounded_channel();
        let (connected_tx, connected_rx) = watch::channel(false);

        // Spawn background task to manage Discord connection
        tokio::spawn(Self::run_discord_task(update_rx, connected_tx));

        Ok(Self {
            update_tx,
            connected_rx,
        })
    }

    /// Wait for Discord to be connected, with a timeout
    /// Returns true if connected, false if timeout or connection failed
    pub async fn wait_for_connection(&self, timeout: Duration) -> bool {
        let mut rx = self.connected_rx.clone();

        // Check if already connected
        if *rx.borrow() {
            return true;
        }

        // Wait for connection with timeout
        match tokio::time::timeout(timeout, async {
            loop {
                if rx.changed().await.is_err() {
                    // Channel closed, connection task ended
                    return false;
                }
                if *rx.borrow() {
                    return true;
                }
            }
        })
        .await
        {
            Ok(connected) => connected,
            Err(_) => {
                tracing::warn!("Timed out waiting for Discord connection");
                false
            }
        }
    }

    /// Check if Discord is currently connected
    #[allow(dead_code)]
    pub fn is_connected(&self) -> bool {
        *self.connected_rx.borrow()
    }

    /// Background task that maintains the Discord connection and processes presence updates
    async fn run_discord_task(
        mut update_rx: mpsc::UnboundedReceiver<PresenceState>,
        connected_tx: watch::Sender<bool>,
    ) {
        let (wheel, handler) = Wheel::new(Box::new(|err| {
            tracing::warn!("Discord error: {:?}", err);
        }));

        let mut user_spoke = wheel.user();

        let discord = match Discord::new(DISCORD_APP_ID, Subscriptions::ACTIVITY, Box::new(handler))
        {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("Discord not available: {:?}", e);
                return;
            }
        };

        tracing::info!("Discord connecting...");

        let user = match tokio::time::timeout(HANDSHAKE_TIMEOUT, async {
            if user_spoke.0.changed().await.is_err() {
                Err("Discord connection closed".to_string())
            } else {
                match &*user_spoke.0.borrow() {
                    UserState::Connected(user) => Ok(user.clone()),
                    UserState::Disconnected(err) => Err(format!("Discord disconnected: {:?}", err)),
                }
            }
        })
        .await
        {
            Ok(Ok(user)) => user,
            Ok(Err(e)) => {
                tracing::warn!("{}", e);
                return;
            }
            Err(_) => {
                tracing::warn!("Discord handshake timed out");
                return;
            }
        };

        tracing::info!(
            "Discord Rich Presence connected as {}#{}",
            user.username,
            user.discriminator.unwrap_or(0)
        );

        // Signal that we're connected
        if connected_tx.send(true).is_err() {
            tracing::warn!("Failed to signal Discord connection status");
        }

        while let Some(state) = update_rx.recv().await {
            let result = match &state {
                PresenceState::InLauncher => {
                    let activity = ActivityBuilder::new()
                        .state("In Launcher")
                        .assets(Assets::default().large("logo", Some::<&str>("CM Launcher")))
                        .button(Button {
                            label: "Play".to_string(),
                            url: steam_launch_url(),
                        });
                    discord.update_activity(activity).await
                }
                PresenceState::Playing {
                    server_name,
                    player_count,
                } => {
                    let encoded_server =
                        url::form_urlencoded::byte_serialize(server_name.as_bytes())
                            .collect::<String>();
                    let join_url = format!("{}//{}", steam_launch_url(), encoded_server);

                    #[allow(unused_mut)]
                    let mut activity = ActivityBuilder::new()
                        .state(format!("Playing on {}", server_name))
                        .details(format!("{} players online", player_count))
                        .assets(Assets::default().large("logo", Some::<&str>("Colonial Marines")))
                        .button(Button {
                            label: "Join Game".to_string(),
                            url: join_url,
                        });

                    #[cfg(feature = "discord_invites")]
                    {
                        use discord_sdk::activity::Secrets;
                        use serde_json::json;

                        activity = activity
                            .party(
                                server_name,
                                std::num::NonZeroU32::new(*player_count),
                                std::num::NonZeroU32::new(300),
                                discord_sdk::activity::PartyPrivacy::Public,
                            )
                            .secrets(Secrets {
                                r#match: None,
                                join: Some(
                                    json!({"server_name": &server_name, "type": "join"})
                                        .to_string(),
                                ),
                                spectate: Some(
                                    json!({"server_name": &server_name, "type": "spectate"})
                                        .to_string(),
                                ),
                            })
                    }

                    discord.update_activity(activity).await
                }
                PresenceState::Disconnected => discord.clear_activity().await,
            };

            if let Err(e) = result {
                tracing::warn!("Failed to update Discord activity: {:?}", e);
            } else {
                tracing::debug!("Discord activity updated successfully");
            }
        }

        discord.disconnect().await;
        tracing::info!("Discord Rich Presence disconnected");
    }

    /// Send a presence update to the background task
    pub fn send_update(&self, state: PresenceState) {
        if self.update_tx.send(state.clone()).is_err() {
            tracing::warn!(
                "Failed to send Discord presence update (channel closed): {:?}",
                state
            );
        } else {
            tracing::debug!("Queued Discord presence update: {:?}", state);
        }
    }
}

/// Discord presence provider implementing the generic PresenceProvider trait
pub struct DiscordPresence {
    state: Arc<DiscordState>,
}

impl DiscordPresence {
    /// Create a new Discord presence provider
    pub fn new(state: Arc<DiscordState>) -> Self {
        Self { state }
    }
}

impl PresenceProvider for DiscordPresence {
    fn name(&self) -> &'static str {
        "Discord"
    }

    fn update_presence(&self, state: &PresenceState) {
        self.state.send_update(state.clone());
    }

    fn clear_presence(&self) {
        self.state.send_update(PresenceState::Disconnected);
    }
}
