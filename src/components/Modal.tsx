import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
}

export function Modal({
  visible,
  onClose,
  children,
  className = "auth-modal",
  overlayClassName = "auth-modal-overlay",
  closeOnOverlayClick = false,
}: ModalProps) {
  if (!visible) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className={overlayClassName}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div className={className}>{children}</div>
    </div>
  );
}

interface ModalCloseButtonProps {
  onClick: () => void;
}

export function ModalCloseButton({ onClick }: ModalCloseButtonProps) {
  return (
    <button type="button" className="modal-close-button" onClick={onClick}>
      <FontAwesomeIcon icon={faXmark} />
    </button>
  );
}

interface ModalContentProps {
  title: string;
  children: ReactNode;
}

export function ModalContent({ title, children }: ModalContentProps) {
  return (
    <>
      <h2>{title}</h2>
      {children}
    </>
  );
}

export function ModalSpinner() {
  return <div className="auth-spinner" />;
}
