import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface UserInfo {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
}

interface AuthState {
  logged_in: boolean;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
}

type AuthMode = "cm_ss13" | "byond" | "steam";

interface SteamUserInfo {
  steam_id: string;
  display_name: string;
}

interface SteamAuthResult {
  success: boolean;
  user_exists: boolean;
  access_token: string | null;
  requires_linking: boolean;
  linking_url: string | null;
  error: string | null;
}

interface SteamLaunchOptions {
  raw: string;
  server_name: string | null;
}

interface SteamAuthState {
  available: boolean;
  user: SteamUserInfo | null;
  access_token: string | null;
  loading: boolean;
  error: string | null;
}

interface AppSettings {
  auth_mode: AuthMode;
}

interface ErrorNotification {
  id: number;
  message: string;
}

interface ErrorContextType {
  showError: (message: string) => void;
}

const ErrorContext = createContext<ErrorContextType | null>(null);

function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useError must be used within ErrorProvider");
  }
  return context;
}

function ErrorNotifications({
  errors,
  onDismiss,
}: {
  errors: ErrorNotification[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="error-notifications">
      {errors.map((error) => (
        <div key={error.id} className="error-popup">
          <div className="error-popup-message">{error.message}</div>
          <button
            type="button"
            className="error-popup-dismiss"
            onClick={() => onDismiss(error.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

interface AuthModalProps {
  visible: boolean;
  state: "idle" | "loading" | "error";
  error?: string;
  onLogin: () => void;
  onClose: () => void;
}

function AuthModal({
  visible,
  state,
  error,
  onLogin,
  onClose,
}: AuthModalProps) {
  if (!visible) return null;

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <button type="button" className="modal-close-button" onClick={onClose}>
          x
        </button>
        {state === "idle" && (
          <>
            <h2>Authentication Required</h2>
            <p>Please log in with your CM-SS13 account to continue.</p>
            <button type="button" className="button" onClick={onLogin}>
              Login
            </button>
          </>
        )}
        {state === "loading" && (
          <>
            <h2>Authenticating...</h2>
            <p>Please complete login in your browser.</p>
            <div className="auth-spinner" />
          </>
        )}
        {state === "error" && (
          <>
            <h2>Authentication Failed</h2>
            <p className="auth-error-message">{error}</p>
            <button type="button" className="button" onClick={onLogin}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface SteamAuthModalProps {
  visible: boolean;
  state: "idle" | "loading" | "linking" | "error";
  error?: string;
  linkingUrl?: string;
  onAuthenticate: (createAccount: boolean) => void;
  onClose: () => void;
}

function SteamAuthModal({
  visible,
  state,
  error,
  linkingUrl,
  onAuthenticate,
  onClose,
}: SteamAuthModalProps) {
  if (!visible) return null;

  const openLinkingUrl = async () => {
    if (linkingUrl) {
      await openUrl(linkingUrl);
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <button type="button" className="modal-close-button" onClick={onClose}>
          x
        </button>
        {state === "idle" && (
          <>
            <h2>Steam Authentication</h2>
            <p>Authenticating with Steam...</p>
            <div className="auth-spinner" />
          </>
        )}
        {state === "loading" && (
          <>
            <h2>Authenticating...</h2>
            <p>Validating your Steam account...</p>
            <div className="auth-spinner" />
          </>
        )}
        {state === "linking" && (
          <>
            <h2>Account Linking</h2>
            <p>No CM-SS13 account is linked to your Steam account.</p>
            <p>Do you have an existing CM-SS13 account?</p>
            <div className="auth-modal-buttons">
              <button type="button" className="button" onClick={openLinkingUrl}>
                Yes, link my account
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onAuthenticate(true)}
              >
                No, start now
              </button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <h2>Authentication Failed</h2>
            <p className="auth-error-message">{error}</p>
            <button
              type="button"
              className="button"
              onClick={() => onAuthenticate(false)}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface SettingsModalProps {
  visible: boolean;
  authMode: AuthMode;
  steamAvailable: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

function SettingsModal({
  visible,
  authMode,
  steamAvailable,
  onAuthModeChange,
  onClose,
}: SettingsModalProps) {
  if (!visible) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <div className="settings-modal-content">
          <div className="settings-section">
            <h3>Authentication Mode</h3>
            <p className="settings-description">
              Choose how you want to authenticate when connecting to servers.
            </p>
            <div className="auth-mode-options">
              <label
                className={`auth-mode-option ${authMode === "cm_ss13" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="authMode"
                  value="cm_ss13"
                  checked={authMode === "cm_ss13"}
                  onChange={() => onAuthModeChange("cm_ss13")}
                />
                <div className="auth-mode-info">
                  <span className="auth-mode-name">CM-SS13 Authentication</span>
                  <span className="auth-mode-desc">
                    Login with your CM-SS13 account for server access
                  </span>
                </div>
              </label>
              {steamAvailable && (
                <label
                  className={`auth-mode-option ${authMode === "steam" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="authMode"
                    value="steam"
                    checked={authMode === "steam"}
                    onChange={() => onAuthModeChange("steam")}
                  />
                  <div className="auth-mode-info">
                    <span className="auth-mode-name">Steam Authentication</span>
                    <span className="auth-mode-desc">
                      Login with your Steam account
                    </span>
                  </div>
                </label>
              )}
              <label
                className={`auth-mode-option ${authMode === "byond" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="authMode"
                  value="byond"
                  checked={authMode === "byond"}
                  onChange={() => onAuthModeChange("byond")}
                />
                <div className="auth-mode-info">
                  <span className="auth-mode-name">BYOND Authentication</span>
                  <span className="auth-mode-desc">
                    Use BYOND's built-in authentication (no login required)
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GAME_STATES: Record<number, string> = {
  0: "Starting",
  1: "Lobby",
  2: "Setting Up",
  3: "Playing",
  4: "Finished",
};

interface Relay {
  id: string;
  name: string;
  host: string;
}

interface RelayWithPing extends Relay {
  ping: number | null;
  checking: boolean;
}

interface ServerData {
  round_id: number;
  mode: string;
  map_name: string;
  round_duration: number;
  gamestate: number;
  players: number;
}

interface Server {
  name: string;
  url: string;
  status: string;
  data?: ServerData;
  recommended_byond_version?: string;
}

const RELAYS: Relay[] = [
  { id: "direct", name: "Direct", host: "direct.cm-ss13.com" },
  { id: "nyc", name: "NYC", host: "nyc.cm-ss13.com" },
  { id: "uk", name: "UK", host: "uk.cm-ss13.com" },
  { id: "eu-e", name: "EU East", host: "eu-e.cm-ss13.com" },
  { id: "eu-w", name: "EU West", host: "eu-w.cm-ss13.com" },
  { id: "aus", name: "Australia", host: "aus.cm-ss13.com" },
  { id: "us-e", name: "US East", host: "us-e.cm-ss13.com" },
  { id: "us-w", name: "US West", host: "us-w.cm-ss13.com" },
  { id: "asia-se", name: "SE Asia", host: "asia-se.cm-ss13.com" },
];

const PING_PORT = 4000;
const PING_COUNT = 10;

function pingRelay(host: string): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`wss://${host}:${PING_PORT}`);
    const pingsSent: Record<string, number> = {};
    const pingTimes: number[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.close();
        resolve(null);
      }
    }, 5000);

    socket.addEventListener("message", (event) => {
      pingTimes.push(Date.now() - pingsSent[event.data]);
      ping(Number(event.data) + 1);
    });

    socket.addEventListener("open", () => {
      ping(1);
    });

    socket.addEventListener("error", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        resolve(null);
      }
    });

    const ping = (iter: number) => {
      if (iter > PING_COUNT) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          socket.close();
          const avgPing = Math.round(
            pingTimes.reduce((a, b) => a + b) / pingTimes.length,
          );
          resolve(avgPing);
        }
      } else {
        pingsSent[String(iter)] = Date.now();
        socket.send(String(iter));
      }
    };
  });
}

function formatDuration(deciseconds: number | undefined): string {
  if (!deciseconds) return "--:--:--";
  const totalSeconds = Math.floor(deciseconds / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

interface ServerItemProps {
  server: Server;
  selectedRelay: string;
  relays: RelayWithPing[];
  isLoggedIn: boolean;
  authMode: AuthMode;
  steamAccessToken: string | null;
  onLoginRequired: (serverName?: string) => void;
  onSteamAuthRequired: (serverName?: string) => void;
}

function ServerItem({
  server,
  selectedRelay,
  relays,
  isLoggedIn,
  authMode,
  steamAccessToken,
  onLoginRequired,
  onSteamAuthRequired,
}: ServerItemProps) {
  const [connecting, setConnecting] = useState(false);
  const { showError } = useError();

  const relay = relays.find((r) => r.id === selectedRelay);
  const port = server.url.split(":")[1];

  const isOnline = server.status === "available";
  const data = server.data;
  const byondVersion = server.recommended_byond_version;

  const handleConnect = async () => {
    if (authMode === "cm_ss13" && !isLoggedIn) {
      onLoginRequired(server.name);
      return;
    }

    if (authMode === "steam" && !steamAccessToken) {
      onSteamAuthRequired(server.name);
      return;
    }

    if (!relay || !byondVersion || !port) return;

    setConnecting(true);

    try {
      let accessToken: string | null = null;
      if (authMode === "cm_ss13") {
        accessToken = await invoke<string | null>("get_access_token");
      } else if (authMode === "steam") {
        accessToken = steamAccessToken;
      }

      await invoke("connect_to_server", {
        version: byondVersion,
        host: relay.host,
        port: port,
        accessType: authMode,
        accessToken: accessToken,
        serverName: server.name,
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const canConnect = isOnline && relay && byondVersion && port;

  return (
    <div className="server-item">
      <div className="server-info">
        <div className="server-name">{server.name}</div>
        {isOnline && data ? (
          <div className="server-details">
            <span>Round #{data.round_id}</span>
            <span>{data.mode}</span>
            <span>{data.map_name}</span>
            <span>{formatDuration(data.round_duration)}</span>
            <span>{GAME_STATES[data.gamestate] || "Unknown"}</span>
          </div>
        ) : (
          <div className="server-details">
            <span>Server unavailable</span>
          </div>
        )}
      </div>
      <div className="server-status">
        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} />
        <div className="player-count">
          {isOnline && data ? data.players : "--"}
        </div>
        {canConnect ? (
          <button
            type="button"
            className="button"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <button type="button" className="button" disabled>
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function Titlebar() {
  const handleMinimize = async () => {
    const window = getCurrentWindow();
    await window.minimize();
  };

  const handleClose = async () => {
    const window = getCurrentWindow();
    await window.close();
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-title">CM-SS13 Launcher</div>
      <div className="titlebar-buttons">
        <button
          type="button"
          className="titlebar-button"
          onClick={handleMinimize}
        >
          <span className="titlebar-icon">−</span>
        </button>
        <button
          type="button"
          className="titlebar-button titlebar-close"
          onClick={handleClose}
        >
          <span className="titlebar-icon">×</span>
        </button>
      </div>
    </div>
  );
}

function App() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relays, setRelays] = useState<RelayWithPing[]>(
    RELAYS.map((r) => ({ ...r, ping: null, checking: true })),
  );
  const [selectedRelay, setSelectedRelay] = useState("direct");
  const [relayDropdownOpen, setRelayDropdownOpen] = useState(false);
  const [errors, setErrors] = useState<ErrorNotification[]>([]);
  const [errorIdCounter, setErrorIdCounter] = useState(0);

  const [authState, setAuthState] = useState<AuthState>({
    logged_in: false,
    user: null,
    loading: true,
    error: null,
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalState, setAuthModalState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [authError, setAuthError] = useState<string | undefined>();

  const [authMode, setAuthMode] = useState<AuthMode>("cm_ss13");
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Steam auth state
  const [steamAuthState, setSteamAuthState] = useState<SteamAuthState>({
    available: false,
    user: null,
    access_token: null,
    loading: false,
    error: null,
  });
  const [showSteamAuthModal, setShowSteamAuthModal] = useState(false);
  const [steamAuthModalState, setSteamAuthModalState] = useState<
    "idle" | "loading" | "linking" | "error"
  >("idle");
  const [steamAuthError, setSteamAuthError] = useState<string | undefined>();
  const [steamLinkingUrl, setSteamLinkingUrl] = useState<string | undefined>();

  const [pendingAutoConnect, setPendingAutoConnect] = useState<string | null>(
    null,
  );
  const [autoConnecting, setAutoConnecting] = useState(false);

  const showError = useCallback(
    (message: string) => {
      const id = errorIdCounter;
      setErrorIdCounter((prev) => prev + 1);
      setErrors((prev) => [...prev, { id, message }]);
    },
    [errorIdCounter],
  );

  const dismissError = useCallback((id: number) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleLogin = useCallback(async () => {
    setAuthModalState("loading");
    setAuthError(undefined);
    try {
      const state = await invoke<AuthState>("start_login");
      setAuthState(state);
      if (state.logged_in) {
        setShowAuthModal(false);
        setAuthModalState("idle");
      }
    } catch (err) {
      setAuthModalState("error");
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const state = await invoke<AuthState>("logout");
      setAuthState(state);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [showError]);

  useEffect(() => {
    const loadInitialState = async () => {
      let settings: AppSettings | null = null;
      let steamAvailable = false;
      try {
        settings = await invoke<AppSettings>("get_settings");
      } catch (err) {
        console.error("Failed to load settings:", err);
      }

      try {
        const steamUser = await invoke<SteamUserInfo>("get_steam_user_info");
        setSteamAuthState((prev) => ({
          ...prev,
          available: true,
          user: steamUser,
        }));
        steamAvailable = true;
      } catch {
        setSteamAuthState((prev) => ({
          ...prev,
          available: false,
        }));
      }

      if (settings?.auth_mode) {
        setAuthMode(settings.auth_mode);
      } else if (steamAvailable) {
        setAuthMode("steam");
      } else {
        setAuthMode("cm_ss13");
      }

      // Check for Steam launch options (e.g., when joining via Steam friend)
      if (steamAvailable) {
        try {
          const launchOptions = await invoke<SteamLaunchOptions>(
            "get_steam_launch_options",
          );
          if (launchOptions.server_name) {
            console.log(
              "Steam launch options detected, will auto-connect to:",
              launchOptions.server_name,
            );
            setPendingAutoConnect(launchOptions.server_name);
          }
        } catch (err) {
          console.error("Failed to get Steam launch options:", err);
        }
      }

      try {
        const state = await invoke<AuthState>("get_auth_state");
        setAuthState(state);
      } catch (err) {
        setAuthState({
          logged_in: false,
          user: null,
          loading: false,
          error: String(err),
        });
      }
    };
    loadInitialState();

    const unlisten = listen<AuthState>("auth-state-changed", (event) => {
      setAuthState(event.payload);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const checkAllRelays = async () => {
      const results = await Promise.all(
        RELAYS.map(async (relay) => {
          const ping = await pingRelay(relay.host);
          return { ...relay, ping, checking: false };
        }),
      );
      results.sort((a, b) => {
        if (a.ping === null && b.ping === null) return 0;
        if (a.ping === null) return 1;
        if (b.ping === null) return -1;
        return a.ping - b.ping;
      });
      setRelays(results);
      const bestRelay = results.find((r) => r.ping !== null);
      if (bestRelay) {
        setSelectedRelay(bestRelay.id);
      }
    };
    checkAllRelays();
  }, []);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setLoading(true);
        const response = await fetch("https://db.cm-ss13.com/api/Round");
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        setServers(data.servers || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const performAutoConnect = async () => {
      if (!pendingAutoConnect || autoConnecting) return;

      if (servers.length === 0 || loading) return;

      const readyRelay = relays.find((r) => !r.checking && r.ping !== null);
      if (!readyRelay) return;

      const server = servers.find(
        (s) => s.name.toLowerCase() === pendingAutoConnect.toLowerCase(),
      );

      if (!server) {
        console.error(
          `Auto-connect: Server "${pendingAutoConnect}" not found in server list`,
        );
        showError(`Server "${pendingAutoConnect}" not found`);
        setPendingAutoConnect(null);
        return;
      }

      if (server.status !== "available") {
        console.error(
          `Auto-connect: Server "${pendingAutoConnect}" is not available`,
        );
        showError(`Server "${pendingAutoConnect}" is currently unavailable`);
        setPendingAutoConnect(null);
        return;
      }

      const port = server.url.split(":")[1];
      const byondVersion = server.recommended_byond_version;

      if (!port || !byondVersion) {
        console.error("Auto-connect: Missing port or BYOND version");
        showError("Cannot auto-connect: missing server configuration");
        setPendingAutoConnect(null);
        return;
      }

      console.log(
        `Auto-connecting to ${server.name} via ${readyRelay.name}...`,
      );
      setAutoConnecting(true);
      setPendingAutoConnect(null);

      try {
        if (authMode === "steam" && !steamAuthState.access_token) {
          const result = await invoke<SteamAuthResult>("steam_authenticate", {
            createAccountIfMissing: false,
          });

          if (!result.success || !result.access_token) {
            if (result.requires_linking) {
              // Show the Steam auth modal for linking
              setShowSteamAuthModal(true);
              setSteamAuthModalState("linking");
              setSteamLinkingUrl(result.linking_url || undefined);
              setAutoConnecting(false);
              return;
            }
            throw new Error(result.error || "Steam authentication failed");
          }

          setSteamAuthState((prev) => ({
            ...prev,
            access_token: result.access_token,
          }));

          await invoke("connect_to_server", {
            version: byondVersion,
            host: readyRelay.host,
            port: port,
            accessType: "steam",
            accessToken: result.access_token,
            serverName: server.name,
          });
        } else if (authMode === "cm_ss13") {
          if (!authState.logged_in) {
            setShowAuthModal(true);
            setAuthModalState("idle");
            setAutoConnecting(false);
            return;
          }

          const accessToken = await invoke<string | null>("get_access_token");
          await invoke("connect_to_server", {
            version: byondVersion,
            host: readyRelay.host,
            port: port,
            accessType: "cm_ss13",
            accessToken: accessToken,
            serverName: server.name,
          });
        } else {
          await invoke("connect_to_server", {
            version: byondVersion,
            host: readyRelay.host,
            port: port,
            accessType: "byond",
            accessToken: null,
            serverName: server.name,
          });
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      } finally {
        setAutoConnecting(false);
      }
    };

    performAutoConnect();
  }, [
    pendingAutoConnect,
    autoConnecting,
    servers,
    loading,
    relays,
    authMode,
    steamAuthState.access_token,
    authState.logged_in,
    showError,
  ]);

  const onLoginRequired = useCallback((serverName?: string) => {
    if (serverName) {
      setPendingAutoConnect(serverName);
    }
    setShowAuthModal(true);
    setAuthModalState("idle");
  }, []);

  const onAuthModalClose = useCallback(() => {
    setShowAuthModal(false);
    setAuthModalState("idle");

    setPendingAutoConnect(null);
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

        console.log(result);

        if (result.success && result.access_token) {
          setSteamAuthState((prev) => ({
            ...prev,
            access_token: result.access_token,
            error: null,
          }));
          setShowSteamAuthModal(false);
          setSteamAuthModalState("idle");
        } else if (result.requires_linking) {
          setSteamAuthModalState("linking");
          setSteamLinkingUrl(result.linking_url || undefined);
        } else {
          setSteamAuthModalState("error");
          setSteamAuthError(result.error || "Authentication failed");
        }
      } catch (err) {
        setSteamAuthModalState("error");
        setSteamAuthError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const onSteamAuthRequired = useCallback(
    (serverName?: string) => {
      if (serverName) {
        setPendingAutoConnect(serverName);
      }
      setShowSteamAuthModal(true);
      handleSteamAuthenticate(false);
    },
    [handleSteamAuthenticate],
  );

  const onSteamAuthModalClose = useCallback(async () => {
    setShowSteamAuthModal(false);
    setSteamAuthModalState("idle");

    setPendingAutoConnect(null);
    try {
      await invoke("cancel_steam_auth_ticket");
    } catch {
      // Ignore errors when canceling
    }
  }, []);

  const handleAuthModeChange = useCallback(
    async (mode: AuthMode) => {
      try {
        await invoke<AppSettings>("set_auth_mode", { mode });
        setAuthMode(mode);
        setShowSettingsModal(false);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    },
    [showError],
  );

  return (
    <ErrorContext.Provider value={{ showError }}>
      <div className="crt-frame">
        <div className="crt-bezel" />
        <div className="crt" />
        <ErrorNotifications errors={errors} onDismiss={dismissError} />
        <AuthModal
          visible={showAuthModal}
          state={authModalState}
          error={authError}
          onLogin={handleLogin}
          onClose={onAuthModalClose}
        />
        <SteamAuthModal
          visible={showSteamAuthModal}
          state={steamAuthModalState}
          error={steamAuthError}
          linkingUrl={steamLinkingUrl}
          onAuthenticate={handleSteamAuthenticate}
          onClose={onSteamAuthModalClose}
        />
        <SettingsModal
          visible={showSettingsModal}
          authMode={authMode}
          steamAvailable={steamAuthState.available}
          onAuthModeChange={handleAuthModeChange}
          onClose={() => setShowSettingsModal(false)}
        />

        <div className="launcher">
          <Titlebar />

          <main className="main-content">
            <section className="section servers-section">
              <div className="server-list">
                {loading && servers.length === 0 && (
                  <div className="server-loading">Loading servers...</div>
                )}
                {error && <div className="server-error">Error: {error}</div>}
                {servers.map((server, index) => (
                  <ServerItem
                    key={server.name || index}
                    server={server}
                    selectedRelay={selectedRelay}
                    relays={relays}
                    isLoggedIn={authState.logged_in}
                    authMode={authMode}
                    steamAccessToken={steamAuthState.access_token}
                    onLoginRequired={onLoginRequired}
                    onSteamAuthRequired={onSteamAuthRequired}
                  />
                ))}
              </div>
            </section>
          </main>

          <footer className="section footer">
            <div className="account-info">
              {authMode === "byond" ? (
                <>
                  <div className="account-avatar">B</div>
                  <div className="account-details">
                    <div className="account-name">BYOND Authentication</div>
                    <div className="account-status">
                      Using BYOND's built-in auth
                    </div>
                  </div>
                </>
              ) : authMode === "steam" ? (
                steamAuthState.access_token ? (
                  <>
                    <div className="account-avatar">S</div>
                    <div className="account-details">
                      <div className="account-name">
                        {steamAuthState.user?.display_name || "Steam User"}
                      </div>
                      <div className="account-status">Logged in via Steam</div>
                    </div>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        setSteamAuthState((prev) => ({
                          ...prev,
                          access_token: null,
                        }))
                      }
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div className="account-avatar">S</div>
                    <div className="account-details">
                      <div className="account-name">
                        {steamAuthState.user?.display_name || "Steam"}
                      </div>
                      <div className="account-status">
                        Click connect to authenticate
                      </div>
                    </div>
                  </>
                )
              ) : authState.logged_in && authState.user ? (
                <>
                  <div className="account-avatar">
                    {(
                      authState.user.name ||
                      authState.user.preferred_username ||
                      "?"
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="account-details">
                    <div className="account-name">
                      {authState.user.name ||
                        authState.user.preferred_username ||
                        "User"}
                    </div>
                    <div className="account-status">
                      {authState.user.email || "Logged in"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <div className="account-avatar">?</div>
                  <div className="account-details">
                    <div className="account-name">Not logged in</div>
                    <div className="account-status">
                      {authState.loading
                        ? "Checking..."
                        : "Click to authenticate"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button"
                    onClick={handleLogin}
                  >
                    Login
                  </button>
                </>
              )}
            </div>
            <div className="footer-actions">
              <div className="relay-dropdown">
                <button
                  type="button"
                  className="relay-dropdown-button"
                  onClick={() => setRelayDropdownOpen(!relayDropdownOpen)}
                >
                  <span className="relay-dropdown-label">Relay:</span>
                  <span className="relay-dropdown-value">
                    {relays.find((r) => r.id === selectedRelay)?.name ||
                      "Select"}
                  </span>
                  <span className="relay-dropdown-arrow">
                    {relayDropdownOpen ? "▲" : "▼"}
                  </span>
                </button>
                {relayDropdownOpen && (
                  <div className="relay-dropdown-menu">
                    {relays.map((relay) => (
                      <label
                        key={relay.id}
                        className={`relay-option ${selectedRelay === relay.id ? "selected" : ""} ${relay.ping === null && !relay.checking ? "disabled" : ""}`}
                      >
                        <input
                          type="radio"
                          name="relay"
                          value={relay.id}
                          checked={selectedRelay === relay.id}
                          onChange={() => {
                            setSelectedRelay(relay.id);
                            setRelayDropdownOpen(false);
                          }}
                          disabled={relay.ping === null && !relay.checking}
                        />
                        <span className="relay-name">{relay.name}</span>
                        <span className="relay-ping">
                          {relay.checking
                            ? "..."
                            : relay.ping !== null
                              ? `${relay.ping}ms`
                              : "N/A"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="button-secondary settings-button"
                onClick={() => setShowSettingsModal(true)}
                title="Settings"
              >
                Settings
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ErrorContext.Provider>
  );
}

export default App;
