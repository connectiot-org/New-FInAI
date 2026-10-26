import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { BrandMark } from "../../components/shared/BrandMark";
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
async function read(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({ message: z.string().min(1).max(500) })
      .safeParse(value);
    throw new Error(
      error.success
        ? error.data.message
        : "Chat service is unavailable. Try again.",
    );
  }
  return value;
}
export function PublicChat() {
  const [catalog, setCatalog] = useState<z.infer<typeof catalogSchema>>();
  const [model, setModel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const listRequest = useRef<AbortController | null>(null);
  const chatRequest = useRef<AbortController | null>(null);
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
          e instanceof Error && !(e instanceof z.ZodError)
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
  async function send() {
    if (
      pending ||
      loading ||
      !catalog?.configured ||
      !available.some((m) => m.id === model) ||
      !question.trim()
    )
      return;
    const controller = new AbortController();
    chatRequest.current = controller;
    const choice = model,
      text = question.trim();
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
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && !(e instanceof z.ZodError)
            ? e.name === "TimeoutError"
              ? "The model took too long. Try again or choose another free model."
              : e.message
            : "The model returned an invalid answer. Try another free model.",
        );
    } finally {
      if (chatRequest.current === controller) {
        chatRequest.current = null;
        setPending(false);
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
  }
  return (
    <div className="public-chat">
      <header>
        <Link className="brand" to="/">
          <BrandMark />
          FinAI
        </Link>
        <Link to="/workspace/assistant/records">
          Financial workspace Assistant
        </Link>
      </header>
      <main>
        <h1>FinAI Assistant</h1>
        <p>
          Choose a free model and start chatting. No sign-in or database
          required.
        </p>
        <p className="public-chat-price">
          OpenRouter free models · $0 input / $0 output token price
        </p>
        <p className="public-chat-note">
          Messages go to OpenRouter and the model provider. This test chat has
          no access to your financial records. Chats stay on this page; provider
          rate limits and retention policies apply.
        </p>
        <section className="public-chat-models" aria-label="Model selection">
          <label>
            Find a model
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={pending}
            />
          </label>
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
          <button onClick={() => void reload()} disabled={loading || pending}>
            Reload models
          </button>
        </section>
        {loading && <p role="status">Loading OpenRouter free models…</p>}
        {!loading && catalog && (
          <p>
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
        <div
          className="public-chat-history"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
        >
          {!messages.length && (
            <p>Say hello or ask a question to try your chosen model.</p>
          )}
          {messages.map((m, index) => (
            <article className={`public-chat-message ${m.role}`} key={index}>
              <strong>{m.role === "user" ? "You" : m.model}</strong>
              <p>{m.content}</p>
            </article>
          ))}
          {pending && <p role="status">Waiting for {model}…</p>}
        </div>
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label>
            Your message
            <textarea
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
              placeholder="Ask anything to test the selected free model…"
            />
          </label>
          <div className="public-chat-actions">
            <button
              className="primary"
              disabled={
                pending ||
                loading ||
                !catalog?.configured ||
                !available.some((m) => m.id === model) ||
                !question.trim()
              }
            >
              Send message
            </button>
            {pending && (
              <button
                type="button"
                onClick={() => {
                  chatRequest.current?.abort();
                  chatRequest.current = null;
                  setPending(false);
                  setError(
                    "Response cancelled. Your question was not sent again.",
                  );
                }}
              >
                Stop response
              </button>
            )}
            <button type="button" onClick={clear}>
              Clear chat
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
