import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Field } from "./ui";
import { sessionEnabled } from "../lib/api";
import {
  readSession,
  sessionSchema,
  logoutSchema,
  authenticateSession,
  expireSession,
} from "../lib/session";
const Authenticated = createContext(false);
type Props = { children: ReactNode; title?: string; headingLevel?: 1 | 2 };
export function SessionGate(props: Props) {
  const inherited = useContext(Authenticated);
  return inherited ? <>{props.children}</> : <OwnedSessionGate {...props} />;
}
function OwnedSessionGate({
  children,
  title = "Sign in to your checklist",
  headingLevel = 1,
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const [authenticated, setAuthenticated] = useState(!sessionEnabled),
    [checking, setChecking] = useState(sessionEnabled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const expired = () => {
      setAuthenticated(false);
      setError("Session expired. Sign in again.");
    };
    window.addEventListener("finai-session-expired", expired);
    return () => window.removeEventListener("finai-session-expired", expired);
  }, []);
  useEffect(() => {
    if (!sessionEnabled) return;
    const c = new AbortController();
    let active = true;
    setChecking(true);
    setError("");
    readSession(c.signal)
      .then(() => {
        if (active) setAuthenticated(true);
      })
      .catch((e) => {
        if (active) {
          setAuthenticated(false);
          if (e?.status !== 401)
            setError(
              e instanceof Error ? e.message : "Cannot reach sign-in service.",
            );
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [retry]);
  if (checking) return <p role="status">Checking session…</p>;
  if (!authenticated)
    return (
      <section className="panel">
        <Heading>{title}</Heading>
        <p>Accounts are provided by your administrator.</p>
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = event.currentTarget,
              fields = new FormData(form);
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
              if (!r.ok)
                throw new Error(
                  "Sign-in failed. Check your details or try again later.",
                );
              if (!sessionSchema.safeParse(await r.json()).success)
                throw new Error(
                  "Sign-in service returned an invalid response.",
                );
              form.reset();
              authenticateSession();
              setAuthenticated(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sign-in failed.");
            } finally {
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
            />
          </Field>
          <Field label="Organisation ID">
            <input name="organisationId" required autoComplete="off" />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </Field>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRetry((v) => v + 1)}
        >
          Check session again
        </button>
      </section>
    );
  return (
    <Authenticated.Provider value={true}>
      {sessionEnabled && (
        <div className="session-actions">
          <button
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                let session;
                try {
                  session = await readSession();
                } catch (e) {
                  if ((e as { status?: number }).status === 401) {
                    expireSession();
                    setAuthenticated(false);
                    return;
                  }
                  throw e;
                }
                const r = await fetch("/auth/logout", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": session.csrfToken,
                  },
                  body: "{}",
                  signal: AbortSignal.timeout(10000),
                });
                if (!r.ok || !logoutSchema.safeParse(await r.json()).success)
                  throw new Error("Sign out failed. Try again.");
                expireSession();
                setError("");
                setAuthenticated(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Sign out failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {children}
    </Authenticated.Provider>
  );
}
