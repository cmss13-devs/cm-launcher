import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type { GameConnectionState } from "../components";

export function useGameConnection() {
  const [gameConnectionState, setGameConnectionState] =
    useState<GameConnectionState>("idle");
  const [connectedServerName, setConnectedServerName] = useState<string | null>(
    null
  );

  useEffect(() => {
    const unlistenConnecting = listen<string>("game-connecting", (event) => {
      setGameConnectionState("connecting");
      setConnectedServerName(event.payload);
    });

    const unlistenConnected = listen<string>("game-connected", (event) => {
      setGameConnectionState("connected");
      setConnectedServerName(event.payload);
    });

    const unlistenClosed = listen("game-closed", () => {
      setGameConnectionState("idle");
      setConnectedServerName(null);
    });

    return () => {
      unlistenConnecting.then((unlisten) => unlisten());
      unlistenConnected.then((unlisten) => unlisten());
      unlistenClosed.then((unlisten) => unlisten());
    };
  }, []);

  const closeGameConnectionModal = useCallback(() => {
    setGameConnectionState("idle");
    setConnectedServerName(null);
  }, []);

  return {
    gameConnectionState,
    connectedServerName,
    closeGameConnectionModal,
    showGameConnectionModal: gameConnectionState !== "idle",
  };
}
