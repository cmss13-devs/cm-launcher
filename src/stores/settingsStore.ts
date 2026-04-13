import { create } from "zustand";
import { commands, type AppSettings, type AuthMode, type Theme } from "../bindings";

interface SettingsStore {
  authMode: AuthMode;
  theme: Theme;
  devMode: boolean;
  notificationServers: Set<string>;

  setAuthMode: (mode: AuthMode) => void;
  setTheme: (theme: Theme) => void;
  load: () => Promise<AppSettings | null>;
  saveAuthMode: (mode: AuthMode) => Promise<void>;
  saveTheme: (theme: Theme) => Promise<void>;
  toggleServerNotifications: (serverName: string, enabled: boolean) => Promise<void>;
  isServerNotificationsEnabled: (serverName: string) => boolean;
}

function unwrap<T>(result: { status: "ok"; data: T } | { status: "error"; error: string }): T {
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  authMode: "oidc",
  theme: "tgui",
  devMode: false,
  notificationServers: new Set<string>(),

  setAuthMode: (authMode) => set({ authMode }),
  setTheme: (theme) => set({ theme }),

  load: async () => {
    try {
      const [settings, devMode] = await Promise.all([
        commands.getSettings().then(unwrap),
        commands.isDevMode(),
      ]);
      set({
        authMode: settings.auth_mode,
        theme: settings.theme ?? "tgui",
        devMode,
        notificationServers: new Set(settings.notification_servers ?? []),
      });
      return settings;
    } catch (err) {
      console.error("Failed to load settings:", err);
      return null;
    }
  },

  saveAuthMode: async (mode: AuthMode) => {
    unwrap(await commands.setAuthMode(mode));
    set({ authMode: mode });
  },

  saveTheme: async (theme: Theme) => {
    unwrap(await commands.setTheme(theme));
    set({ theme });
  },

  toggleServerNotifications: async (serverName: string, enabled: boolean) => {
    const settings = unwrap(await commands.toggleServerNotifications(serverName, enabled));
    set({ notificationServers: new Set(settings.notification_servers ?? []) });
  },

  isServerNotificationsEnabled: (serverName: string) => {
    return get().notificationServers.has(serverName);
  },
}));
