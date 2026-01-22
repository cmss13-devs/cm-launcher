import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import "./App.css";

import {
  AccountInfo,
  AuthModal,
  ErrorNotifications,
  RelayDropdown,
  ServerItem,
  SettingsModal,
  SteamAuthModal,
  Titlebar,
  WineSetupModal,
} from "./components";
import {
  ErrorProvider,
  useAuth,
  useError,
  useRelays,
  useServers,
  useSettings,
  useSteamAuth,
  useWine,
} from "./hooks";
import type { SteamAuthResult, SteamLaunchOptions } from "./types";

function AppContent() {
  const { errors, dismissError, showError } = useError();
  const { servers, loading, error } = useServers();
  const {
    relays,
    selectedRelay,
    relayDropdownOpen,
    handleRelaySelect,
    toggleRelayDropdown,
  } = useRelays();

  const {
    authState,
    showAuthModal,
    authModalState,
    authError,
    handleLogin,
    handleLogout,
    onAuthModalClose,
  } = useAuth();

  const {
    steamAuthState,
    setSteamAuthState,
    showSteamAuthModal,
    steamAuthModalState,
    steamAuthError,
    steamLinkingUrl,
    initializeSteam,
    handleSteamAuthenticate,
    onSteamAuthModalClose,
    handleSteamLogout,
  } = useSteamAuth();

  const {
    authMode,
    setAuthMode,
    showSettingsModal,
    loadSettings,
    handleAuthModeChange,
    openSettings,
    closeSettings,
  } = useSettings();

  const {
    platform,
    status: wineStatus,
    setupProgress: wineSetupProgress,
    isSettingUp: isWineSettingUp,
    checkStatus: checkWineStatus,
    initializePrefix: initializeWinePrefix,
    resetPrefix: resetWinePrefix,
  } = useWine();

  const [showWineSetup, setShowWineSetup] = useState(false);
  const [pendingAutoConnect, setPendingAutoConnect] = useState<string | null>(
    null,
  );
  const [autoConnecting, setAutoConnecting] = useState(false);

  useEffect(() => {
    const loadInitialState = async () => {
      const settings = await loadSettings();
      const steamAvailable = await initializeSteam();

      if (settings?.auth_mode) {
        setAuthMode(settings.auth_mode);
      } else if (steamAvailable) {
        setAuthMode("steam");
      } else {
        setAuthMode("cm_ss13");
      }

      if (platform === "linux") {
        const wineStatusResult = await checkWineStatus();
        if (
          !wineStatusResult.prefix_initialized ||
          !wineStatusResult.webview2_installed
        ) {
          setShowWineSetup(true);
        }
      }

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
    };
    loadInitialState();
  }, [loadSettings, initializeSteam, setAuthMode, platform, checkWineStatus]);

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
    setSteamAuthState,
  ]);

  const onLoginRequired = useCallback((serverName?: string) => {
    if (serverName) {
      setPendingAutoConnect(serverName);
    }
  }, []);

  const handleAuthModalClose = useCallback(() => {
    onAuthModalClose();
    setPendingAutoConnect(null);
  }, [onAuthModalClose]);

  const onSteamAuthRequired = useCallback((serverName?: string) => {
    if (serverName) {
      setPendingAutoConnect(serverName);
    }
  }, []);

  const handleSteamModalClose = useCallback(async () => {
    await onSteamAuthModalClose();
    setPendingAutoConnect(null);
  }, [onSteamAuthModalClose]);

  return (
    <div className="crt-frame">
      <div className="crt-bezel" />
      <div className="crt" />
      <ErrorNotifications errors={errors} onDismiss={dismissError} />
      <AuthModal
        visible={showAuthModal}
        state={authModalState}
        error={authError}
        onLogin={handleLogin}
        onClose={handleAuthModalClose}
      />
      <SteamAuthModal
        visible={showSteamAuthModal}
        state={steamAuthModalState}
        error={steamAuthError}
        linkingUrl={steamLinkingUrl}
        onAuthenticate={handleSteamAuthenticate}
        onClose={handleSteamModalClose}
      />
      <SettingsModal
        visible={showSettingsModal}
        authMode={authMode}
        steamAvailable={steamAuthState.available}
        platform={platform}
        wineStatus={wineStatus}
        isResettingWine={isWineSettingUp}
        onAuthModeChange={handleAuthModeChange}
        onResetWinePrefix={resetWinePrefix}
        onClose={closeSettings}
      />
      <WineSetupModal
        visible={showWineSetup}
        status={wineStatus}
        progress={wineSetupProgress}
        isSettingUp={isWineSettingUp}
        onSetup={initializeWinePrefix}
        onClose={() => setShowWineSetup(false)}
        onRetry={checkWineStatus}
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
            <AccountInfo
              authMode={authMode}
              authState={authState}
              steamAuthState={steamAuthState}
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
              onClick={openSettings}
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
