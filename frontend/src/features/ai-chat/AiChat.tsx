import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Field } from "../../components/ui/primitives";
import { SessionGate } from "../../components/SessionGate";
import {
  loadAuthorizedEntities,
  type AuthorizedEntity,
} from "../../lib/authorized-entities";
import { ApiError } from "../../lib/api";
import {
  loadFreeModels,
  sendPrompt,
  type FreeModel,
  type AiReply,
} from "./api";
import "./ai-chat.css";
function message(error: unknown) {
  if (error instanceof ApiError && error.status !== 0) {
    if (error.status === 401) return "Your session expired. Sign in again.";
    if (error.status === 403 || error.status === 404)
      return "This request is not permitted for this company. Reload companies or contact your administrator.";
    return error.message;
  }
  return "The AI request could not be confirmed. Check your connection and wait before trying again.";
}
function ChatForm() {
  const [entities, setEntities] = useState<AuthorizedEntity[]>([]),
    [entity, setEntity] = useState("");
  const [entityLoading, setEntityLoading] = useState(true),
    [entityError, setEntityError] = useState(""),
    [entityRetry, setEntityRetry] = useState(0);
  const company =
    entities.find((e) => e.id === entity)?.id || entities[0]?.id || "";
  const [models, setModels] = useState<FreeModel[]>([]),
    [selected, setSelected] = useState("");
  const [modelLoading, setModelLoading] = useState(false),
    [modelError, setModelError] = useState(""),
    [modelRetry, setModelRetry] = useState(0);
  const [search, setSearch] = useState(""),
    [prompt, setPrompt] = useState(""),
    [reply, setReply] = useState<AiReply>();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const active = useRef<AbortController | undefined>(undefined),
    generation = useRef(0);
  const filtered = models.filter((m) =>
    `${m.name} ${m.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const model = filtered.find((m) => m.id === selected) || filtered[0];
  function invalidate() {
    generation.current++;
    active.current?.abort();
    active.current = undefined;
    setPending(false);
    setReply(undefined);
    setError("");
  }
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setEntityLoading(true);
    setEntityError("");
    loadAuthorizedEntities(controller.signal)
      .then((data) => {
        if (mounted) setEntities(data.items);
      })
      .catch((e) => {
        if (mounted) {
          setEntities([]);
          setEntityError(message(e));
        }
      })
      .finally(() => {
        if (mounted) setEntityLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [entityRetry]);
  useEffect(() => {
    if (!company) {
      setModels([]);
      return;
    }
    const controller = new AbortController();
    let mounted = true;
    setModelLoading(true);
    setModelError("");
    setModels([]);
    loadFreeModels(company, controller.signal)
      .then((data) => {
        if (mounted) setModels(data);
      })
      .catch((e) => {
        if (mounted) setModelError(message(e));
      })
      .finally(() => {
        if (mounted) setModelLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [company, modelRetry]);
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
    },
    [],
  );
  async function send() {
    if (
      active.current ||
      !company ||
      !model ||
      modelLoading ||
      entityLoading ||
      entityError ||
      modelError
    )
      return;
    const text = prompt.trim();
    if (
      !text ||
      text.length > 4000 ||
      /[\uD800-\uDFFF]/u.test(text) ||
      text.includes("\0")
    ) {
      setError("Enter a prompt of 1–4000 characters.");
      return;
    }
    const controller = new AbortController(),
      revision = ++generation.current;
    active.current = controller;
    setPending(true);
    setError("");
    setReply(undefined);
    try {
      const result = await sendPrompt(
        { entityId: company, modelId: model.id, prompt: text },
        controller.signal,
      );
      if (!controller.signal.aborted && generation.current === revision)
        setReply(result);
    } catch (e) {
      if (!controller.signal.aborted && generation.current === revision)
        setError(message(e));
    } finally {
      if (generation.current === revision) {
        active.current = undefined;
        setPending(false);
      }
    }
  }
  return (
    <>
      <PageHeader
        title="AI chat"
        description="Choose a free model and ask a question."
      />
      <div className="ai-chat-layout">
        <section className="panel">
          <p className="notice">
            Only free models are enabled. Availability and quotas are controlled
            by OpenRouter. Replies may be limited in length.
          </p>
          {entityLoading && <p role="status">Loading companies…</p>}
          {entityError && (
            <p role="alert" className="notice error">
              {entityError}{" "}
              <button
                onClick={() => {
                  invalidate();
                  setEntityRetry((v) => v + 1);
                }}
              >
                Reload companies
              </button>
            </p>
          )}
          {!entityLoading && !entityError && !entities.length && (
            <p>No authorized companies are available for this account.</p>
          )}
          <form
            className="ai-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Field label="Company">
              <select
                aria-label="AI company"
                value={company}
                disabled={entityLoading || !!entityError || !entities.length}
                onChange={(e) => {
                  invalidate();
                  setEntity(e.target.value);
                  setSelected("");
                }}
              >
                {!entities.length && <option value="">Choose a company</option>}
                {entities.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Search free models">
              <input
                value={search}
                maxLength={200}
                onChange={(e) => {
                  invalidate();
                  setSearch(e.target.value);
                }}
                placeholder="Model name or ID"
              />
            </Field>
            <Field label="Free model">
              <select
                aria-label="Free model"
                value={model?.id || ""}
                disabled={modelLoading || !filtered.length}
                onChange={(e) => {
                  invalidate();
                  setSelected(e.target.value);
                }}
              >
                {!filtered.length && (
                  <option value="">
                    {modelLoading
                      ? "Loading models…"
                      : "No matching free models"}
                  </option>
                )}
                {filtered.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.id}
                  </option>
                ))}
              </select>
            </Field>
            {modelLoading && <p role="status">Loading free models…</p>}
            {modelError && (
              <p role="alert" className="notice error">
                {modelError}
              </p>
            )}
            <button
              type="button"
              disabled={!company || modelLoading}
              onClick={() => {
                invalidate();
                setModelRetry((v) => v + 1);
              }}
            >
              Reload models
            </button>
            <Field label="Your prompt">
              <textarea
                aria-label="Your prompt"
                rows={6}
                required
                maxLength={4000}
                aria-describedby="ai-privacy"
                value={prompt}
                onChange={(e) => {
                  invalidate();
                  setPrompt(e.target.value);
                }}
              />
            </Field>
            <p className="muted" id="ai-privacy">
              Your prompt is sent to OpenRouter and its model provider. Company
              records are not attached. Avoid sensitive information. FinAI does
              not save chat history; provider retention follows their policies.
            </p>
            <div className="ai-chat-actions">
              <button
                className="primary"
                disabled={
                  pending ||
                  entityLoading ||
                  modelLoading ||
                  !!entityError ||
                  !!modelError ||
                  !model ||
                  !company
                }
                type="submit"
              >
                {pending ? "Sending…" : "Send message"}
              </button>
              <button
                type="button"
                onClick={() => {
                  invalidate();
                  setPrompt("");
                }}
              >
                Reset
              </button>
              {pending && (
                <button
                  type="button"
                  onClick={() => {
                    invalidate();
                    setError(
                      "Request canceled. It may already have reached the provider; wait before trying again.",
                    );
                  }}
                >
                  Cancel request
                </button>
              )}
            </div>
          </form>
          {pending && <p role="status">Waiting for the free model…</p>}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </section>
        {reply && (
          <section className="panel" aria-label="AI response">
            <h2>AI response</h2>
            <p className="muted">
              {models.find((m) => m.id === reply.modelId)?.name ||
                reply.modelId}
            </p>
            <div className="ai-reply">{reply.reply}</div>
            <p className="muted">
              AI responses can be inaccurate. Review before use.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
export function AiChat() {
  return (
    <SessionGate title="Sign in to FinAI">
      <ChatForm />
    </SessionGate>
  );
}
