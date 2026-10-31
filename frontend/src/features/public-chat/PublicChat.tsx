import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import { PageHeader } from "../../components/shared/Common";
import "./public-chat.css";

const catalogSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9._:/-]{1,200}$/),
        name: z.string().min(1).max(200),
      }),
    )
    .max(1000),
  retrievedAt: z.iso.datetime(),
  configured: z.boolean(),
  freeOnly: z.literal(true),
});
const answerSchema = z.strictObject({
  selectedModel: z.string(),
  model: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
});
type Message = { role: "user" | "assistant"; content: string; model?: string };
class ChatFailure extends Error {
  constructor(
    message: string,
    public reference?: string,
    public retrySeconds?: number,
  ) {
    super(message);
  }
}
async function read(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({
        message: z.string().min(1).max(500),
        requestId: z.uuid().optional(),
      })
      .safeParse(value);
    const wait = response.headers.get("retry-after");
    const seconds =
      response.status === 429 &&
      wait &&
      /^\d+$/.test(wait) &&
      Number(wait) >= 1 &&
      Number(wait) <= 300
        ? Number(wait)
        : undefined;
    throw new ChatFailure(
      error.success
        ? error.data.message
        : "Chat service is unavailable. Try again.",
      error.success ? error.data.requestId : undefined,
      seconds,
    );
  }
  return value;
}
export function PublicChat({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = useState<z.infer<typeof catalogSchema>>();
  const [model, setModel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState<string>();
  const [retryUntil, setRetryUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [focusRevision, setFocusRevision] = useState(0);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const chatRequest = useRef<AbortController | null>(null);
  const focusComposer = () => setFocusRevision((n) => n + 1);
  useEffect(() => {
    // A frame can run before React commits disabled=false. Focus only after
    // the requested render commits, so reply completion cannot lose focus.
    if (focusRevision > 0 && !pending) composer.current?.focus();
  }, [focusRevision, pending]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setClock(time);
      if (time >= retryUntil) setRetryUntil(0);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  const reload = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setCatalogError("");
    try {
      const value = catalogSchema.parse(
        await read(
          await fetch("/api/chat/models", {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12000),
            ]),
            credentials: "omit",
            cache: "no-store",
          }),
        ),
      );
      if (controller.signal.aborted) return;
      setCatalog(value);
      setModel((current) =>
        value.items.some((m) => m.id === current)
          ? current
          : value.items.find((m) => m.id === "openrouter/free")?.id ||
            value.items[0]?.id ||
            "",
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setCatalog(undefined);
        setCatalogError(
          e instanceof TypeError
            ? "Could not load models. Check your connection and reload models."
            : e instanceof Error && !(e instanceof z.ZodError)
              ? e.message
              : "OpenRouter returned an invalid model list.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => {
      listRequest.current?.abort();
      chatRequest.current?.abort();
    };
  }, [reload]);
  const available =
    catalog?.items.filter((m) =>
      (m.name + " " + m.id).toLowerCase().includes(search.toLowerCase()),
    ) || [];
  async function send(prompt?: string) {
    const text = (prompt ?? question).trim();
    if (
      pending ||
      chatRequest.current !== null ||
      retryUntil > Date.now() ||
      loading ||
      !catalog?.configured ||
      !available.some((m) => m.id === model) ||
      !text
    )
      return;
    const controller = new AbortController();
    chatRequest.current = controller;
    const choice = model;
    setQuestion(text);
    const history = [
      ...messages.slice(-10).map(({ role, content }) => ({
        role,
        content: content.slice(0, 4000),
      })),
      { role: "user" as const, content: text },
    ];
    while (history.reduce((sum, m) => sum + m.content.length, 0) > 12000)
      history.splice(0, 2);
    setPending(true);
    setError("");
    setReference(undefined);
    try {
      const result = answerSchema.parse(
        await read(
          await fetch("/api/chat/messages", {
            method: "POST",
            credentials: "omit",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(55000),
            ]),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: choice, messages: history }),
          }),
        ),
      );
      if (controller.signal.aborted) return;
      if (result.selectedModel !== choice)
        throw new Error(
          "The response did not match your selected model. Try again.",
        );
      setMessages((previous) => [
        ...previous.slice(-38),
        { role: "user", content: text },
        { role: "assistant", content: result.content, model: result.model },
      ]);
      setQuestion("");
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof ChatFailure) {
          setReference(e.reference);
          if (e.retrySeconds) {
            const time = Date.now();
            setClock(time);
            setRetryUntil(time + e.retrySeconds * 1000);
          }
        }
        setError(
          e instanceof TypeError
            ? "Could not reach the Assistant. Check your connection and try again."
            : e instanceof Error && !(e instanceof z.ZodError)
              ? e.name === "TimeoutError"
                ? "The model took too long. Try again or choose another free model."
                : e.message
              : "The model returned an invalid answer. Try another free model.",
        );
      }
    } finally {
      if (chatRequest.current === controller) {
        chatRequest.current = null;
        setPending(false);
        focusComposer();
      }
    }
  }
  function clear() {
    chatRequest.current?.abort();
    chatRequest.current = null;
    setPending(false);
    setMessages([]);
    setQuestion("");
    setError("");
    setReference(undefined);
    focusComposer();
  }
  const ready =
    !loading &&
    !retrySeconds &&
    !!catalog?.configured &&
    available.some((m) => m.id === model);
  const suggestions = [
    "Explain cash flow in simple terms",
    "What should I check on an invoice?",
    "Help me plan month-end close",
    "Draft a finance review checklist",
  ];
  const content = (
    <div className={`assistant model-assistant${embedded ? " embedded" : ""}`}>
      {!embedded && (
        <PageHeader
          title="FinAI Assistant"
          description="Ask a question and chat with your chosen free model."
        />
      )}
      <section className="assistant-chat-region" aria-label="FinAI chat">
        <div
          className="conversation public-chat-history"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
        >
          {!messages.length && !pending && (
            <div className="assistant-intro">
              <div className="assistant-orb">
                <Sparkles size={30} />
              </div>
              <h2>A little clarity goes a long way.</h2>
              <p>
                Choose a free model, ask a question, and keep the conversation
                going.
              </p>
            </div>
          )}
          {Array.from({ length: messages.length / 2 }, (_, index) => {
            const user = messages[index * 2],
              answer = messages[index * 2 + 1];
            return (
              <div className="conversation-turn" key={index}>
                <article className="question-bubble public-chat-message user">
                  {user.content}
                </article>
                <article className="answer-bubble public-chat-message assistant">
                  <div className="assistant-label">
                    <Sparkles size={14} />
                    FinAI
                    <span>
                      <strong>{answer.model}</strong>
                    </span>
                  </div>
                  <p>{answer.content}</p>
                </article>
              </div>
            );
          })}
          {pending && (
            <div className="conversation-turn">
              <div className="question-bubble">{question.trim()}</div>
              <div className="answer-bubble">
                <p role="status">Waiting for {model}…</p>
              </div>
            </div>
          )}
        </div>
        <section className="public-chat-models" aria-label="Model selection">
          <label>
            Chat model
            <select
              value={available.some((m) => m.id === model) ? model : ""}
              disabled={loading || pending || !available.length}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="" disabled>
                {loading ? "Loading free models…" : "Choose a free model"}
              </option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Find a model
            <input
              type="search"
              placeholder="Search free models"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={pending}
            />
          </label>
          <button onClick={() => void reload()} disabled={loading || pending}>
            Reload models
          </button>
        </section>
        {loading && <p role="status">Loading OpenRouter free models…</p>}
        {!loading && catalog && (
          <p className="public-chat-model-count">
            {catalog.items.length} free chat models listed
            {search ? ` · ${available.length} match your search` : ""}.
          </p>
        )}
        {catalogError && <p role="alert">{catalogError}</p>}
        {!loading && catalog && !catalog.items.length && (
          <p role="status">
            OpenRouter currently lists no free text-chat models. Reload models
            to check again.
          </p>
        )}
        {catalog && !catalog.configured && (
          <p role="alert">
            The server key is missing. Add OPENROUTER_API_KEY as a Secret in
            Vercel and redeploy. This chat does not need DATABASE_URL.
          </p>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {reference && (
              <small>
                Reference: <code>{reference}</code>
              </small>
            )}
          </div>
        )}
        {retrySeconds > 0 && (
          <p role="status">You can send again in {retrySeconds} seconds.</p>
        )}
        <div className="suggested-prompts">
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              disabled={!ready || pending}
              onClick={() => void send(prompt)}
            >
              {prompt}
              <ArrowRight size={13} />
            </button>
          ))}
        </div>
        <form
          className="assistant-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={composer}
            aria-label="Your message"
            rows={1}
            value={question}
            maxLength={4000}
            disabled={pending}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask FinAI…"
          />
          <button
            className="primary icon-btn"
            aria-label="Send message"
            disabled={!ready || pending || !question.trim()}
          >
            <Send size={17} />
          </button>
        </form>
        <div className="public-chat-actions">
          {pending && (
            <button
              type="button"
              onClick={() => {
                chatRequest.current?.abort();
                chatRequest.current = null;
                setPending(false);
                setReference(undefined);
                setError(
                  "Response cancelled. Your question was not sent again.",
                );
                focusComposer();
              }}
            >
              Stop response
            </button>
          )}
          <button type="button" onClick={clear}>
            Clear chat
          </button>
        </div>
        <p className="assistant-footnote">
          Free models · $0 input / output token price. Messages go to OpenRouter
          and its provider; no workspace records are accessed. Provider limits
          apply.
        </p>
      </section>
    </div>
  );
  return content;
}
