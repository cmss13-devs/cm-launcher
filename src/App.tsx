import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

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
import { ErrorProvider, useError, useGameConnection } from "./hooks";
import {
  useAuthStore,
  useServerStore,
  useSettingsStore,
  useSteamStore,
} from "./stores";

interface AutoConnectEvent {
  status:
    | "starting"
    | "waiting_for_servers"
    | "server_not_found"
    | "server_unavailable"
    | "auth_required"
    | "steam_linking_required"
    | "connecting"
    | "connected"
    | "error";
  server_name: string;
  message: string | null;
  linking_url: string | null;
}

function AppContent() {
  const { errors, dismissError, showError } = useError();

  const {
    login,
    logout,
    initListener: initAuthListener,
  } = useAuthStore(
    useShallow((s) => ({
      login: s.login,
      logout: s.logout,
      initListener: s.initListener,
    })),
  );

  const {
    available: steamAvailable,
    initialize: initializeSteam,
    authenticate: authenticateSteam,
    logout: steamLogout,
    cancelAuthTicket: cancelSteamAuthTicket,
  } = useSteamStore(
    useShallow((s) => ({
      available: s.available,
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
    initListener: initServerListener,
    initRelays,
  } = useServerStore(
    useShallow((s) => ({
      servers: s.servers,
      loading: s.loading,
      error: s.error,
      relays: s.relays,
      selectedRelay: s.selectedRelay,
      setSelectedRelay: s.setSelectedRelay,
      initListener: s.initListener,
      initRelays: s.initRelays,
    })),
  );

  const {
    authMode,
    setAuthMode,
    theme,
    devMode,
    load: loadSettings,
    saveAuthMode,
    saveTheme,
  } = useSettingsStore(
    useShallow((s) => ({
      authMode: s.authMode,
      setAuthMode: s.setAuthMode,
      theme: s.theme,
      devMode: s.devMode,
      load: s.load,
      saveAuthMode: s.saveAuthMode,
      saveTheme: s.saveTheme,
    })),
  );

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

  const [autoConnecting, setAutoConnecting] = useState(false);

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  useEffect(() => {
    const unlistenAuthPromise = initAuthListener();
    const unlistenServerPromise = initServerListener();
    const unlistenRelaysPromise = initRelays();

    return () => {
      unlistenAuthPromise.then((unlisten) => unlisten());
      unlistenServerPromise.then((unlisten) => unlisten());
      unlistenRelaysPromise.then((unlisten) => unlisten());
    };
  }, [initAuthListener, initServerListener, initRelays]);

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
    };
    loadInitialState();
  }, [loadSettings, initializeSteam, setAuthMode]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<AutoConnectEvent>(
        "autoconnect-status",
        (event) => {
          const { status, server_name, message, linking_url } = event.payload;
          console.log(`[autoconnect] status=${status} server=${server_name}`);

          switch (status) {
            case "starting":
            case "waiting_for_servers":
            case "connecting":
              setAutoConnecting(true);
              break;

            case "auth_required":
              setAutoConnecting(false);
              setAuthModal({ visible: true, state: "idle", error: undefined });
              break;

            case "steam_linking_required":
              setAutoConnecting(false);
              setSteamModal({
                visible: true,
                state: "linking",
                error: undefined,
                linkingUrl: linking_url || undefined,
              });
              break;

            case "server_not_found":
            case "server_unavailable":
            case "error":
              setAutoConnecting(false);
              if (message) {
                showError(message);
              }
              break;

            case "connected":
              setAutoConnecting(false);
              break;
          }
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [showError]);

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
  }, []);

  const onLoginRequired = useCallback(() => {
    setAuthModal({ visible: true, state: "idle", error: undefined });
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
    await cancelSteamAuthTicket();
  }, [cancelSteamAuthTicket]);

  const handleSteamLogout = useCallback(() => {
    steamLogout();
  }, [steamLogout]);

  const onSteamAuthRequired = useCallback(() => {
    setSteamModal({
      visible: true,
      state: "idle",
      error: undefined,
      linkingUrl: undefined,
    });
    handleSteamAuthenticate(false);
  }, [handleSteamAuthenticate]);

  // Settings handlers
  const handleAuthModeChange = useCallback(
    async (mode: typeof authMode) => {
      try {
        await saveAuthMode(mode);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    },
    [saveAuthMode, showError],
  );

  const handleThemeChange = useCallback(
    async (newTheme: typeof theme) => {
      try {
        await saveTheme(newTheme);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    },
    [saveTheme, showError],
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
        theme={theme}
        steamAvailable={steamAvailable}
        devMode={devMode}
        onAuthModeChange={handleAuthModeChange}
        onThemeChange={handleThemeChange}
        onLoginRequired={onLoginRequired}
        onSteamAuthRequired={onSteamAuthRequired}
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
