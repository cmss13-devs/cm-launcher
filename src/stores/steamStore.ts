import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { SteamAuthResult, SteamUserInfo } from "../types";

interface SteamStore {
  available: boolean;
  user: SteamUserInfo | null;
  accessToken: string | null;

  setAccessToken: (token: string | null) => void;
  initialize: () => Promise<boolean>;
  authenticate: (createAccountIfMissing: boolean) => Promise<SteamAuthResult | null>;
  logout: () => void;
  cancelAuthTicket: () => Promise<void>;
}

export const useSteamStore = create<SteamStore>()((set) => ({
  available: false,
  user: null,
  accessToken: null,

  setAccessToken: (accessToken) => set({ accessToken }),

  initialize: async () => {
    try {
      const user = await invoke<SteamUserInfo>("get_steam_user_info");
      set({ available: true, user });
      return true;
    } catch {
      set({ available: false });
      return false;
    }
  },

  authenticate: async (createAccountIfMissing: boolean) => {
    try {
      const result = await invoke<SteamAuthResult>("steam_authenticate", {
        createAccountIfMissing,
      });

      if (result.success && result.access_token) {
        set({ accessToken: result.access_token });
      }

      return result;
    } catch (err) {
      return {
        success: false,
        user_exists: false,
        access_token: null,
        requires_linking: false,
        linking_url: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  logout: () => {
    set({ accessToken: null });
  },

  cancelAuthTicket: async () => {
    try {
      await invoke("cancel_steam_auth_ticket");
    } catch {
      // Ignore errors when canceling
    }
  },
}));
