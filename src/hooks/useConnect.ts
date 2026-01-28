import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useSettingsStore, useSteamStore } from "../stores";

interface ConnectParams {
  version: string;
  host: string;
  port: string;
  serverName: string;
  source: string;
}

export function useConnect() {
  const authMode = useSettingsStore((s) => s.authMode);
  const steamAccessToken = useSteamStore((s) => s.accessToken);

  const connect = useCallback(
    async (params: ConnectParams) => {
      console.log(`[useConnect] connect called, source=${params.source}`);

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
        source: params.source,
      });
    },
    [authMode, steamAccessToken]
  );

  return { connect };
}
