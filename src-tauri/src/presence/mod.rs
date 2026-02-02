mod manager;
mod traits;

pub use manager::{start_presence_background_task, PresenceManager};
#[allow(unused_imports)]
pub use traits::{ConnectionParams, GameSession, PresenceProvider, PresenceState};
