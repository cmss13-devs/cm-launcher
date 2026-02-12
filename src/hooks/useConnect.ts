import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export interface AuthError {
  code: string;
  message: string;
  linking_url: string | null;
}

export interface ConnectionResult {
  success: boolean;
  message: string;
  auth_error: AuthError | null;
}

export function useConnect() {
  const connect = useCallback(
    async (serverName: string, source: string): Promise<ConnectionResult> => {
      console.log(`[useConnect] connect called, source=${source}`);

      return await invoke<ConnectionResult>("connect_to_server", {
        serverName,
        source,
      });
    },
    [],
  );

  return { connect };
}
