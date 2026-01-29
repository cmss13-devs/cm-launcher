import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { AppSettings, AuthMode, Theme } from "../types";

interface SettingsStore {
  authMode: AuthMode;
  theme: Theme;

  setAuthMode: (mode: AuthMode) => void;
  setTheme: (theme: Theme) => void;
  load: () => Promise<AppSettings | null>;
  saveAuthMode: (mode: AuthMode) => Promise<void>;
  saveTheme: (theme: Theme) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  authMode: "cm_ss13",
  theme: "default",

  setAuthMode: (authMode) => set({ authMode }),
  setTheme: (theme) => set({ theme }),

  load: async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      set({ authMode: settings.auth_mode, theme: settings.theme });
      return settings;
    } catch (err) {
      console.error("Failed to load settings:", err);
      return null;
    }
  },

  saveAuthMode: async (mode: AuthMode) => {
    await invoke<AppSettings>("set_auth_mode", { mode });
    set({ authMode: mode });
  },

  saveTheme: async (theme: Theme) => {
    await invoke<AppSettings>("set_theme", { theme });
    set({ theme });
  },
}));
