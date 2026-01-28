import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import "./App.css";

import {
  AccountInfo,
  AuthModal,
  ErrorNotifications,
  GameConnectionModal,
  RelayDropdown,
  ServerItem,
  SettingsModal,
  SteamAuthModal,
  Titlebar,
} from "./components";
import type { AuthModalState } from "./components/AuthModal";
import type { SteamAuthModalState } from "./components/SteamAuthModal";
import {
  ErrorProvider,
  useConnect,
  useError,
  useGameConnection,
} from "./hooks";
import {
  useAuthStore,
  useServerStore,
  useSettingsStore,
  useSteamStore,
} from "./stores";
import type { SteamLaunchOptions } from "./types";

function AppContent() {
  const { errors, dismissError, showError } = useError();

  const {
    authState,
    login,
    logout,
    initListener: initAuthListener,
  } = useAuthStore(
    useShallow((s) => ({
      authState: s.authState,
      login: s.login,
      logout: s.logout,
      initListener: s.initListener,
    })),
  );

  const {
    available: steamAvailable,
    accessToken: steamAccessToken,
    initialize: initializeSteam,
    authenticate: authenticateSteam,
    logout: steamLogout,
    cancelAuthTicket: cancelSteamAuthTicket,
  } = useSteamStore(
    useShallow((s) => ({
      available: s.available,
      accessToken: s.accessToken,
      initialize: s.initialize,
      authenticate: s.authenticate,
      logout: s.logout,
      cancelAuthTicket: s.cancelAuthTicket,
    })),
  );

  const {
    servers,
    loading: serversLoading,
    error: serversError,
    relays,
    selectedRelay,
    setSelectedRelay,
    startFetching,
    initRelays,
  } = useServerStore(
    useShallow((s) => ({
      servers: s.servers,
      loading: s.loading,
      error: s.error,
      relays: s.relays,
      selectedRelay: s.selectedRelay,
      setSelectedRelay: s.setSelectedRelay,
      startFetching: s.startFetching,
      initRelays: s.initRelays,
    })),
  );

  const {
    authMode,
    setAuthMode,
    load: loadSettings,
    save: saveSettings,
  } = useSettingsStore(
    useShallow((s) => ({
      authMode: s.authMode,
      setAuthMode: s.setAuthMode,
      load: s.load,
      save: s.save,
    })),
  );

  // Local modal state
  const [authModal, setAuthModal] = useState<{
    visible: boolean;
    state: AuthModalState;
    error?: string;
  }>({ visible: false, state: "idle", error: undefined });

  const [steamModal, setSteamModal] = useState<{
    visible: boolean;
    state: SteamAuthModalState;
    error?: string;
    linkingUrl?: string;
  }>({
    visible: false,
    state: "idle",
    error: undefined,
    linkingUrl: undefined,
  });

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [relayDropdownOpen, setRelayDropdownOpen] = useState(false);

  const {
    gameConnectionState,
    connectedServerName,
    closeGameConnectionModal,
    showGameConnectionModal,
  } = useGameConnection();

  const { connect } = useConnect();

  const [pendingAutoConnect, setPendingAutoConnect] = useState<string | null>(
    null,
  );
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Initialize stores on mount
  useEffect(() => {
    const unlistenPromise = initAuthListener();
    initRelays();
    const cleanupServers = startFetching();

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      cleanupServers();
    };
  }, [initAuthListener, initRelays, startFetching]);

  // Load initial settings and Steam
  useEffect(() => {
    const loadInitialState = async () => {
      const settings = await loadSettings();
      const steamAvail = await initializeSteam();

      if (settings?.auth_mode) {
        setAuthMode(settings.auth_mode);
      } else if (steamAvail) {
        setAuthMode("steam");
      } else {
        setAuthMode("cm_ss13");
      }

      if (steamAvail) {
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
    };
    loadInitialState();
  }, [loadSettings, initializeSteam, setAuthMode]);

  // Auto-connect effect
  useEffect(() => {
    const performAutoConnect = async () => {
      if (!pendingAutoConnect || autoConnecting) return;
      if (servers.length === 0 || serversLoading) return;

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

      try {
        if (authMode === "steam" && !steamAccessToken) {
          if (steamModal.visible) {
            return;
          }

          const result = await authenticateSteam(false);

          if (!result?.success || !result.access_token) {
            if (result?.requires_linking) {
              setSteamModal({
                visible: true,
                state: "linking",
                linkingUrl: result.linking_url || undefined,
              });
              return;
            }
            throw new Error(result?.error || "Steam authentication failed");
          }

          return;
        }

        if (authMode === "cm_ss13" && !authState.logged_in) {
          return;
        }

        setPendingAutoConnect(null);
        await connect({
          version: byondVersion,
          host: readyRelay.host,
          port: port,
          serverName: server.name,
        });
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
    serversLoading,
    relays,
    authMode,
    steamAccessToken,
    authState.logged_in,
    showError,
    steamModal.visible,
    authenticateSteam,
    connect,
  ]);

  // Auth handlers
  const handleLogin = useCallback(async () => {
    setAuthModal({ visible: true, state: "loading", error: undefined });
    const result = await login();
    if (result.success) {
      setAuthModal({ visible: false, state: "idle", error: undefined });
    } else {
      setAuthModal({ visible: true, state: "error", error: result.error });
    }
  }, [login]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [logout, showError]);

  const handleAuthModalClose = useCallback(() => {
    setAuthModal({ visible: false, state: "idle", error: undefined });
    setPendingAutoConnect(null);
  }, []);

  const onLoginRequired = useCallback((serverName?: string) => {
    if (serverName) {
      setPendingAutoConnect(serverName);
    }
  }, []);

  // Steam handlers
  const handleSteamAuthenticate = useCallback(
    async (createAccountIfMissing: boolean) => {
      setSteamModal((prev) => ({
        ...prev,
        state: "loading",
        error: undefined,
        linkingUrl: undefined,
      }));

      const result = await authenticateSteam(createAccountIfMissing);

      if (result?.success && result.access_token) {
        setSteamModal({
          visible: false,
          state: "idle",
          error: undefined,
          linkingUrl: undefined,
        });
        return result;
      }
      if (result?.requires_linking) {
        setSteamModal({
          visible: true,
          state: "linking",
          error: undefined,
          linkingUrl: result.linking_url || undefined,
        });
        return result;
      }
      setSteamModal({
        visible: true,
        state: "error",
        error: result?.error || "Authentication failed",
        linkingUrl: undefined,
      });
      return result;
    },
    [authenticateSteam],
  );

  const handleSteamModalClose = useCallback(async () => {
    setSteamModal({
      visible: false,
      state: "idle",
      error: undefined,
      linkingUrl: undefined,
    });
    setPendingAutoConnect(null);
    await cancelSteamAuthTicket();
  }, [cancelSteamAuthTicket]);

  const handleSteamLogout = useCallback(() => {
    steamLogout();
  }, [steamLogout]);

  const onSteamAuthRequired = useCallback(
    (serverName?: string) => {
      if (serverName) {
        setPendingAutoConnect(serverName);
      }
      setSteamModal({
        visible: true,
        state: "idle",
        error: undefined,
        linkingUrl: undefined,
      });
      handleSteamAuthenticate(false);
    },
    [handleSteamAuthenticate],
  );

  // Settings handlers
  const handleAuthModeChange = useCallback(
    async (mode: typeof authMode) => {
      try {
        await saveSettings(mode);
        setSettingsVisible(false);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    },
    [saveSettings, showError],
  );

  // Relay handlers
  const handleRelaySelect = useCallback(
    (relayId: string) => {
      setSelectedRelay(relayId);
      setRelayDropdownOpen(false);
    },
    [setSelectedRelay],
  );

  const toggleRelayDropdown = useCallback(() => {
    setRelayDropdownOpen((prev) => !prev);
  }, []);

  return (
    <div className="crt-frame">
      <div className="crt-bezel" />
      <div className="crt" />
      <ErrorNotifications errors={errors} onDismiss={dismissError} />
      <AuthModal
        {...authModal}
        onLogin={handleLogin}
        onClose={handleAuthModalClose}
      />
      <SteamAuthModal
        {...steamModal}
        onAuthenticate={handleSteamAuthenticate}
        onClose={handleSteamModalClose}
      />
      <SettingsModal
        visible={settingsVisible}
        authMode={authMode}
        steamAvailable={steamAvailable}
        onAuthModeChange={handleAuthModeChange}
        onClose={() => setSettingsVisible(false)}
      />
      <GameConnectionModal
        visible={showGameConnectionModal}
        state={gameConnectionState}
        serverName={connectedServerName}
        onClose={closeGameConnectionModal}
      />

      <div className="launcher">
        <Titlebar />

        <main className="main-content">
          <section className="section servers-section">
            <div className="server-list">
              {serversLoading && servers.length === 0 && (
                <div className="server-loading">Loading servers...</div>
              )}
              {serversError && (
                <div className="server-error">Error: {serversError}</div>
              )}
              {servers.map((server, index) => (
                <ServerItem
                  key={server.name || index}
                  server={server}
                  onLoginRequired={onLoginRequired}
                  onSteamAuthRequired={onSteamAuthRequired}
                  autoConnecting={autoConnecting}
                />
              ))}
            </div>
          </section>
        </main>

        <footer className="section footer">
          <div className="account-info">
            <AccountInfo
              onLogin={handleLogin}
              onLogout={handleLogout}
              onSteamLogout={handleSteamLogout}
            />
          </div>
          <div className="footer-actions">
            <RelayDropdown
              relays={relays}
              selectedRelay={selectedRelay}
              isOpen={relayDropdownOpen}
              onToggle={toggleRelayDropdown}
              onSelect={handleRelaySelect}
            />
            <button
              type="button"
              className="button-secondary settings-button"
              onClick={() => setSettingsVisible(true)}
              title="Settings"
            >
              Settings
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorProvider>
      <AppContent />
    </ErrorProvider>
  );
}

export default App;
