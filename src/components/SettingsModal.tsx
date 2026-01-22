import type { AuthMode, Platform, WineStatus } from "../types";
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

interface WineSettingsProps {
  platform: Platform;
  wineStatus: WineStatus;
  isResetting: boolean;
  onResetPrefix: () => void;
}

function WineSettings({
  platform,
  wineStatus,
  isResetting,
  onResetPrefix,
}: WineSettingsProps) {
  if (platform !== "linux") {
    return null;
  }

  return (
    <div className="settings-section">
      <h3>Wine Configuration</h3>
      <div className="wine-status-info">
        <p>
          <strong>Wine:</strong>{" "}
          {wineStatus.installed ? (
            <span className="status-ok">{wineStatus.version}</span>
          ) : (
            <span className="status-error">Not installed</span>
          )}
        </p>
        <p>
          <strong>Prefix:</strong>{" "}
          {wineStatus.prefix_initialized ? (
            <span className="status-ok">Initialized</span>
          ) : (
            <span className="status-warning">Not initialized</span>
          )}
        </p>
        <p>
          <strong>WebView2:</strong>{" "}
          {wineStatus.webview2_installed ? (
            <span className="status-ok">Installed</span>
          ) : (
            <span className="status-warning">Not installed</span>
          )}
        </p>
      </div>
      <button
        type="button"
        className="button-secondary"
        onClick={onResetPrefix}
        disabled={isResetting}
      >
        {isResetting ? "Resetting..." : "Reset Wine Prefix"}
      </button>
      <p className="settings-hint">
        Use this if you're experiencing issues. This will reinstall all
        dependencies.
      </p>
    </div>
  );
}

interface SettingsModalProps {
  visible: boolean;
  authMode: AuthMode;
  steamAvailable: boolean;
  platform: Platform;
  wineStatus: WineStatus;
  isResettingWine: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onResetWinePrefix: () => void;
  onClose: () => void;
}

export function SettingsModal({
  visible,
  authMode,
  steamAvailable,
  platform,
  wineStatus,
  isResettingWine,
  onAuthModeChange,
  onResetWinePrefix,
  onClose,
}: SettingsModalProps) {
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
        <ModalCloseButton onClick={onClose} />
      </div>
      <div className="settings-modal-content">
        <div className="settings-section">
          <h3>Authentication Mode</h3>
          <p className="settings-description">
            Choose how you want to authenticate when connecting to servers.
          </p>
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
        <WineSettings
          platform={platform}
          wineStatus={wineStatus}
          isResetting={isResettingWine}
          onResetPrefix={onResetWinePrefix}
        />
      </div>
    </Modal>
  );
}
