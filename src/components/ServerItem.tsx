import { useState } from "react";
import { GAME_STATES } from "../constants";
import { useConnect, useError } from "../hooks";
import { useServerStore } from "../stores";
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

  const relaysReady = useServerStore((s) => s.relaysReady);

  const isOnline = server.status === "available";
  const data = server.data;

  const handleConnect = async () => {
    setConnecting(true);

    try {
      const result = await connect(server.name, "ServerItem.handleConnect");

      if (!result.success && result.auth_error) {
        if (result.auth_error.code === "auth_required") {
          onLoginRequired();
        } else if (result.auth_error.code === "steam_linking_required") {
          onSteamAuthRequired();
        } else {
          showError(result.auth_error.message);
        }
      } else if (!result.success) {
        showError(result.message);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const canConnect = isOnline && relaysReady;

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
