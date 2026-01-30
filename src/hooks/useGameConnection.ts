import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type { GameConnectionState } from "../components";

interface GameRestartingEvent {
  server_name: string;
  reason: string | null;
}

export function useGameConnection() {
  const [gameConnectionState, setGameConnectionState] =
    useState<GameConnectionState>("idle");
  const [connectedServerName, setConnectedServerName] = useState<string | null>(
    null
  );
  const [restartReason, setRestartReason] = useState<string | null>(null);

  useEffect(() => {
    const unlistenConnecting = listen<string>("game-connecting", (event) => {
      setGameConnectionState("connecting");
      setConnectedServerName(event.payload);
      setRestartReason(null);
    });

    const unlistenConnected = listen<string>("game-connected", (event) => {
      setGameConnectionState("connected");
      setConnectedServerName(event.payload);
      setRestartReason(null);
    });

    const unlistenRestarting = listen<GameRestartingEvent>(
      "game-restarting",
      (event) => {
        setGameConnectionState("restarting");
        setConnectedServerName(event.payload.server_name);
        setRestartReason(event.payload.reason);
      }
    );

    const unlistenClosed = listen("game-closed", () => {
      setGameConnectionState("idle");
      setConnectedServerName(null);
      setRestartReason(null);
    });

    return () => {
      unlistenConnecting.then((unlisten) => unlisten());
      unlistenConnected.then((unlisten) => unlisten());
      unlistenRestarting.then((unlisten) => unlisten());
      unlistenClosed.then((unlisten) => unlisten());
    };
  }, []);

  const closeGameConnectionModal = useCallback(() => {
    setGameConnectionState("idle");
    setConnectedServerName(null);
    setRestartReason(null);
  }, []);

  return {
    gameConnectionState,
    connectedServerName,
    restartReason,
    closeGameConnectionModal,
    showGameConnectionModal: gameConnectionState !== "idle",
  };
}
