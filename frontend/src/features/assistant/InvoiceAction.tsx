import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { request, binary } from "../payables/api";
import type { InvoiceProposal } from "./api";

const resultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("transition"),
    id: z.uuid(),
    state: z.enum(["review", "verify", "approve", "approved", "rejected"]),
    version: z.number().int().positive(),
  }),
  z.strictObject({ kind: z.literal("export"), id: z.uuid() }),
]);
type Command = {
  operationId: string;
  entityId: string;
  expectedVersion: number;
  action: InvoiceProposal["action"];
  reason?: string;
};

export function InvoiceAction({ proposal: p }: { proposal: InvoiceProposal }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [result, setResult] = useState<z.infer<typeof resultSchema>>();
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null),
    frozen = useRef<Command | null>(null),
    sending = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  async function confirm() {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || sending.current || blocked || result)
      return;
    frozen.current ||= {
      operationId: p.operationId,
      entityId: p.entityId,
      expectedVersion: p.expectedVersion,
      action: p.action,
      ...(p.reasonRequired ? { reason: reason.trim() } : {}),
    };
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await request(
        `/invoices/${p.invoiceId}/assistant-actions`,
        resultSchema,
        { method: "POST", body: frozen.current, signal },
      );
      if (signal.aborted) return;
      if (value.kind === "transition" && value.id !== p.invoiceId)
        throw new Error(
          "Invoice result scope mismatch. Open the source to verify.",
        );
      setResult(value);
      setOpen(false);
    } catch (e) {
      if (!signal.aborted) {
        const status = (e as { status?: number }).status;
        const terminal =
          !!status &&
          status >= 400 &&
          status < 500 &&
          ![408, 429].includes(status);
        setBlocked(terminal);
        setError(
          `${e instanceof Error ? e.message : "Invoice command could not be confirmed."} ${terminal ? "Open the current invoice before proposing another action." : "The outcome is uncertain. Retry this same confirmation to safely recover its recorded result."}`,
        );
      }
    } finally {
      sending.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="assistant-invoice-action"
      aria-label={`Proposed action: ${p.title}`}
    >
      <h4>
        {p.title} · {p.reference}
      </h4>
      <p>{p.description}</p>
      <Link
        to={`/workspace/payables/invoices/${p.invoiceId}?entityId=${p.entityId}`}
      >
        Open current invoice
      </Link>
      {result ? (
        <p role="status">
          {result.kind === "transition"
            ? `Recorded: ${result.state}, version ${result.version}. Open the invoice for its current state.`
            : "Accounting export prepared. This does not record a payment or posting."}
        </p>
      ) : (
        <button disabled={busy || blocked} onClick={() => setOpen(true)}>
          {frozen.current ? "Review retry" : "Review proposed action"}
        </button>
      )}
      {result?.kind === "export" && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await binary(`/exports/${result.id}/file`);
            } catch (e) {
              if (!controller.current?.signal.aborted)
                setError(
                  e instanceof Error ? e.message : "Export download failed.",
                );
            } finally {
              if (!controller.current?.signal.aborted) setBusy(false);
            }
          }}
        >
          Download accounting CSV
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {open && (
        <dialog
          ref={dialog}
          aria-label="Confirm invoice action"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setOpen(false);
          }}
        >
          <h3>{p.title}</h3>
          <p>
            Invoice {p.reference} · revision {p.revision} · version{" "}
            {p.expectedVersion}
          </p>
          <p>
            Confirm this decision for your signed-in account. The server checks
            the current invoice and your assignment before recording it.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {p.reasonRequired && (
              <label>
                Reason
                <textarea
                  autoFocus
                  required
                  maxLength={200}
                  value={reason}
                  disabled={busy || !!frozen.current}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <button
              type="submit"
              disabled={busy || blocked || (p.reasonRequired && !reason.trim())}
            >
              {busy
                ? "Confirming…"
                : frozen.current
                  ? "Retry same confirmation"
                  : "Confirm invoice action"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </dialog>
      )}
    </section>
  );
}
