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

interface SettingsModalProps {
  visible: boolean;
  authMode: AuthMode;
  theme: Theme;
  steamAvailable: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
}

export function SettingsModal({
  visible,
  authMode,
  theme,
  steamAvailable,
  onAuthModeChange,
  onThemeChange,
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
      </div>
    </Modal>
  );
}
