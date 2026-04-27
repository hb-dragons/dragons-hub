import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastVariant } from "@/components/ui/Toast";

export interface ShowToastArgs {
  title: string;
  variant?: ToastVariant;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
}

interface ActiveToast extends ShowToastArgs {
  /** Monotonically increasing id so the host re-mounts on rapid show calls. */
  id: number;
}

interface ToastContextValue {
  show: (args: ShowToastArgs) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ActiveToastContext = createContext<ActiveToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);

  const show = useCallback((args: ShowToastArgs) => {
    idRef.current += 1;
    setActive({ ...args, id: idRef.current });
  }, []);

  const dismiss = useCallback(() => {
    setActive(null);
  }, []);

  const api = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <ActiveToastContext.Provider value={active}>{children}</ActiveToastContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function useActiveToast(): ActiveToast | null {
  return useContext(ActiveToastContext);
}
