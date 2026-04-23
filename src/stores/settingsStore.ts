import { create } from "zustand";
import { type AppSettings, type AuthMode, type FilterSettings, type RenderingPipeline, commands, type Theme } from "../bindings";
import { setLocale } from "../i18n";
import { unwrap } from "../lib/unwrap";

export interface StoredFilters {
  tags: Set<string>;
  show18Plus: boolean;
  showOffline: boolean | null;
  showHubStatus: boolean;
  regions: Set<string>;
  searchQuery: string;
}

interface SettingsStore {
  loaded: boolean;
  authMode: AuthMode;
  theme: Theme;
  devMode: boolean;
  notificationServers: Set<string>;
  ageVerified: boolean;
  locale: string | null;
  renderingPipeline: RenderingPipeline;
  lastPlayedServer: string | null;
  lastViewMode: string | null;
  favoriteServers: Set<string>;
  filters: StoredFilters;

  setAuthMode: (mode: AuthMode) => void;
  setTheme: (theme: Theme) => void;
  load: () => Promise<AppSettings | null>;
  saveAuthMode: (mode: AuthMode) => Promise<void>;
  saveTheme: (theme: Theme) => Promise<void>;
  saveAgeVerified: () => Promise<void>;
  saveLocale: (locale: string | null) => Promise<void>;
  saveRenderingPipeline: (pipeline: RenderingPipeline) => Promise<void>;
  toggleServerNotifications: (serverName: string, enabled: boolean) => Promise<void>;
  isServerNotificationsEnabled: (serverName: string) => boolean;
  saveLastPlayedServer: (serverId: string) => Promise<void>;
  saveLastViewMode: (mode: string) => Promise<void>;
  toggleFavoriteServer: (serverId: string, favorited: boolean) => Promise<void>;
  isServerFavorited: (serverId: string) => boolean;
  saveFilters: (filters: StoredFilters) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  loaded: false,
  authMode: "oidc",
  theme: "tgui",
  devMode: false,
  notificationServers: new Set<string>(),
  ageVerified: false,
  locale: null,
  renderingPipeline: "dxvk",
  lastPlayedServer: null,
  lastViewMode: null,
  favoriteServers: new Set<string>(),
  filters: {
    tags: new Set<string>(),
    show18Plus: false,
    showOffline: null,
    showHubStatus: false,
    regions: new Set<string>(),
    searchQuery: "",
  },

  setAuthMode: (authMode) => set({ authMode }),
  setTheme: (theme) => set({ theme }),

  load: async () => {
    try {
      const [settings, devMode] = await Promise.all([
        commands.getSettings().then(unwrap),
        commands.isDevMode(),
      ]);
      set({
        loaded: true,
        authMode: settings.auth_mode,
        theme: settings.theme ?? "tgui",
        devMode,
        notificationServers: new Set(settings.notification_servers ?? []),
        ageVerified: settings.age_verified ?? false,
        locale: settings.locale ?? null,
        renderingPipeline: settings.rendering_pipeline ?? "dxvk",
        lastPlayedServer: settings.last_played_server ?? null,
        lastViewMode: settings.last_view_mode ?? null,
        favoriteServers: new Set(settings.favorite_servers ?? []),
        filters: {
          tags: new Set(settings.filter_tags ?? []),
          show18Plus: settings.filter_show_18_plus ?? false,
          showOffline: settings.filter_show_offline ?? null,
          showHubStatus: settings.filter_show_hub_status ?? false,
          regions: new Set(settings.filter_regions ?? []),
          searchQuery: settings.search_query ?? "",
        },
      });
      if (settings.locale) {
        setLocale(settings.locale);
      }
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

  saveAgeVerified: async () => {
    unwrap(await commands.setAgeVerified());
    set({ ageVerified: true });
  },

  saveLocale: async (locale: string | null) => {
    unwrap(await commands.setLocale(locale));
    setLocale(locale);
    set({ locale });
  },

  saveRenderingPipeline: async (pipeline: RenderingPipeline) => {
    unwrap(await commands.setRenderingPipeline(pipeline));
    set({ renderingPipeline: pipeline });
  },

  toggleServerNotifications: async (serverName: string, enabled: boolean) => {
    const settings = unwrap(await commands.toggleServerNotifications(serverName, enabled));
    set({ notificationServers: new Set(settings.notification_servers ?? []) });
  },

  isServerNotificationsEnabled: (serverName: string) => {
    return get().notificationServers.has(serverName);
  },

  saveLastPlayedServer: async (serverId: string) => {
    const settings = unwrap(await commands.setLastPlayedServer(serverId));
    set({ lastPlayedServer: settings.last_played_server ?? null });
  },

  saveLastViewMode: async (mode: string) => {
    unwrap(await commands.setLastViewMode(mode));
    set({ lastViewMode: mode });
  },

  toggleFavoriteServer: async (serverId: string, favorited: boolean) => {
    const settings = unwrap(await commands.toggleFavoriteServer(serverId, favorited));
    set({ favoriteServers: new Set(settings.favorite_servers ?? []) });
  },

  isServerFavorited: (serverId: string) => {
    return get().favoriteServers.has(serverId);
  },

  saveFilters: async (filters: StoredFilters) => {
    set({ filters });
    const payload: FilterSettings = {
      tags: Array.from(filters.tags),
      show_18_plus: filters.show18Plus,
      show_offline: filters.showOffline,
      show_hub_status: filters.showHubStatus,
      regions: Array.from(filters.regions),
      search_query: filters.searchQuery || null,
    };
    unwrap(await commands.saveFilterSettings(payload));
  },
}));
