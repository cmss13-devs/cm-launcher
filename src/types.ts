export interface UserInfo {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
}

export interface AuthState {
  logged_in: boolean;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
}

export type AuthMode = "cm_ss13" | "byond" | "steam";

export interface SteamUserInfo {
  steam_id: string;
  display_name: string;
}

export interface SteamAuthResult {
  success: boolean;
  user_exists: boolean;
  access_token: string | null;
  requires_linking: boolean;
  linking_url: string | null;
  error: string | null;
}

export interface SteamLaunchOptions {
  raw: string;
  server_name: string | null;
}

export interface SteamAuthState {
  available: boolean;
  user: SteamUserInfo | null;
  access_token: string | null;
  loading: boolean;
  error: string | null;
}

export interface AppSettings {
  auth_mode: AuthMode;
}

export interface ErrorNotification {
  id: number;
  message: string;
}

export interface Relay {
  id: string;
  name: string;
  host: string;
}

export interface RelayWithPing extends Relay {
  ping: number | null;
  checking: boolean;
}

export interface ServerData {
  round_id: number;
  mode: string;
  map_name: string;
  round_duration: number;
  gamestate: number;
  players: number;
}

export interface Server {
  name: string;
  url: string;
  status: string;
  data?: ServerData;
  recommended_byond_version?: string;
}

export interface WineStatus {
  installed: boolean;
  version: string | null;
  meets_minimum_version: boolean;
  winetricks_installed: boolean;
  prefix_initialized: boolean;
  webview2_installed: boolean;
  error: string | null;
}

export type WineSetupStage =
  | "checking"
  | "creating_prefix"
  | "installing_vcrun2022"
  | "installing_dxtrans"
  | "installing_corefonts"
  | "installing_dxvk"
  | "setting_registry"
  | "downloading_webview2"
  | "installing_webview2"
  | "complete"
  | "error";

export interface WineSetupProgress {
  stage: WineSetupStage;
  progress: number;
  message: string;
}

export type Platform = "windows" | "linux" | "macos" | "unknown";
