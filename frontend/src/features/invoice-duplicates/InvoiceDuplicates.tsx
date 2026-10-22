import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SessionGate } from "../../components/SessionGate";
import { Field } from "../../components/ui";
import { PageHeader } from "../../components/shared/Common";
import {
  invoiceApi,
  downloadCsv,
  reportCsv,
  template,
  type CheckResult,
} from "./api";
import "./invoice-duplicates.css";

function FileCheck({ entityId }: { entityId: string }) {
  const [file, setFile] = useState<{ name: string; csv: string }>();
  const [result, setResult] = useState<CheckResult>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [offset, setOffset] = useState(0);
  const generation = useRef(0),
    request = useRef<AbortController | undefined>(undefined),
    input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  function reset() {
    generation.current++;
    request.current?.abort();
    request.current = undefined;
    setFile(undefined);
    setResult(undefined);
    setError("");
    setPending(false);
    setReading(false);
    setOffset(0);
    setOnlyFlagged(true);
  }
  async function choose(selected?: File) {
    reset();
    if (!selected) return;
    const version = generation.current;
    if (
      !/\.csv$/i.test(selected.name) ||
      selected.size === 0 ||
      selected.size > 131072
    ) {
      setError(
        "Choose a non-empty UTF-8 .csv file up to 128 KiB (500 invoice records maximum).",
      );
      return;
    }
    setReading(true);
    try {
      const csv = new TextDecoder("utf-8", { fatal: true }).decode(
        await selected.arrayBuffer(),
      );
      if (version === generation.current) setFile({ name: selected.name, csv });
    } catch {
      if (version === generation.current)
        setError(
          "Cannot read this file as UTF-8. Export it as UTF-8 CSV and try again.",
        );
    } finally {
      if (version === generation.current) setReading(false);
    }
  }
  async function check() {
    if (!file || request.current) return;
    const version = generation.current,
      controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    setResult(undefined);
    try {
      const data = await invoiceApi.check(
        entityId,
        file.csv,
        controller.signal,
      );
      if (version === generation.current && !controller.signal.aborted) {
        setResult(data);
        setOffset(0);
        setOnlyFlagged(true);
      }
    } catch (e) {
      if (version === generation.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Check failed. Try again.");
    } finally {
      if (version === generation.current) {
        request.current = undefined;
        setPending(false);
      }
    }
  }
  const rows =
    result?.rows.filter((r) => !onlyFlagged || r.group !== null) || [];
  return (
    <>
      <section
        className="panel invoice-check-upload"
        aria-label="Upload invoice CSV"
      >
        <div>
          <h2>Check an invoice export</h2>
          <p>
            Select one company and upload its invoices. Supplier IDs must be
            stable IDs from your own system.
          </p>
        </div>
        <Field label="Invoice CSV file">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            aria-label="Invoice CSV file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </Field>
        <p id="csv-limits" className="muted">
          UTF-8 CSV · up to 128 KiB · 500 invoices · YYYY-MM-DD dates ·
          non-negative amounts with up to two decimals
        </p>
        <p className="invoice-csv-headers">
          Required headers:{" "}
          <code>
            supplier_id,supplier_name,invoice_number,invoice_date,amount,currency
          </code>
        </p>
        <div className="invoice-check-actions">
          <button
            className="primary"
            disabled={!file || pending || reading}
            onClick={() => void check()}
          >
            {pending ? "Checking…" : "Check for duplicates"}
          </button>
          <button
            onClick={() => {
              reset();
              if (input.current) input.current.value = "";
            }}
          >
            Clear file and results
          </button>
          <button
            onClick={() => downloadCsv(template, "finai-invoice-template.csv")}
          >
            Download sample CSV
          </button>
        </div>
        {file && <p className="muted">Selected: {file.name}</p>}
        {reading && <p role="status">Reading file…</p>}
        {pending && <p role="status">Checking invoice references…</p>}
        {error && (
          <p role="alert" className="notice error">
            {error} No report was confirmed. Correct the file or retry.
          </p>
        )}
      </section>
      {result && (
        <section
          className="panel invoice-check-results"
          aria-label="Invoice check results"
        >
          <div className="invoice-check-summary" role="status">
            <div>
              <strong>{result.summary.rowCount}</strong>
              <span>Invoices checked</span>
            </div>
            <div>
              <strong>{result.summary.groupCount}</strong>
              <span>Possible duplicate groups</span>
            </div>
            <div>
              <strong>{result.summary.flaggedRowCount}</strong>
              <span>Invoices to review</span>
            </div>
          </div>
          {result.summary.groupCount === 0 && (
            <p className="notice">
              No possible duplicates found in this file using the matching rule.
            </p>
          )}
          <div className="invoice-check-actions">
            <label>
              <input
                type="checkbox"
                checked={onlyFlagged}
                onChange={(e) => {
                  setOnlyFlagged(e.target.checked);
                  setOffset(0);
                }}
              />{" "}
              Show possible duplicates only
            </label>
            <button
              onClick={() =>
                downloadCsv(reportCsv(result), "finai-invoice-check.csv")
              }
            >
              Download full report
            </button>
          </div>
          <p className="muted">
            Matching: exact supplier ID + invoice number ignoring letter case
            and outer spaces. All rows in a matching group are flagged. Compare
            amounts, currencies and dates before taking action.
          </p>
          {!!rows.length && (
            <div className="invoice-check-table">
              <table>
                <thead>
                  <tr>
                    <th>CSV record</th>
                    <th>Supplier / ID</th>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Review group</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(offset, offset + 20).map((r) => (
                    <tr key={r.recordNumber}>
                      <td>{r.recordNumber}</td>
                      <td>
                        {r.supplierName}
                        <small>{r.supplierId}</small>
                      </td>
                      <td>{r.invoiceNumber}</td>
                      <td>{r.invoiceDate}</td>
                      <td>
                        {r.amount} {r.currency}
                      </td>
                      <td>
                        {r.group === null
                          ? "No match"
                          : `Group ${r.group} · ${r.groupSize} invoices`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="invoice-check-actions">
            <button
              disabled={offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 20))}
            >
              Previous results
            </button>
            <span>
              {rows.length
                ? `${offset + 1}–${Math.min(offset + 20, rows.length)} of ${rows.length}`
                : "0 matching records"}
            </span>
            <button
              disabled={offset + 20 >= rows.length}
              onClick={() => setOffset((v) => v + 20)}
            >
              Next results
            </button>
          </div>
          <p className="muted">
            The report includes all uploaded records. Spreadsheet formula-like
            cells are escaped for safer opening. Results clear when you leave or
            refresh this page.
          </p>
        </section>
      )}
    </>
  );
}
function Checker() {
  const [params, setParams] = useSearchParams();
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const requested = params.get("entity") || "",
    entityId = entities.some((v) => v.id === requested)
      ? requested
      : requested
        ? ""
        : entities[0]?.id || "";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setEntities([]);
    invoiceApi
      .entities(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEntities(data.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Cannot load companies.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <>
      <PageHeader
        title="Invoice duplicate checker"
        description="Find repeated invoice references before your next review."
      />
      <p className="notice">
        Checks one CSV at a time. Files and results are not saved. Possible
        matches need manual review; the checker does not compare stored
        invoices.
      </p>
      <section className="panel invoice-check-company">
        <Field label="Invoice check company">
          <select
            aria-label="Invoice check company"
            value={entityId}
            disabled={loading || !!error}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set("entity", e.target.value);
              setParams(next);
            }}
          >
            {!entityId && (
              <option value="">
                {loading
                  ? "Loading companies…"
                  : "Select an authorized company"}
              </option>
            )}
            {entities.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </section>
      {loading && <p role="status">Loading companies…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}{" "}
          <button onClick={() => setRetry((v) => v + 1)}>
            Retry companies
          </button>
        </p>
      )}
      {!loading && !error && !entities.length && (
        <p className="notice">
          No authorized companies are available for this account.
        </p>
      )}
      {!loading && !error && requested && !entityId && (
        <p className="notice error" role="alert">
          This company is unavailable. Select an authorized company.
        </p>
      )}
      {!loading && !error && entityId && (
        <FileCheck key={entityId} entityId={entityId} />
      )}
    </>
  );
}
export function InvoiceDuplicates() {
  return (
    <SessionGate title="Sign in to FinAI">
      <Checker />
    </SessionGate>
  );
}
