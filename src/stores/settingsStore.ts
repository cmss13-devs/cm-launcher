import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { AppSettings, AuthMode } from "../types";

interface SettingsStore {
  authMode: AuthMode;

  setAuthMode: (mode: AuthMode) => void;
  load: () => Promise<AppSettings | null>;
  save: (mode: AuthMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  authMode: "cm_ss13",

  setAuthMode: (authMode) => set({ authMode }),

  load: async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      return settings;
    } catch (err) {
      console.error("Failed to load settings:", err);
      return null;
    }
  },

  save: async (mode: AuthMode) => {
    await invoke<AppSettings>("set_auth_mode", { mode });
    set({ authMode: mode });
  },
}));
