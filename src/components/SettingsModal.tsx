import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { ConnectionResult } from "../hooks/useConnect";
import type { AuthMode, Theme } from "../types";
import { Modal, ModalCloseButton } from "./Modal";

interface AuthModeOptionProps {
  mode: AuthMode;
  currentMode: AuthMode;
  name: string;
  description: string;
  onChange: (mode: AuthMode) => void;
}

function AuthModeOption({
  mode,
  currentMode,
  name,
  description,
  onChange,
}: AuthModeOptionProps) {
  return (
    <label
      className={`auth-mode-option ${currentMode === mode ? "selected" : ""}`}
    >
      <input
        type="radio"
        name="authMode"
        value={mode}
        checked={currentMode === mode}
        onChange={() => onChange(mode)}
      />
      <div className="auth-mode-info">
        <span className="auth-mode-name">{name}</span>
        <span className="auth-mode-desc">{description}</span>
      </div>
    </label>
  );
}

interface ThemeOptionProps {
  theme: Theme;
  currentTheme: Theme;
  name: string;
  description: string;
  onChange: (theme: Theme) => void;
}

function ThemeOption({
  theme,
  currentTheme,
  name,
  description,
  onChange,
}: ThemeOptionProps) {
  return (
    <label
      className={`theme-option ${currentTheme === theme ? "selected" : ""}`}
    >
      <input
        type="radio"
        name="theme"
        value={theme}
        checked={currentTheme === theme}
        onChange={() => onChange(theme)}
      />
      <div className="theme-info">
        <span className="theme-name">{name}</span>
        <span className="theme-desc">{description}</span>
      </div>
    </label>
  );
}

interface DevConnectSectionProps {
  onLoginRequired: () => void;
  onSteamAuthRequired: () => void;
}

function DevConnectSection({
  onLoginRequired,
  onSteamAuthRequired,
}: DevConnectSectionProps) {
  const [url, setUrl] = useState("localhost:1337");
  const [version, setVersion] = useState("516.1667");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const result = await invoke<ConnectionResult>("connect_to_url", {
        url,
        version,
        source: "DevConnectSection",
      });

      if (!result.success && result.auth_error) {
        if (result.auth_error.code === "auth_required") {
          onLoginRequired();
        } else if (result.auth_error.code === "steam_linking_required") {
          onSteamAuthRequired();
        } else {
          setError(result.auth_error.message);
        }
      } else if (!result.success) {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="dev-connect-section">
      <div className="dev-input-group">
        <label htmlFor="dev-url">Server URL</label>
        <input
          id="dev-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="localhost:1337"
        />
      </div>
      <div className="dev-input-group">
        <label htmlFor="dev-version">BYOND Version</label>
        <input
          id="dev-version"
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="516.1667"
        />
      </div>
      {error && <div className="dev-error">{error}</div>}
      <button
        type="button"
        className="button dev-connect-button"
        onClick={handleConnect}
        disabled={connecting || !url || !version}
      >
        {connecting ? "Connecting..." : "Connect"}
      </button>
    </div>
  );
}

interface SettingsModalProps {
  visible: boolean;
  authMode: AuthMode;
  theme: Theme;
  steamAvailable: boolean;
  devMode: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onThemeChange: (theme: Theme) => void;
  onLoginRequired: () => void;
  onSteamAuthRequired: () => void;
  onClose: () => void;
}

export function SettingsModal({
  visible,
  authMode,
  theme,
  steamAvailable,
  devMode,
  onAuthModeChange,
  onThemeChange,
  onLoginRequired,
  onSteamAuthRequired,
  onClose,
}: SettingsModalProps) {
  const [byondPagerRunning, setByondPagerRunning] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (visible && authMode === "byond") {
      invoke<boolean>("is_byond_pager_running")
        .then(setByondPagerRunning)
        .catch(() => setByondPagerRunning(null));
    }
  }, [visible, authMode]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      className="settings-modal"
      overlayClassName="settings-modal-overlay"
      closeOnOverlayClick
    >
      <div className="settings-modal-header">
        <h2>Settings</h2>
        <button
          type="button"
          className="help-link"
          onClick={() =>
            openUrl("https://github.com/cmss13-devs/cm-launcher/issues")
          }
          title="Report an issue"
        >
          Help
        </button>
        <ModalCloseButton onClick={onClose} />
      </div>
      <div className="settings-modal-content">
        <div className="settings-section">
          <h3>Appearance</h3>
          <p className="settings-description">
            Choose a visual theme for the launcher.
          </p>
          <div className="theme-options">
            <ThemeOption
              theme="default"
              currentTheme={theme}
              name="Default"
              description="Classic green CRT terminal theme"
              onChange={onThemeChange}
            />
            <ThemeOption
              theme="ntos"
              currentTheme={theme}
              name="NTos"
              description="Blue corporate terminal theme"
              onChange={onThemeChange}
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Authentication Mode</h3>
          <p className="settings-description">
            Choose how you want to authenticate when connecting to servers.
          </p>
          {authMode === "byond" && byondPagerRunning === false && (
            <div className="auth-mode-warning">
              BYOND pager (byond.exe) is not running. Please open BYOND and log
              in before connecting to a server.
            </div>
          )}
          <div className="auth-mode-options">
            <AuthModeOption
              mode="cm_ss13"
              currentMode={authMode}
              name="CM-SS13 Authentication"
              description="Login with your CM-SS13 account for server access"
              onChange={onAuthModeChange}
            />
            {steamAvailable && (
              <AuthModeOption
                mode="steam"
                currentMode={authMode}
                name="Steam Authentication"
                description="Login with your Steam account"
                onChange={onAuthModeChange}
              />
            )}
            <AuthModeOption
              mode="byond"
              currentMode={authMode}
              name="BYOND Authentication"
              description="Use BYOND's built-in authentication (no login required)"
              onChange={onAuthModeChange}
            />
          </div>
        </div>

        {devMode && (
          <div className="settings-section dev-section">
            <h3>Developer Options</h3>
            <p className="settings-description">
              Connect to a local development server.
            </p>
            <DevConnectSection
              onLoginRequired={onLoginRequired}
              onSteamAuthRequired={onSteamAuthRequired}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
