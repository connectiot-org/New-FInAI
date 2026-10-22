import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Field } from "../../components/ui/primitives";
import { SessionGate } from "../../components/SessionGate";
import { ApiError } from "../../lib/api";
import {
  loadAuthorizedEntities,
  type AuthorizedEntity,
} from "../../lib/authorized-entities";
import {
  checkPaymentDueDate,
  paymentInputSchema,
  type PaymentResult,
} from "./api";
import "./payment-due-date.css";
export function localCalendarToday() {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const initialFields = () => ({
  invoiceDate: "",
  preset: "30",
  customTerms: "",
  asOfDate: localCalendarToday(),
});
function failureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session has expired. Sign out and sign in again.";
    if (error.status === 403)
      return "You do not have permission for this request. Choose another company or sign in again.";
    if (error.status === 404)
      return "This company is unavailable. Reload companies or choose another.";
    if (error.status === 422)
      return "Check the dates and payment terms. The due date must be within years 0001–9999.";
    if (error.status === 429)
      return "Too many calculations. Please wait and try again.";
    if (
      error.status === 0 &&
      /inconsistent|invalid response/i.test(error.message)
    )
      return "The calculation response could not be verified. Please calculate again.";
    return "Unable to calculate. Check your connection and try again.";
  }
  return "The calculation response could not be verified. Please calculate again.";
}
function PaymentDueDateForm() {
  const [entities, setEntities] = useState<AuthorizedEntity[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [entityError, setEntityError] = useState(""),
    [reload, setReload] = useState(0);
  const [fields, setFields] = useState(initialFields),
    [result, setResult] = useState<PaymentResult>(),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const active = useRef<AbortController | undefined>(undefined),
    generation = useRef(0);
  const company = entities.some((entity) => entity.id === selected)
    ? selected
    : entities[0]?.id || "";
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);
    setEntityError("");
    loadAuthorizedEntities(controller.signal)
      .then((data) => {
        if (mounted) setEntities(data.items);
      })
      .catch((reason) => {
        if (mounted) {
          setEntities([]);
          setEntityError(failureMessage(reason));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [reload]);
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
    },
    [],
  );
  function invalidate() {
    generation.current++;
    active.current?.abort();
    active.current = undefined;
    setPending(false);
    setResult(undefined);
    setError("");
  }
  function change(name: keyof typeof fields, value: string) {
    invalidate();
    setFields((current) => ({ ...current, [name]: value }));
  }
  function reset() {
    invalidate();
    setFields(initialFields());
    setSelected(entities[0]?.id || "");
  }
  async function calculate() {
    if (active.current || !company || loading || entityError) return;
    const text =
      fields.preset === "custom" ? fields.customTerms : fields.preset;
    if (!/^\d+$/.test(text)) {
      setResult(undefined);
      setError("Enter a whole number of payment days from 0 through 365.");
      return;
    }
    const parsed = paymentInputSchema.safeParse({
      entityId: company,
      invoiceDate: fields.invoiceDate,
      termsDays: Number(text),
      asOfDate: fields.asOfDate,
    });
    if (!parsed.success) {
      setResult(undefined);
      setError(
        "Enter valid invoice and as-of dates (years 0001–9999) and whole-number payment days from 0 through 365.",
      );
      return;
    }
    const controller = new AbortController(),
      requestGeneration = ++generation.current;
    active.current = controller;
    setPending(true);
    setResult(undefined);
    setError("");
    try {
      const answer = await checkPaymentDueDate(parsed.data, controller.signal);
      if (
        !controller.signal.aborted &&
        generation.current === requestGeneration
      )
        setResult(answer);
    } catch (reason) {
      if (
        !controller.signal.aborted &&
        generation.current === requestGeneration
      )
        setError(failureMessage(reason));
    } finally {
      if (generation.current === requestGeneration) {
        active.current = undefined;
        setPending(false);
      }
    }
  }
  const count = result ? Math.abs(result.daysUntilDue) : 0;
  const status =
    result?.status === "due_today"
      ? "Due today"
      : result?.status === "overdue"
        ? `${count} ${count === 1 ? "day" : "days"} overdue`
        : `Due in ${count} ${count === 1 ? "day" : "days"}`;
  return (
    <>
      <PageHeader
        title="Payment due-date calculator"
        description="Calculate a payment deadline from the dates and terms you enter."
      />
      <div className="payment-due-date-layout">
        <section className="panel" aria-label="Payment dates and terms">
          <p className="muted">
            Terms use calendar days. Weekends and holidays are not adjusted. Net
            0 means the invoice date itself.
          </p>
          {loading && <p role="status">Loading companies…</p>}
          {entityError && (
            <p role="alert" className="notice error">
              {entityError}{" "}
              <button
                type="button"
                onClick={() => {
                  invalidate();
                  setReload((value) => value + 1);
                }}
              >
                Reload companies
              </button>
            </p>
          )}
          {!loading && !entityError && !entities.length && (
            <p className="notice">
              No authorized companies are available for this account.
            </p>
          )}
          <form
            className="payment-due-date-form"
            onSubmit={(event) => {
              event.preventDefault();
              void calculate();
            }}
          >
            <Field label="Company">
              <select
                aria-label="Company"
                value={company}
                disabled={loading || !!entityError || !entities.length}
                onChange={(event) => {
                  invalidate();
                  setSelected(event.target.value);
                }}
              >
                {!entities.length && <option value="">Choose a company</option>}
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Invoice date">
              <input
                aria-label="Invoice date"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                required
                value={fields.invoiceDate}
                onChange={(event) => change("invoiceDate", event.target.value)}
              />
            </Field>
            <Field label="Payment terms">
              <select
                aria-label="Payment terms"
                value={fields.preset}
                onChange={(event) => change("preset", event.target.value)}
              >
                {[0, 7, 14, 30, 45, 60, 90].map((days) => (
                  <option key={days} value={String(days)}>
                    Net {days}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Field>
            {fields.preset === "custom" && (
              <Field label="Custom payment days">
                <input
                  aria-label="Custom payment days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  step={1}
                  required
                  value={fields.customTerms}
                  onChange={(event) =>
                    change("customTerms", event.target.value)
                  }
                />
              </Field>
            )}
            <Field label="As-of date">
              <input
                aria-label="As-of date"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                required
                value={fields.asOfDate}
                onChange={(event) => change("asOfDate", event.target.value)}
              />
            </Field>
            <div className="payment-due-date-actions">
              <button
                className="primary"
                disabled={pending || loading || !!entityError || !company}
                type="submit"
              >
                {pending ? "Calculating…" : "Calculate"}
              </button>
              <button type="button" onClick={reset}>
                Reset
              </button>
            </div>
          </form>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {pending && <p role="status">Calculating due date…</p>}
        </section>
        {result && (
          <section
            className="panel payment-due-date-result"
            aria-label="Payment due-date result"
          >
            <h2>Payment due date</h2>
            <p
              role="status"
              className={
                result.status === "overdue" ? "notice warning" : "notice"
              }
            >
              {status}
            </p>
            <dl>
              <dt>Due date</dt>
              <dd>{result.dueDate}</dd>
              <dt>As-of date entered</dt>
              <dd>{result.asOfDate}</dd>
              <dt>Calendar day count</dt>
              <dd>{count}</dd>
            </dl>
            {result.status === "overdue" && (
              <p>Based on the dates entered; payment status is not checked.</p>
            )}
          </section>
        )}
      </div>
      <p className="muted">
        This calculation does not check payment or determine contractual or
        legal obligations.
      </p>
    </>
  );
}
export function PaymentDueDate() {
  return (
    <SessionGate title="Sign in to FinAI">
      <PaymentDueDateForm />
    </SessionGate>
  );
}
