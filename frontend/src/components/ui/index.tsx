import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X, AlertCircle, Inbox } from "lucide-react";
import { useDemo } from "../../store";
export function Badge({ children }: { children: ReactNode }) {
  const value = String(children);
  return (
    <span
      className={`badge ${/Paid|Posted|Approved|Connected|Active|Matched/.test(value) ? "positive" : /Draft|Inbox|To do|Inactive/.test(value) ? "neutral" : "warning"}`}
    >
      {children}
    </span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  drawer = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  drawer?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={drawer ? "dialog drawer" : "dialog"}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (returnFocus.current?.isConnected
              ? returnFocus.current
              : document.querySelector<HTMLElement>("main")
            )?.focus({ preventScroll: true });
          }}
        >
          <div className="dialog-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  label = "Confirm",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  label?: string;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <p className="muted">{description}</p>
      <div className="dialog-actions">
        <button onClick={() => onOpenChange(false)}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {label}
        </button>
      </div>
    </Modal>
  );
}
export function Empty({
  title = "No records found",
  description = "Try changing your search or accounting period.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error">{error}</small>}
    </label>
  );
}
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const toast = useCallback(
    (text: string) =>
      setMessages((v) => [
        ...v.slice(-2),
        { id: Date.now() + Math.random(), text },
      ]),
    [],
  );
  useEffect(() => {
    if (!messages.length) return;
    const t = setTimeout(() => setMessages((v) => v.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [messages]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {messages.map((m) => (
          <div className="toast" key={m.id}>
            <Check size={16} />
            {m.text}
            <button
              className="icon-btn"
              aria-label="Dismiss notification"
              onClick={() => setMessages((v) => v.filter((x) => x.id !== m.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function Permission({
  admin = false,
  review = false,
  children,
}: {
  admin?: boolean;
  review?: boolean;
  children: ReactNode;
}) {
  const s = useDemo();
  const allowed = admin
    ? s.role === "Admin"
    : review
      ? s.role !== "Accountant"
      : s.role !== "Reviewer";
  return allowed ? (
    <>{children}</>
  ) : (
    <span className="permission">
      <AlertCircle size={14} />
      {admin ? "Admin" : review ? "Reviewer" : "Accountant"} role required
    </span>
  );
}
export function StatusControl({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(
    new URLSearchParams(location.search).get("demoState") || "ready",
  );
  useEffect(() => {
    setMode(new URLSearchParams(location.search).get("demoState") || "ready");
  }, []);
  if (mode === "error")
    return (
      <div className="empty">
        <AlertCircle />
        <h3>Simulated loading error</h3>
        <p>No network request was made.</p>
        <button onClick={() => setMode("ready")}>Retry locally</button>
      </div>
    );
  if (mode === "empty")
    return (
      <Empty
        title="Simulated empty workspace"
        description="Choose Ready in Preferences to restore the fixture view."
      />
    );
  if (mode === "loading")
    return (
      <div className="empty">
        <span className="skeleton" />
        <p>Simulated loading state</p>
        <button onClick={() => setMode("ready")}>Finish loading</button>
      </div>
    );
  return <>{children}</>;
}
