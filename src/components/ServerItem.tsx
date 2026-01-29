import { useState } from "react";
import { GAME_STATES } from "../constants";
import { useConnect, useError } from "../hooks";
import { useServerStore, useSettingsStore, useAuthStore, useSteamStore } from "../stores";
import type { Server } from "../types";
import { formatDuration } from "../utils";

interface ServerItemProps {
  server: Server;
  onLoginRequired: () => void;
  onSteamAuthRequired: () => void;
  autoConnecting?: boolean;
}

export function ServerItem({
  server,
  onLoginRequired,
  onSteamAuthRequired,
  autoConnecting = false,
}: ServerItemProps) {
  const [connecting, setConnecting] = useState(false);
  const { showError } = useError();
  const { connect } = useConnect();

  const authMode = useSettingsStore((s) => s.authMode);
  const isLoggedIn = useAuthStore((s) => s.authState.logged_in);
  const steamAccessToken = useSteamStore((s) => s.accessToken);
  const relays = useServerStore((s) => s.relays);
  const selectedRelay = useServerStore((s) => s.selectedRelay);

  const relay = relays.find((r) => r.id === selectedRelay);
  const port = server.url.split(":")[1];
  const isOnline = server.status === "available";
  const data = server.data;
  const byondVersion = server.recommended_byond_version;

  const handleConnect = async () => {
    if (authMode === "cm_ss13" && !isLoggedIn) {
      onLoginRequired();
      return;
    }

    if (authMode === "steam" && !steamAccessToken) {
      onSteamAuthRequired();
      return;
    }

    if (!relay || !byondVersion || !port) return;

    setConnecting(true);

    try {
      await connect({
        version: byondVersion,
        host: relay.host,
        port: port,
        serverName: server.name,
        source: "ServerItem.handleConnect",
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const canConnect = isOnline && relay && byondVersion && port;

  return (
    <div className="server-item">
      <div className="server-info">
        <div className="server-name">{server.name}</div>
        {isOnline && data ? (
          <div className="server-details">
            <span>Round #{data.round_id}</span>
            <span>{data.mode}</span>
            <span>{data.map_name}</span>
            <span>{formatDuration(data.round_duration)}</span>
            <span>{GAME_STATES[data.gamestate] || "Unknown"}</span>
          </div>
        ) : (
          <div className="server-details">
            <span>Server unavailable</span>
          </div>
        )}
      </div>
      <div className="server-status">
        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} />
        <div className="player-count">
          {isOnline && data ? data.players : "--"}
        </div>
        <button
          type="button"
          className="button"
          onClick={handleConnect}
          disabled={!canConnect || connecting || autoConnecting}
        >
          {connecting || autoConnecting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}
