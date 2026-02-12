import type { WineSetupProgress, WineStatus } from "../types";
import { Modal, ModalCloseButton, ModalContent, ModalSpinner } from "./Modal";

interface WineSetupModalProps {
  visible: boolean;
  status: WineStatus;
  progress: WineSetupProgress | null;
  isSettingUp: boolean;
  onSetup: () => void;
  onClose: () => void;
  onRetry: () => void;
}

function WineNotInstalledContent({
  status,
  onRetry,
}: {
  status: WineStatus;
  onRetry: () => void;
}) {
  const showWinetricksError = status.installed && !status.winetricks_installed;
  const showVersionError =
    status.installed && !status.meets_minimum_version && status.version;

  return (
    <ModalContent
      title={
        showVersionError
          ? "Wine Version Too Old"
          : showWinetricksError
            ? "Winetricks Required"
            : "Wine Required"
      }
    >
      {showVersionError ? (
        <>
          <p>
            Wine 10.5 or newer is required to run BYOND.
            <br />
            Your version: <code>{status.version}</code>
          </p>
          <p>Please update Wine using your package manager.</p>
        </>
      ) : showWinetricksError ? (
        <>
          <p>Winetricks is required for initial setup.</p>
          <div className="wine-install-instructions compact">
            <code>
              <strong>Ubuntu/Debian:</strong> sudo apt install winetricks
            </code>
            <code>
              <strong>Fedora:</strong> sudo dnf install winetricks
            </code>
            <code>
              <strong>Arch:</strong> sudo pacman -S winetricks
            </code>
          </div>
        </>
      ) : (
        <>
          <p>Wine 10.5+ is required to run BYOND on Linux.</p>
          <div className="wine-install-instructions compact">
            <code>
              <strong>Ubuntu/Debian:</strong> sudo apt install wine winetricks
            </code>
            <code>
              <strong>Fedora:</strong> sudo dnf install wine winetricks
            </code>
            <code>
              <strong>Arch:</strong> sudo pacman -S wine winetricks
            </code>
          </div>
        </>
      )}
      <div className="wine-modal-actions">
        <button type="button" className="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </ModalContent>
  );
}

function SetupProgressContent({
  progress,
}: {
  progress: WineSetupProgress | null;
}) {
  const displayProgress = progress?.progress ?? 0;
  const displayMessage =
    progress?.message ?? "Starting Wine environment setup...";

  return (
    <ModalContent title="Setting Up Wine Environment">
      <p className="wine-setup-message">{displayMessage}</p>
      <div className="wine-progress-bar">
        <div
          className="wine-progress-fill"
          style={{ width: `${displayProgress}%` }}
        />
      </div>
      <p className="wine-progress-percent">{displayProgress}%</p>
      <p className="wine-setup-note">
        This may take several minutes. Please do not close the launcher.
      </p>
      <ModalSpinner />
    </ModalContent>
  );
}

function SetupRequiredContent({ onSetup }: { onSetup: () => void }) {
  return (
    <ModalContent title="Wine Setup Required">
      <p>
        BYOND requires a Wine environment with VC++ runtime, DirectX, fonts, and
        WebView2.
      </p>
      <p className="wine-setup-note">One-time setup, may take 5-10 minutes.</p>
      <div className="wine-modal-actions">
        <button type="button" className="button" onClick={onSetup}>
          Start Setup
        </button>
      </div>
    </ModalContent>
  );
}

function SetupErrorContent({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <ModalContent title="Setup Failed">
      <p className="wine-error-message">{error}</p>
      <p>You can try:</p>
      <ul className="wine-setup-list">
        <li>Reset the Wine prefix from Settings</li>
        <li>Check if Wine and winetricks are properly installed</li>
        <li>Check the logs for more details</li>
      </ul>
      <div className="wine-modal-actions">
        <button type="button" className="button" onClick={onRetry}>
          Try Again
        </button>
      </div>
    </ModalContent>
  );
}

function SetupCompleteContent({ onClose }: { onClose: () => void }) {
  return (
    <ModalContent title="Setup Complete">
      <div className="wine-setup-complete">
        <p className="wine-check-item">Wine setup complete!</p>
      </div>
      <div className="wine-modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Continue
        </button>
      </div>
    </ModalContent>
  );
}

export function WineSetupModal({
  visible,
  status,
  progress,
  isSettingUp,
  onSetup,
  onClose,
  onRetry,
}: WineSetupModalProps) {
  // Determine which state to show
  const wineNotReady =
    !status.installed ||
    !status.meets_minimum_version ||
    !status.winetricks_installed;
  const setupComplete =
    status.prefix_initialized &&
    status.webview2_installed &&
    !isSettingUp &&
    progress?.stage === "complete";
  const setupFailed = progress?.stage === "error";

  // Don't allow closing during setup
  const canClose = !isSettingUp;

  return (
    <Modal visible={visible} onClose={canClose ? onClose : () => {}}>
      {canClose && <ModalCloseButton onClick={onClose} />}

      {wineNotReady ? (
        <WineNotInstalledContent status={status} onRetry={onRetry} />
      ) : isSettingUp ? (
        <SetupProgressContent progress={progress} />
      ) : setupFailed ? (
        <SetupErrorContent
          error={progress?.message ?? "Unknown error"}
          onRetry={onRetry}
        />
      ) : setupComplete ? (
        <SetupCompleteContent onClose={onClose} />
      ) : (
        <SetupRequiredContent onSetup={onSetup} />
      )}
    </Modal>
  );
}
