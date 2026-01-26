import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { SteamAuthModalState } from "../components/SteamAuthModal";
import type { SteamAuthResult, SteamAuthState, SteamUserInfo } from "../types";

const initialSteamAuthState: SteamAuthState = {
  available: false,
  user: null,
  access_token: null,
  loading: false,
  error: null,
};

export function useSteamAuth() {
  const [steamAuthState, setSteamAuthState] = useState<SteamAuthState>(
    initialSteamAuthState,
  );
  const [showSteamAuthModal, setShowSteamAuthModal] = useState(false);
  const [steamAuthModalState, setSteamAuthModalState] =
    useState<SteamAuthModalState>("idle");
  const [steamAuthError, setSteamAuthError] = useState<string | undefined>();
  const [steamLinkingUrl, setSteamLinkingUrl] = useState<string | undefined>();

  const initializeSteam = useCallback(async () => {
    try {
      const steamUser = await invoke<SteamUserInfo>("get_steam_user_info");
      setSteamAuthState((prev) => ({
        ...prev,
        available: true,
        user: steamUser,
      }));
      return true;
    } catch {
      setSteamAuthState((prev) => ({
        ...prev,
        available: false,
      }));
      return false;
    }
  }, []);

  const handleSteamAuthenticate = useCallback(
    async (createAccountIfMissing: boolean) => {
      setSteamAuthModalState("loading");
      setSteamAuthError(undefined);
      setSteamLinkingUrl(undefined);

      try {
        const result = await invoke<SteamAuthResult>("steam_authenticate", {
          createAccountIfMissing,
        });

        if (result.success && result.access_token) {
          setSteamAuthState((prev) => ({
            ...prev,
            access_token: result.access_token,
            error: null,
          }));
          setShowSteamAuthModal(false);
          setSteamAuthModalState("idle");
          return result;
        }
        if (result.requires_linking) {
          setSteamAuthModalState("linking");
          setSteamLinkingUrl(result.linking_url || undefined);
          return result;
        }
        setSteamAuthModalState("error");
        setSteamAuthError(result.error || "Authentication failed");
        return result;
      } catch (err) {
        setSteamAuthModalState("error");
        setSteamAuthError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [],
  );

  const onSteamAuthRequired = useCallback(
    (serverName?: string) => {
      setShowSteamAuthModal(true);
      handleSteamAuthenticate(false);
      return serverName;
    },
    [handleSteamAuthenticate],
  );

  const onSteamAuthModalClose = useCallback(async () => {
    setShowSteamAuthModal(false);
    setSteamAuthModalState("idle");

    try {
      await invoke("cancel_steam_auth_ticket");
    } catch {
      // Ignore errors when canceling
    }
  }, []);

  const handleSteamLogout = useCallback(() => {
    setSteamAuthState((prev) => ({
      ...prev,
      access_token: null,
    }));
  }, []);

  return {
    steamAuthState,
    setSteamAuthState,
    showSteamAuthModal,
    setShowSteamAuthModal,
    steamAuthModalState,
    steamAuthError,
    steamLinkingUrl,
    initializeSteam,
    handleSteamAuthenticate,
    onSteamAuthRequired,
    onSteamAuthModalClose,
    handleSteamLogout,
  };
}
