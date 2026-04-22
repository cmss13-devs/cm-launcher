import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, type MouseEvent, type ReactNode } from "react";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
}

export const Modal = ({
  visible,
  onClose,
  children,
  className = "auth-modal",
  overlayClassName = "auth-modal-overlay",
  closeOnOverlayClick = false,
}: ModalProps) => {
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={overlayClassName}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={className}>{children}</div>
    </div>
  );
};

interface ModalCloseButtonProps {
  onClick: () => void;
}

export const ModalCloseButton = ({ onClick }: ModalCloseButtonProps) => {
  return (
    <button type="button" className="modal-close-button" onClick={onClick}>
      <FontAwesomeIcon icon={faXmark} />
    </button>
  );
};

interface ModalContentProps {
  title: string;
  children: ReactNode;
}

export const ModalContent = ({ title, children }: ModalContentProps) => {
  return (
    <>
      <h2>{title}</h2>
      {children}
    </>
  );
};

export const ModalSpinner = () => {
  return <div className="auth-spinner" />;
};
