import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";

export type GameConnectionState = "idle" | "connecting" | "connected";

const CONNECTION_TIMEOUT_SECONDS = 30;

interface GameConnectionModalProps {
  visible: boolean;
  state: GameConnectionState;
  serverName: string | null;
  onClose: () => void;
}

export function GameConnectionModal({
  visible,
  state,
  serverName,
  onClose,
}: GameConnectionModalProps) {
  const [closing, setClosing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(CONNECTION_TIMEOUT_SECONDS);

  useEffect(() => {
    if (state === "connecting") {
      setTimeRemaining(CONNECTION_TIMEOUT_SECONDS);
      const interval = setInterval(() => {
        setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state]);

  if (!visible) return null;

  const handleCloseGame = async () => {
    setClosing(true);
    try {
      await invoke("kill_game");
      onClose();
    } catch (err) {
      console.error("Failed to close game:", err);
    } finally {
      setClosing(false);
    }
  };

  const statusText =
    state === "connecting"
      ? `Connecting to ${serverName}...`
      : `Connected to ${serverName}`;

  const progressPercent = ((CONNECTION_TIMEOUT_SECONDS - timeRemaining) / CONNECTION_TIMEOUT_SECONDS) * 100;

  return (
    <div className="game-connection-overlay">
      <div className="game-connection-modal">
        <div className="game-connection-status">
          {state === "connecting" && <div className="game-connection-spinner" />}
          <h2>{statusText}</h2>
          {state === "connecting" && (
            <div className="game-connection-progress">
              <div
                className="game-connection-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="button"
          onClick={handleCloseGame}
          disabled={closing}
        >
          {closing ? "Closing..." : "Close Game"}
        </button>
      </div>
    </div>
  );
}
