import { Modal, ModalCloseButton, ModalContent, ModalSpinner } from "./Modal";

export type AuthModalState = "idle" | "loading" | "error";

interface AuthModalProps {
  visible: boolean;
  state: AuthModalState;
  error?: string;
  onLogin: () => void;
  onClose: () => void;
}

export const AuthModal = ({
  visible,
  state,
  error,
  onLogin,
  onClose,
}: AuthModalProps) => {
  return (
    <Modal visible={visible} onClose={onClose}>
      <ModalCloseButton onClick={onClose} />
      {state === "idle" && (
        <ModalContent title="Authentication Required">
          <p>Please log in with your CM-SS13 account to continue.</p>
          <button type="button" className="button" onClick={onLogin}>
            Login
          </button>
        </ModalContent>
      )}
      {state === "loading" && (
        <ModalContent title="Authenticating...">
          <p>Please complete login in your browser.</p>
          <ModalSpinner />
        </ModalContent>
      )}
      {state === "error" && (
        <ModalContent title="Authentication Failed">
          <p className="auth-error-message">{error}</p>
          <button type="button" className="button" onClick={onLogin}>
            Try Again
          </button>
        </ModalContent>
      )}
    </Modal>
  );
};
