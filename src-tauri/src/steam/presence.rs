use steamworks::Client;

pub fn set_playing_status(client: &Client, server_name: &str, player_count: u32) {
    let friends = client.friends();

    friends.set_rich_presence("status", Some(&format!("Playing on {}", server_name)));
    friends.set_rich_presence("connect", Some(server_name));

    friends.set_rich_presence("players", Some(&player_count.to_string()));
    friends.set_rich_presence("name", Some(server_name));

    friends.set_rich_presence("steam_display", Some("#Status_Playing"));
    friends.set_rich_presence("steam_player_group", Some(server_name));
    friends.set_rich_presence("steam_player_group_size", Some(&player_count.to_string()));
}

pub fn set_launcher_status(client: &Client) {
    clear_presence(client);

    let friends = client.friends();

    friends.set_rich_presence("status", Some("In the Launcher"));
    friends.set_rich_presence("steam_display", Some("#Status_Launcher"));
}

pub fn clear_presence(client: &Client) {
    client.friends().clear_rich_presence();
}
