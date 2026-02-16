import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import type { ErrorNotification } from "../types";

interface ErrorContextType {
  showError: (message: string) => void;
  errors: ErrorNotification[];
  dismissError: (id: number) => void;
}

const ErrorContext = createContext<ErrorContextType | null>(null);

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useError must be used within ErrorProvider");
  }
  return context;
};

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider = ({ children }: ErrorProviderProps) => {
  const [errors, setErrors] = useState<ErrorNotification[]>([]);
  const [errorIdCounter, setErrorIdCounter] = useState(0);

  const showError = useCallback(
    (message: string) => {
      const id = errorIdCounter;
      setErrorIdCounter((prev) => prev + 1);
      setErrors((prev) => [...prev, { id, message }]);
    },
    [errorIdCounter],
  );

  const dismissError = useCallback((id: number) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <ErrorContext.Provider value={{ showError, errors, dismissError }}>
      {children}
    </ErrorContext.Provider>
  );
};
