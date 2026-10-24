import { useEffect, useState, type ReactNode } from "react";
import { Field } from "./ui";
import { sessionEnabled } from "../lib/api";
export function SessionGate({
  children,
  title = "Sign in to your checklist",
  headingLevel = 1,
}: {
  children: ReactNode;
  title?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const [authenticated, setAuthenticated] = useState(!sessionEnabled);
  const [checking, setChecking] = useState(sessionEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expired = () => setAuthenticated(false);
    window.addEventListener("finai-session-expired", expired);
    return () => window.removeEventListener("finai-session-expired", expired);
  }, []);
  useEffect(() => {
    if (!sessionEnabled) return;
    let active = true;
    fetch("/auth/session", {
      credentials: "same-origin",
      signal: AbortSignal.timeout(10000),
    })
      .then((r) => {
        if (active) setAuthenticated(r.ok);
      })
      .catch(() => {
        if (active) setError("Cannot reach sign-in service.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
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
            const form = event.currentTarget;
            const fields = new FormData(form);
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
              form.reset();
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
      </section>
    );
  return (
    <>
      {sessionEnabled && (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/auth/session", {
                  credentials: "same-origin",
                });
                if (r.ok) {
                  const session = await r.json();
                  const result = await fetch("/auth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": session.csrfToken,
                    },
                    body: "{}",
                    signal: AbortSignal.timeout(10000),
                  });
                  if (!result.ok)
                    throw new Error("Sign out failed. Try again.");
                }
                window.dispatchEvent(new Event("finai-session-expired"));
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
        </>
      )}
      {children}
    </>
  );
}
