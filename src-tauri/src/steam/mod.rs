pub mod commands;
pub mod presence;
pub mod state;

pub use commands::{
    cancel_steam_auth_ticket, get_steam_auth_ticket, get_steam_launch_options, get_steam_user_info,
    steam_authenticate,
};

pub use presence::SteamPresence;
pub use state::SteamState;

use crate::DEFAULT_STEAM_ID;

pub fn get_steam_app_id() -> u32 {
    if let Some(env) = option_env!("STEAM_APP_ID") {
        env.parse().expect("invalid STEAM_APP_ID")
    } else {
        DEFAULT_STEAM_ID
    }
}
