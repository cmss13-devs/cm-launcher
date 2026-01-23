use std::sync::Arc;
use std::thread;
#[cfg(feature = "steam")]
use tauri::Manager;
use tiny_http::{Response, Server};
use url::Url;

use crate::presence::{ConnectionParams, PresenceManager};

/// CORS headers to allow cross-origin requests from the game's embedded browser
fn cors_headers() -> Vec<tiny_http::Header> {
    vec![
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, OPTIONS"[..])
            .unwrap(),
        tiny_http::Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..])
            .unwrap(),
    ]
}

/// Helper to create a JSON response with CORS headers
fn json_response(status: u16, body: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(body.to_string())
        .with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        )
        .with_status_code(status);

    for header in cors_headers() {
        response.add_header(header);
    }

    response
}

/// Helper to create an empty response for OPTIONS preflight requests
fn preflight_response() -> Response<std::io::Empty> {
    let mut response = Response::empty(204);
    for header in cors_headers() {
        response.add_header(header);
    }
    response
}

pub struct ControlServer {
    pub port: u16,
}

impl ControlServer {
    pub fn start(
        app_handle: tauri::AppHandle,
        presence_manager: Arc<PresenceManager>,
    ) -> Result<Self, String> {
        let server = Server::http("127.0.0.1:0")
            .map_err(|e| format!("Failed to start control server: {}", e))?;

        let port = server
            .server_addr()
            .to_ip()
            .ok_or("Failed to get server address")?
            .port();

        tracing::info!("Control server started on port {}", port);

        thread::spawn(move || {
            Self::run_server(server, app_handle, presence_manager);
        });

        Ok(Self { port })
    }

    fn run_server(
        server: Server,
        app_handle: tauri::AppHandle,
        presence_manager: Arc<PresenceManager>,
    ) {
        for request in server.incoming_requests() {
            // Handle CORS preflight requests
            if request.method() == &tiny_http::Method::Options {
                request.respond(preflight_response()).ok();
                continue;
            }

            let full_url = format!("http://127.0.0.1{}", request.url());
            let url = match Url::parse(&full_url) {
                Ok(url) => url,
                Err(e) => {
                    tracing::error!("Failed to parse control server URL: {}", e);
                    let response = json_response(400, serde_json::json!({"error": e.to_string()}));
                    request.respond(response).ok();
                    continue;
                }
            };

            tracing::debug!("Control server received request: {}", url.path());

            match url.path() {
                "/restart" => {
                    Self::handle_restart(request, &app_handle, &presence_manager);
                }
                "/status" => {
                    Self::handle_status(request, &presence_manager);
                }
                _ => {
                    let response = json_response(404, serde_json::json!({"error": "Not found"}));
                    request.respond(response).ok();
                }
            }
        }
    }

    fn handle_restart(
        request: tiny_http::Request,
        app_handle: &tauri::AppHandle,
        presence_manager: &Arc<PresenceManager>,
    ) {
        tracing::info!("Restart command received");

        let connection_params = presence_manager.get_last_connection_params();

        if connection_params.is_none() {
            let response = json_response(
                400,
                serde_json::json!({"error": "No previous connection to restart"}),
            );
            request.respond(response).ok();
            return;
        }

        let params = connection_params.unwrap();

        if presence_manager.kill_game_process() {
            tracing::info!("Killed existing game process");
        }

        let app_handle = app_handle.clone();
        let server_name = params.server_name.clone();

        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            let fresh_params = match refresh_auth_token(&app_handle, params).await {
                Ok(params) => params,
                Err(e) => {
                    tracing::error!("Failed to refresh auth token: {}", e);
                    return;
                }
            };

            let result = crate::byond::connect_to_server(
                app_handle,
                fresh_params.version,
                fresh_params.host,
                fresh_params.port,
                fresh_params.access_type,
                fresh_params.access_token,
                fresh_params.server_name,
            )
            .await;

            match result {
                Ok(_) => tracing::info!("Successfully restarted connection to {}", server_name),
                Err(e) => tracing::error!("Failed to restart connection: {}", e),
            }
        });

        let response = json_response(200, serde_json::json!({"status": "restarting"}));
        request.respond(response).ok();
    }

    fn handle_status(request: tiny_http::Request, presence_manager: &Arc<PresenceManager>) {
        let is_running = presence_manager.check_game_running();
        let session = presence_manager.get_game_session();

        let response = json_response(
            200,
            serde_json::json!({
                "running": is_running,
                "server_name": session.as_ref().map(|s| &s.server_name),
            }),
        );
        request.respond(response).ok();
    }
}

/// Refresh authentication token if needed based on auth type.
/// Steam tokens expire after 30 minutes, so we need to re-authenticate.
/// CM-SS13 tokens are refreshed in the background, so we need to fetch the current one.
async fn refresh_auth_token(
    #[allow(unused_variables)] app_handle: &tauri::AppHandle,
    mut params: ConnectionParams,
) -> Result<ConnectionParams, String> {
    match params.access_type.as_deref() {
        Some("steam") => {
            #[cfg(feature = "steam")]
            {
                tracing::info!("Refreshing Steam authentication token");
                let steam_state = app_handle
                    .try_state::<Arc<crate::steam::SteamState>>()
                    .ok_or("Steam state not available")?;

                let auth_result =
                    crate::steam::authenticate_with_steam(&steam_state, false).await?;

                if !auth_result.success {
                    return Err(auth_result
                        .error
                        .unwrap_or_else(|| "Steam authentication failed".to_string()));
                }

                params.access_token = auth_result.access_token;
                Ok(params)
            }

            #[cfg(not(feature = "steam"))]
            {
                Err("Steam feature not enabled".to_string())
            }
        }
        Some("cm_ss13") => {
            tracing::info!("Fetching current CM-SS13 access token");
            match crate::auth::TokenStorage::get_tokens()? {
                Some(tokens) if !crate::auth::TokenStorage::is_expired() => {
                    params.access_token = Some(tokens.access_token);
                    Ok(params)
                }
                _ => Err("CM-SS13 authentication expired or not available".to_string()),
            }
        }
        _ => Ok(params),
    }
}
