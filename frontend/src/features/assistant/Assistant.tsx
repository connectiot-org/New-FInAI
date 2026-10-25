import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../workspace/context";
import {
  assistantApi as api,
  exactValue,
  type Conversation,
  type ReadConversation,
  type Preference,
  capabilities,
} from "./api";
import type { z } from "zod";
import { ApiError } from "../../lib/api";
import "./assistant.css";
export function ProductionAssistant() {
  const workspace = useWorkspace(),
    [params, setParams] = useSearchParams(),
    [chats, setChats] = useState<Conversation[]>(),
    [error, setError] = useState(""),
    [cap, setCap] = useState<z.infer<typeof capabilities>>(),
    [refresh, setRefresh] = useState(0),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [creating, setCreating] = useState(false);
  const entityId = params.get("entityId") || workspace.entities[0]?.id || "",
    month = params.get("month") || new Date().toISOString().slice(0, 7),
    currency = params.get("currency") || "USD",
    id = params.get("conversationId") || "";
  const valid =
    workspace.entities.some((e) => e.id === entityId) &&
    /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    /^[A-Z]{3}$/.test(currency) &&
    (!id || /^[a-f0-9-]{36}$/i.test(id));
  const request = useRef<AbortController | null>(null),
    pendingCreate = useRef<
      | { id: string; entityId: string; month: string; currency: string }
      | undefined
    >(undefined);
  useEffect(() => {
    const c = new AbortController();
    const previous = pendingCreate.current;
    if (
      previous &&
      (previous.entityId !== entityId ||
        previous.month !== month ||
        previous.currency !== currency)
    )
      pendingCreate.current = undefined;
    request.current?.abort();
    request.current = c;
    setChats(undefined);
    setError("");
    setCreating(false);
    if (valid) {
      api
        .list(entityId, offset, c.signal)
        .then((v) => {
          if (!c.signal.aborted) {
            if (v.items.some((x) => x.entityId !== entityId))
              throw new Error("Conversation scope mismatch.");
            setChats(v.items);
            setTotal(v.total);
          }
        })
        .catch((e: Error) => {
          if (!c.signal.aborted) setError(e.message);
        });
      api
        .capabilities(c.signal)
        .then((v) => {
          if (!c.signal.aborted) setCap(v);
        })
        .catch((e: Error) => {
          if (!c.signal.aborted) setError(e.message);
        });
    }
    return () => c.abort();
  }, [entityId, month, currency, offset, refresh, valid]);
  function scope(values: Record<string, string>) {
    setParams({ ...{ entityId, month, currency }, ...values });
    setError("");
    pendingCreate.current = undefined;
  }
  async function createChat() {
    if (!valid) return;
    const c = request.current!;
    setCreating(true);
    setError("");
    const previous = pendingCreate.current;
    const body =
      previous?.entityId === entityId &&
      previous.month === month &&
      previous.currency === currency
        ? previous
        : { id: crypto.randomUUID(), entityId, month, currency };
    pendingCreate.current = body;
    try {
      const v = await api.create(body, c.signal);
      if (!c.signal.aborted) {
        pendingCreate.current = undefined;
        setParams({
          entityId: v.entityId,
          month: v.month,
          currency: v.currency,
          conversationId: v.id,
        });
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setError(
          e instanceof Error ? e.message : "Conversation creation failed.",
        );
        if (e instanceof ApiError && e.status >= 400 && e.status < 500)
          pendingCreate.current = undefined;
      }
    } finally {
      if (!c.signal.aborted) setCreating(false);
    }
  }
  return (
    <section className="real-assistant">
      <h1>FinAI Assistant</h1>
      <p>
        Ask about your financial records, with source-backed answers and saved
        conversations.
      </p>
      <p className="assistant-scope">
        Organisation: {workspace.organisationName} ·{" "}
        {workspace.entities.find((e) => e.id === entityId)?.name ||
          "No authorized entity"}{" "}
        · {month} · {currency}
      </p>
      <div className="assistant-scope-controls">
        <label>
          Assistant entity
          <select
            aria-label="Assistant entity"
            value={entityId}
            onChange={(e) => {
              setOffset(0);
              scope({ entityId: e.target.value });
            }}
          >
            {workspace.entities.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assistant month
          <input
            type="month"
            value={month}
            onChange={(e) => scope({ month: e.target.value })}
          />
        </label>
        <label>
          Assistant currency
          <input
            value={currency}
            maxLength={3}
            onChange={(e) => scope({ currency: e.target.value.toUpperCase() })}
          />
        </label>
        <button disabled={!valid || creating} onClick={() => void createChat()}>
          {creating
            ? "Creating…"
            : pendingCreate.current
              ? "Retry conversation creation"
              : "New conversation"}
        </button>
      </div>
      <p>
        Changing entity/month/currency leaves this chat. Start or reopen a
        conversation in the chosen scope.{" "}
        <Link to="/demo/assistant">Open the separate Assistant demo</Link>.
      </p>
      {!valid && (
        <p role="alert">
          Select a valid authorized entity, Gregorian month and three-letter
          source currency.
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRefresh((n) => n + 1)}>
            Reload assistant
          </button>
        </p>
      )}
      {cap && !cap.configured && (
        <p role="status" className="assistant-notice">
          Model unavailable: an approved provider, model, privacy routing and
          budget must be configured. Conversations and preferences can still be
          managed. No demo answer will be substituted.
        </p>
      )}
      {cap?.configured && (
        <p>
          Configured model: {cap.model}. Only needed
          question/context/preferences and authorized fact labels are sent to
          the approved provider. Numerical answers are rendered from server
          facts.
        </p>
      )}
      <div className="assistant-layout">
        <aside aria-label="Saved conversations">
          <h2>Conversations</h2>
          {chats ? (
            chats.length ? (
              <ul>
                {chats.map((c) => (
                  <li key={c.id}>
                    <button
                      aria-current={c.id === id ? "true" : undefined}
                      onClick={() =>
                        setParams({
                          entityId: c.entityId,
                          month: c.month,
                          currency: c.currency,
                          conversationId: c.id,
                        })
                      }
                    >
                      {c.month} · {c.currency} ·{" "}
                      {new Date(c.createdAt).toLocaleString()} ·{" "}
                      {c.id.slice(0, 8)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No saved conversations.</p>
            )
          ) : (
            <p role="status">Loading conversations…</p>
          )}
          <button
            disabled={offset === 0}
            onClick={() => setOffset((n) => Math.max(0, n - 20))}
          >
            Previous conversations
          </button>
          <button
            disabled={offset + 20 >= total}
            onClick={() => setOffset((n) => n + 20)}
          >
            Older conversations
          </button>
        </aside>
        {valid &&
          (creating ? (
            <p role="status">Creating conversation…</p>
          ) : (
            <Chat
              key={`${entityId}:${month}:${currency}:${id}`}
              entityId={entityId}
              month={month}
              currency={currency}
              id={id}
              configured={cap?.configured === true}
              onDeleted={() => {
                scope({});
                setRefresh((n) => n + 1);
              }}
            />
          ))}
      </div>
    </section>
  );
}
function Chat({
  entityId,
  month,
  currency,
  id,
  configured,
  onDeleted,
}: {
  entityId: string;
  month: string;
  currency: string;
  id: string;
  configured: boolean;
  onDeleted: () => void;
}) {
  const [chat, setChat] = useState<ReadConversation>(),
    [question, setQuestion] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [confirm, setConfirm] = useState(false),
    [page, setPage] = useState<number | undefined>(undefined),
    [retry, setRetry] = useState(false);
  const request = useRef<AbortController | null>(null),
    sendRequest = useRef<
      { id: string; question: string; expectedVersion: number } | undefined
    >(undefined);
  useEffect(() => {
    const c = new AbortController();
    request.current = c;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const load = async () => {
      if (!id) return;
      try {
        const v = await api.read(id, c.signal, page);
        if (c.signal.aborted) return;
        if (
          v.entityId !== entityId ||
          v.month !== month ||
          v.currency !== currency
        )
          throw new Error(
            "Conversation has another scope. Reopen it from the saved list.",
          );
        setChat(v);
        if (
          sendRequest.current &&
          v.turns.some((t) => t.id === sendRequest.current?.id)
        ) {
          sendRequest.current = undefined;
          setRetry(false);
          setQuestion("");
        }
        if (v.turns.some((t) => t.status === "pending") && polls++ < 55)
          timer = setTimeout(() => void load(), 800);
      } catch (e) {
        if (!c.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Conversation unavailable.",
          );
      }
    };
    void load();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [id, entityId, month, currency, refresh, page]);
  async function act(action: (signal: AbortSignal) => Promise<void>) {
    const c = request.current!;
    setBusy(true);
    setError("");
    try {
      await action(c.signal);
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Request failed. Reload before retrying.",
        );
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  async function sendQuestion() {
    if (!chat) return;
    const payload = sendRequest.current || {
      id: crypto.randomUUID(),
      question: question.trim(),
      expectedVersion: chat.version,
    };
    sendRequest.current = payload;
    await act(async (signal) => {
      try {
        await api.send(id, payload, signal);
        if (signal.aborted) return;
        sendRequest.current = undefined;
        setRetry(false);
        setQuestion("");
        setPage(undefined);
        setRefresh((n) => n + 1);
      } catch (e) {
        if (!signal.aborted) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            sendRequest.current = undefined;
            setRetry(false);
          } else setRetry(true);
        }
        throw e;
      }
    });
  }
  const pending = chat?.turns.find((t) => t.status === "pending");
  return (
    <div className="assistant-main">
      {!id ? (
        <div className="assistant-empty">
          <h2>Start a scoped conversation</h2>
          <p>
            Use New conversation, then ask which customers owe the most, what
            remains on the saved checklist, or which saved subscriptions renew
            this month. Cash/revenue/profit require a complete ledger with a
            finance-approved mapping.
          </p>
        </div>
      ) : (
        <>
          <div className="assistant-chat-header">
            <h2>Conversation</h2>
            {chat && (
              <>
                <p>
                  Saved until {chat.expiresAt}. Replies below are historical;
                  asking again retrieves current authorized sources.
                </p>
                <button disabled={busy} onClick={() => setConfirm(true)}>
                  Delete conversation
                </button>
              </>
            )}
            {confirm && (
              <div role="dialog" aria-label="Confirm conversation deletion">
                <p>
                  Delete this conversation and all dependent turns? Retained
                  backups/provider records have separate lifecycles.
                </p>
                <button
                  disabled={busy || !chat}
                  onClick={() =>
                    void act(async (signal) => {
                      await api.remove(id, chat!.version, signal);
                      if (!signal.aborted) onDeleted();
                    })
                  }
                >
                  Confirm delete conversation
                </button>
                <button onClick={() => setConfirm(false)}>
                  Keep conversation
                </button>
              </div>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              setRefresh((n) => n + 1);
            }}
          >
            Refresh conversation
          </button>
          {!chat ? (
            <p role="status">Loading conversation…</p>
          ) : (
            <>
              <div className="assistant-turns" aria-live="polite">
                {!chat.turns.length && <p>No questions yet.</p>}
                {chat.turns.map((t) => (
                  <article key={t.id} className="assistant-turn">
                    <h3>You</h3>
                    <p className="assistant-question">{t.question}</p>
                    <p className="assistant-turn-meta">
                      {t.createdAt} · {t.model} · {t.policy}
                    </p>
                    {t.status === "pending" ? (
                      <p role="status">Answering from permitted sources…</p>
                    ) : t.answer ? (
                      <>
                        <h3>FinAI</h3>
                        <dl>
                          {t.answer.facts.map((f) => (
                            <div key={f.id}>
                              <dt>{f.label}</dt>
                              <dd>{exactValue(f)}</dd>
                            </div>
                          ))}
                        </dl>
                        {t.answer.notes.map((n, i) => (
                          <p key={i}>{n}</p>
                        ))}
                        <details>
                          <summary>Answer basis and sources</summary>
                          <p>{t.answer.basis}</p>
                          {t.answer.sources.map((s) => (
                            <div key={s.id} className="assistant-source">
                              <Link to={s.href}>{s.label}</Link>
                              <p>{s.basis}</p>
                              <p>
                                Source captured:{" "}
                                {s.capturedAt || "Saved operational records"} ·
                                Imported: {s.importedAt || "Not applicable"} ·
                                Retrieved: {s.retrievedAt}
                              </p>
                            </div>
                          ))}
                        </details>
                        <p className="assistant-turn-meta">
                          Answered {t.finishedAt} · Historical source values,
                          not a live feed.
                        </p>
                      </>
                    ) : (
                      <p role="status">
                        {t.status === "cancelled"
                          ? "Cancelled."
                          : `Answer unavailable (${t.failureCode || "FAILED"}). No financial result was fabricated. Refresh to review; a deliberately new question may incur another provider request.`}
                      </p>
                    )}
                  </article>
                ))}
              </div>
              <div>
                <button
                  disabled={busy || chat.offset === 0}
                  onClick={() => setPage(Math.max(0, chat.offset - 50))}
                >
                  Earlier turns
                </button>
                <button
                  disabled={
                    busy || chat.offset + chat.turns.length >= chat.total
                  }
                  onClick={() => setPage(chat.offset + 50)}
                >
                  Later turns
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setPage(undefined);
                    setRefresh((n) => n + 1);
                  }}
                >
                  Latest turns
                </button>
              </div>
              <form
                className="real-assistant-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendQuestion();
                }}
              >
                <label>
                  Ask FinAI
                  <textarea
                    aria-label="Ask FinAI"
                    value={question}
                    maxLength={2000}
                    disabled={busy || retry}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        if (
                          configured &&
                          !pending &&
                          !busy &&
                          (question.trim() || retry)
                        )
                          void sendQuestion();
                      }
                    }}
                  />
                </label>
                <p>
                  Enter sends; Shift+Enter adds a line. Do not include
                  credentials. Questions and completed answers are saved in
                  private server history.
                </p>
                <button
                  disabled={
                    !configured ||
                    busy ||
                    !!pending ||
                    (!retry && !question.trim())
                  }
                >
                  {busy
                    ? "Sending…"
                    : retry
                      ? "Retry same question"
                      : "Send question"}
                </button>
                {pending && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async (signal) => {
                        await api.cancel(id, pending.id, chat.version, signal);
                        if (!signal.aborted) setRefresh((n) => n + 1);
                      })
                    }
                  >
                    Cancel pending question
                  </button>
                )}
              </form>
            </>
          )}
        </>
      )}
      <Memory key={entityId} entityId={entityId} />
    </div>
  );
}
function Memory({ entityId }: { entityId: string }) {
  const [saved, setSaved] = useState<Preference>(),
    [detail, setDetail] = useState<"concise" | "detailed">("concise"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [refresh, setRefresh] = useState(0),
    [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null),
    newId = useRef(crypto.randomUUID());
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    setLoaded(false);
    api
      .preferences(entityId, c.signal)
      .then((v) => {
        if (c.signal.aborted) return;
        if (v.items.some((p) => p.entityId !== entityId))
          throw new Error("Preference scope mismatch.");
        const p = v.items[0];
        setSaved(p);
        setDetail(p?.detail || "concise");
        setNote(p?.note || "");
        setLoaded(true);
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [entityId, refresh]);
  async function act(forget = false) {
    const c = controller.current!;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (forget && saved) {
        await api.forget(saved, c.signal);
        newId.current = crypto.randomUUID();
      } else
        await api.save(
          saved?.id || newId.current,
          { entityId, detail, note, expectedVersion: saved?.version || 0 },
          c.signal,
        );
      if (!c.signal.aborted) {
        setConfirm(false);
        setNotice(
          forget
            ? "Preference forgotten. Future questions will not use it; past answers/provider requests and backups are separate."
            : "Preference saved for future questions in this entity.",
        );
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Preference change failed. Reload before retrying.",
        );
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="assistant-memory">
      <h2>Explicit preferences</h2>
      <p>
        Private to you and this entity. Concise shows up to3 facts; detailed up
        to12. Optional notes are untrusted preferences, never financial facts or
        permission. Saved preferences expire365 days after explicit save/edit.
        Nothing is silently learned from chat. Language translation and tone
        settings are not supported; only answer detail has a guaranteed
        rendering effect. Notes may guide permitted source/fact selection.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setRefresh((n) => n + 1);
            }}
          >
            Reload preferences
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act();
        }}
      >
        <label>
          Answer detail
          <select
            aria-label="Answer detail"
            value={detail}
            disabled={!loaded || busy}
            onChange={(e) =>
              setDetail(e.target.value as "concise" | "detailed")
            }
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label>
          Preference note
          <textarea
            aria-label="Preference note"
            value={note}
            maxLength={500}
            disabled={!loaded || busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button disabled={!loaded || busy}>
          {saved ? "Save preference changes" : "Save preference"}
        </button>
      </form>
      {saved && (
        <>
          <p>
            Version {saved.version} · updated {saved.updatedAt} · expires{" "}
            {saved.expiresAt}
          </p>
          <button disabled={busy} onClick={() => setConfirm(true)}>
            Forget preference
          </button>
        </>
      )}
      {confirm && (
        <div role="dialog" aria-label="Confirm forgetting preference">
          <p>Forget this preference for future questions?</p>
          <button disabled={busy} onClick={() => void act(true)}>
            Confirm forget preference
          </button>
          <button onClick={() => setConfirm(false)}>Keep preference</button>
        </div>
      )}
    </section>
  );
}
