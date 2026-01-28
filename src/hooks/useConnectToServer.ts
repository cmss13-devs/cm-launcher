import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { AuthMode } from "../types";

interface ConnectParams {
  version: string;
  host: string;
  port: string;
  serverName: string;
}

export function useConnectToServer(
  authMode: AuthMode,
  steamAccessToken: string | null
) {
  const connect = useCallback(
    async (params: ConnectParams) => {
      let accessToken: string | null = null;

      if (authMode === "cm_ss13") {
        accessToken = await invoke<string | null>("get_access_token");
      } else if (authMode === "steam") {
        accessToken = steamAccessToken;
      }
      // byond mode: accessToken stays null

      await invoke("connect_to_server", {
        version: params.version,
        host: params.host,
        port: params.port,
        accessType: authMode,
        accessToken,
        serverName: params.serverName,
      });
    },
    [authMode, steamAccessToken]
  );

  return { connect };
}
