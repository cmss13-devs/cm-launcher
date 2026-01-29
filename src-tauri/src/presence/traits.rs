#[derive(Debug, Clone)]
pub struct GameSession {
    pub server_name: String,
    pub status_url: String,
}

#[derive(Debug, Clone)]
pub struct ConnectionParams {
    pub version: String,
    pub host: String,
    pub port: String,
    pub access_type: Option<String>,
    pub access_token: Option<String>,
    pub server_name: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum PresenceState {
    InLauncher,
    Playing {
        server_name: String,
        player_count: u32,
    },
    #[allow(dead_code)]
    Disconnected,
}

#[allow(dead_code)]
pub trait PresenceProvider: Send + Sync {
    /// Returns the name of this presence provider (for logging)
    fn name(&self) -> &'static str;

    /// Update the presence state
    fn update_presence(&self, state: &PresenceState);

    /// Clear all presence data
    fn clear_presence(&self);
}
