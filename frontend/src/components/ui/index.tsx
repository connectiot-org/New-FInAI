import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useDemo } from "../../store";
import { Empty } from "./primitives";
export * from "./primitives";
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
