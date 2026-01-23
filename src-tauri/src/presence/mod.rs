mod manager;
mod status;
mod traits;

pub use manager::{start_presence_background_task, PresenceManager};
#[allow(unused_imports)]
pub use traits::{ConnectionParams, GameSession, PresenceProvider, PresenceState};

// Re-export types needed for status fetching
#[allow(unused_imports)]
pub use status::{fetch_player_count, ServerData, ServerStatus, StatusResponse};
