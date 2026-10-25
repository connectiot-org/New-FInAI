import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import { command, useAppDispatch, useDemo } from "../store";
import { inScope, metrics, money } from "../demo/selectors";
import { PageHeader } from "../components/shared/Common";
import { Permission, useToast } from "../components/ui";
interface Answer {
  question: string;
  text: string;
  evidence: { label: string; to: string }[];
  proposal?: { task: string; entity: string; title: string };
  approved?: boolean;
}
export function Assistant({
  embedded = false,
  onNavigate,
}: {
  embedded?: boolean;
  onNavigate?: () => void;
}) {
  const s = useDemo(),
    dispatch = useAppDispatch(),
    toast = useToast(),
    [input, setInput] = useState(""),
    [answers, setAnswers] = useState<Answer[]>([]);
  const suggestions = [
    "What is our cash balance?",
    "Which invoices are outstanding?",
    "What needs attention for close?",
    "Prepare a close task for review",
  ];
  function ask(question: string) {
    if (!question.trim()) return;
    const q = question.toLowerCase(),
      m = metrics(s);
    let answer: Answer = {
      question,
      text: "This demo supports cash, revenue, expenses, outstanding invoices, and close tasks. Choose one of the example questions below. No model or external service is connected.",
      evidence: [],
    };
    if (/cash|revenue|expense/.test(q)) {
      answer = {
        question,
        text: `For the active entity and period: closing cash is ${money(m.cash)}, revenue is ${money(m.revenue)}, and expenses are ${money(m.expenses)}. Net income is ${money(m.profit)}. These totals come from posted fixture journals.`,
        evidence: [
          { label: "Cash ledger", to: "/accounting/ledger?account=1000" },
          { label: "Profit & loss", to: "/reports/profit-and-loss" },
        ],
      };
    } else if (/invoice|receivable/.test(q)) {
      const list = s.invoices.filter(
        (i) => inScope(s, i) && i.status !== "Draft" && i.paid < i.amount,
      );
      answer = {
        question,
        text: `${list.length} invoices in the selected period are outstanding, totaling ${money(list.reduce((v, i) => v + i.amount - i.paid, 0))}. Closing receivables are ${money(m.receivables)}; a monthly closing balance also includes earlier open items.`,
        evidence: list.slice(0, 4).map((i) => ({
          label: `${i.id} · ${money(i.amount - i.paid)}`,
          to: `/receivables/invoices/${i.id}`,
        })),
      };
    } else if (/close|task/.test(q)) {
      const tasks = s.tasks.filter(
          (t) =>
            t.entity === s.entity &&
            t.due.startsWith(s.period === "all" ? "2026-09" : s.period),
        ),
        pending = tasks.filter((t) => t.status !== "Approved"),
        task = tasks.find((t) => t.status === "To do");
      answer = {
        question,
        text: `${pending.length} of ${tasks.length} close tasks still need approval. ${task ? `Next task: ${task.title}.` : "No tasks remain to complete."}`,
        evidence: [{ label: "Close checklist", to: "/close" }],
        proposal:
          /prepare|propos/.test(q) && task
            ? { task: task.id, entity: s.entity, title: task.title }
            : undefined,
      };
    }
    setAnswers((v) => [...v, answer]);
    setInput("");
  }
  return (
    <div className={embedded ? "assistant embedded" : "assistant"}>
      {!embedded && (
        <PageHeader
          title="FinAI Assistant demo"
          description="Explore your books with answers grounded in the demo ledger."
        />
      )}
      <div className="assistant-disclaimer">
        <Sparkles size={14} />
        <strong>Demo responses</strong>
        <span>Deterministic local answers · No LLM connection</span>
      </div>
      <p>
        <Link to="/workspace/assistant" onClick={onNavigate}>
          Open the authenticated FinAI Assistant
        </Link>{" "}
        for model-backed answers from authorized records.
      </p>
      {!answers.length && (
        <div className="assistant-intro">
          <div className="assistant-orb">
            <Sparkles size={30} />
          </div>
          <h2>A little clarity goes a long way.</h2>
          <p>
            Ask about your numbers, find supporting records,
            <br />
            or preview a local action before approving it.
          </p>
        </div>
      )}
      <div className="conversation" aria-live="polite">
        {answers.map((a, i) => (
          <div className="conversation-turn" key={i}>
            <div className="question-bubble">{a.question}</div>
            <div className="answer-bubble">
              <div className="assistant-label">
                <Sparkles size={14} />
                FinAI<span>Demo</span>
              </div>
              <p>{a.text}</p>
              <div className="evidence-links">
                {a.evidence.map((e) => (
                  <Link onClick={onNavigate} key={e.to} to={e.to}>
                    {e.label}
                    <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
              {a.proposal && (
                <div className="proposal">
                  <h3>Proposed demo action</h3>
                  <p>
                    Mark “{a.proposal.title}” complete and save a local review
                    note. No approval is implied; the review step stays
                    separate.
                  </p>
                  {a.approved ? (
                    <p className="success-text">
                      Demo action approved and recorded.
                    </p>
                  ) : (
                    <Permission>
                      <button
                        className="primary"
                        disabled={
                          a.proposal.entity !== s.entity ||
                          s.tasks.find((t) => t.id === a.proposal?.task)
                            ?.status !== "To do"
                        }
                        onClick={() => {
                          dispatch(
                            command({
                              kind: "taskStep",
                              id: a.proposal!.task,
                              step: "complete",
                              evidence:
                                "Completed with explicitly approved deterministic assistant demo proposal",
                            }),
                          );
                          setAnswers((v) =>
                            v.map((item, index) =>
                              index === i ? { ...item, approved: true } : item,
                            ),
                          );
                          toast("Approved demo action recorded in audit log");
                        }}
                      >
                        Approve demo action
                      </button>
                    </Permission>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="suggested-prompts">
        {suggestions.map((q) => (
          <button key={q} onClick={() => ask(q)}>
            {q}
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          aria-label="Ask FinAI"
          placeholder="Ask about this demo workspace…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="primary icon-btn"
          aria-label="Send question"
          disabled={!input.trim()}
        >
          <Send size={17} />
        </button>
      </form>
      <p className="assistant-footnote">
        Answers use the active entity and accounting period. Always review
        supporting records.
      </p>
    </div>
  );
}
