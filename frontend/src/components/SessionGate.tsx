import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { Field } from "./ui/primitives";
import { sessionEnabled } from "../lib/api";
import { sessionChanged } from "../lib/session-lifecycle";
const SessionContext = createContext(false);
const sessionSchema = z.strictObject({
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
async function token(response: Response) {
  if (response.status !== 200) throw new Error("Session service unavailable");
  return sessionSchema.parse(await response.json()).csrfToken;
}
type Props = { children: ReactNode; title?: string };
export function SessionGate(props: Props) {
  return useContext(SessionContext) ? (
    <>{props.children}</>
  ) : (
    <SessionBoundary {...props} />
  );
}
function SessionBoundary({
  children,
  title = "Sign in to your checklist",
}: Props) {
  const [authenticated, setAuthenticated] = useState(!sessionEnabled);
  const [checking, setChecking] = useState(sessionEnabled);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!sessionEnabled) return;
    let active = true;
    const controller = new AbortController();
    setChecking(true);
    setError("");
    fetch("/auth/session", {
      credentials: "same-origin",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (r) => {
        if (r.status !== 401) await token(r);
        if (active) setAuthenticated(r.status === 200);
      })
      .catch(() => {
        if (active)
          setError(
            "Cannot reach sign-in service. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);
  useEffect(() => {
    const expire = () => {
      setAuthenticated(false);
      setError("Your session expired. Sign in again.");
    };
    window.addEventListener("finai:session-expired", expire);
    return () => window.removeEventListener("finai:session-expired", expire);
  }, []);
  if (checking) return <p role="status">Checking session…</p>;
  if (!authenticated)
    return (
      <section className="panel">
        <h1>{title}</h1>
        <p>Accounts are provided by your administrator.</p>
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setRetry((v) => v + 1)}
            >
              Check session again
            </button>
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            const form = event.currentTarget,
              fields = new FormData(form);
            inFlight.current = true;
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: fields.get("username"),
                  password: fields.get("password"),
                  organisationId: fields.get("organisationId"),
                }),
                signal: AbortSignal.timeout(10000),
              });
              await token(r);
              form.reset();
              sessionChanged();
              setAuthenticated(true);
            } catch {
              setError(
                "Sign-in failed. Check your details or try again later.",
              );
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <Field label="Account name">
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={100}
              disabled={busy}
            />
          </Field>
          <Field label="Organisation ID">
            <input
              name="organisationId"
              required
              autoComplete="off"
              maxLength={36}
              disabled={busy}
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              disabled={busy}
            />
          </Field>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    );
  return (
    <SessionContext.Provider value={true}>
      {sessionEnabled && (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/auth/session", {
                  credentials: "same-origin",
                  signal: AbortSignal.timeout(10000),
                });
                if (r.status !== 401) {
                  const csrfToken = await token(r);
                  const result = await fetch("/auth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": csrfToken,
                    },
                    body: "{}",
                    signal: AbortSignal.timeout(10000),
                  });
                  if (result.status !== 200) throw new Error();
                  z.strictObject({ status: z.literal("signed-out") }).parse(
                    await result.json(),
                  );
                }
                sessionChanged();
                setAuthenticated(false);
              } catch {
                setError(
                  "Sign out could not be confirmed. Check your connection and try again.",
                );
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}
      {children}
    </SessionContext.Provider>
  );
}
