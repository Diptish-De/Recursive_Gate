"use client";

import {
  Activity, BookOpen, Bot, CircleCheck, CircleX, Clock, Database, Download, Info, Lock, Scale, ScrollText, ShieldX,
  TriangleAlert, UserCheck,
} from "lucide-react";
import { useEffect } from "react";
import { rulebook } from "@/lib/rules";
import type { Decision, PendingAction, RuleResult } from "@/lib/types";
import { formatCall } from "./format";
import { VERDICT } from "./verdict";

export type ProofTab = "proof" | "rules";

type Props = {
  tab: ProofTab;
  onTab: (tab: ProofTab) => void;
  audit: Decision[];
  pending: PendingAction[];
  names: Record<string, string>;
  focus: { id: string; n: number } | null;
  reviewing: string | null;
  onReview: (pendingId: string, approve: boolean) => void;
};

const RULE_TEXT = Object.fromEntries(rulebook.map((r) => [r.id, r.description]));

// Every gate decision, newest first, with the full proof. This is also the audit log.
export function ProofPanel({ tab, onTab, audit, pending, names, focus, reviewing, onReview }: Props) {
  // Bring a decision into view when its chip in the chat is clicked.
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`decision-${focus.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  return (
    <section className="flex min-h-0 flex-col bg-panel/40">
      <div className="flex items-center gap-1 border-b border-line px-3">
        <TabButton active={tab === "proof"} onClick={() => onTab("proof")} icon={<Activity className="size-4" />} label="Live proof" count={audit.length} />
        <TabButton active={tab === "rules"} onClick={() => onTab("rules")} icon={<BookOpen className="size-4" />} label="Rulebook" count={rulebook.length} />
        <button
          onClick={() => exportAudit(audit, pending)}
          disabled={audit.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download className="size-3.5" /> Export audit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "rules" ? (
          <Rulebook />
        ) : audit.length === 0 ? (
          <HowItWorks />
        ) : (
          <div className="space-y-3 p-4">
            {[...audit].reverse().map((d) => (
              <DecisionCard
                key={d.id}
                d={d}
                pending={pending.find((p) => p.id === d.pendingId)}
                name={names[d.requesterId]}
                focused={focus?.id === d.id}
                reviewing={reviewing}
                onReview={onReview}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-3 text-sm transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}
    >
      {icon}
      {label}
      <span className="rounded-full bg-card px-1.5 py-px text-xs tabular-nums text-muted">{count}</span>
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
    </button>
  );
}

function DecisionCard({
  d, pending, name, focused, reviewing, onReview,
}: { d: Decision; pending?: PendingAction; name?: string; focused: boolean; reviewing: string | null; onReview: Props["onReview"] }) {
  const v = VERDICT[d.verdict];
  return (
    <article
      id={`decision-${d.id}`}
      className={`animate-[fade-in_0.35s_ease-out] overflow-hidden rounded-xl border bg-card transition-shadow ${focused ? "border-accent/60 ring-2 ring-accent/40" : "border-line"}`}
    >
      <header className={`flex items-center gap-2 border-b border-line px-4 py-2.5 ${v.tint}`}>
        <v.Icon className={`size-4 ${v.text}`} />
        <span className={`text-sm font-semibold ${v.text}`}>{v.label}</span>
        {d.note && <span className="truncate text-xs text-muted">· {d.note}</span>}
        <span className="ml-auto shrink-0 font-mono text-xs text-faint">{new Date(d.at).toLocaleTimeString()}</span>
      </header>

      <div className="px-4 pt-3">
        <code className="block font-mono text-[13px] break-words text-foreground">{formatCall(d)}</code>
        <p className="mt-1 text-xs text-faint">
          requested by {name ?? d.requesterId} · {d.requesterId}
        </p>
      </div>

      <ul className="mt-2 space-y-px px-2 pb-2">
        {d.results.map((r) => (
          <RuleRow key={r.rule} r={r} />
        ))}
      </ul>

      <CardFooter d={d} pending={pending} reviewing={reviewing} onReview={onReview} />
    </article>
  );
}

function RuleRow({ r }: { r: RuleResult }) {
  const Icon = r.pass ? CircleCheck : r.onFail === "BLOCK" ? CircleX : TriangleAlert;
  const tone = r.pass ? "text-allow/60" : r.onFail === "BLOCK" ? "text-block" : "text-escalate";
  const bg = r.pass ? "" : r.onFail === "BLOCK" ? "bg-block/[0.08]" : "bg-escalate/[0.08]";
  return (
    <li title={RULE_TEXT[r.rule]} className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${bg}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <span className="w-6 shrink-0 font-mono text-xs leading-5 text-faint">{r.rule}</span>
      <span className={`text-[13px] leading-5 ${r.pass ? "text-muted" : "text-foreground"}`}>{r.detail}</span>
    </li>
  );
}

function CardFooter({ d, pending, reviewing, onReview }: { d: Decision; pending?: PendingAction; reviewing: string | null; onReview: Props["onReview"] }) {
  if (pending?.status === "pending") {
    const busy = reviewing === pending.id;
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-escalate/30 bg-escalate/[0.07] px-4 py-3">
        <Clock className="size-4 text-escalate" />
        <span className="text-sm text-foreground">Paused until a human reviews it.</span>
        <div className="ml-auto flex gap-2">
          <button
            disabled={busy}
            onClick={() => onReview(pending.id, false)}
            className="rounded-lg border border-block/40 px-3 py-1.5 text-sm font-medium text-block transition-colors hover:bg-block/10 disabled:opacity-40"
          >
            Reject
          </button>
          <button
            disabled={busy}
            onClick={() => onReview(pending.id, true)}
            className="rounded-lg bg-allow px-3 py-1.5 text-sm font-semibold text-[#04130a] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Approve
          </button>
        </div>
      </div>
    );
  }

  const [Icon, text] = pending
    ? [UserCheck, `Reviewer ${pending.status} this.`]
    : d.verdict === "BLOCK" && !d.note
      ? [ShieldX, "Action never ran. The reason went back to the agent to re-plan."]
      : d.verdict === "ALLOW"
        ? [CircleCheck, "Action executed."]
        : [Info, d.note ?? ""];
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <Icon className="size-3.5 shrink-0" />
      {text}
    </div>
  );
}

const STEPS = [
  { Icon: Bot, title: "Agent proposes", text: "Gemini turns the customer's message into a tool call, like issue_refund." },
  { Icon: Lock, title: "Gate intercepts", text: "Every state-changing call stops here. There is no other path to the data." },
  { Icon: Database, title: "Facts from the database", text: "Order and customer are loaded by ID. Nothing said in the chat is trusted." },
  { Icon: Scale, title: "Rules decide", text: "R0–R8 run as plain code. There is no AI inside the decision." },
  { Icon: ScrollText, title: "Verdict with proof", text: "Allowed, blocked, or paused for a human, with every rule and number shown." },
];

function HowItWorks() {
  return (
    <div className="p-6">
      <p className="text-sm font-medium">No decisions yet</p>
      <p className="mt-1 text-sm text-muted">Every action the agent tries will appear here with its proof. This is how each one is decided:</p>
      <ol className="mt-6">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STEPS.length - 1 && <span className="absolute top-10 bottom-0 left-5 w-px bg-line" />}
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
              <Icon className="size-5" />
            </span>
            <div className="pt-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Rulebook() {
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted">Every action is checked against these rules in plain TypeScript: the same facts always give the same verdict.</p>
      <ul className="overflow-hidden rounded-xl border border-line">
        {rulebook.map((r, i) => {
          const v = r.onFail === "BLOCK" ? VERDICT.BLOCK : VERDICT.ESCALATE;
          return (
            <li key={r.id} className={`flex items-start gap-3 bg-card px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
              <span className="mt-0.5 rounded-md border border-line bg-background px-1.5 py-0.5 font-mono text-xs text-muted">{r.id}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{r.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.appliesTo.map((t) => (
                    <code key={t} className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-faint">
                      {t === "all" ? "every action" : t}
                    </code>
                  ))}
                </div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${v.chip}`}>
                <v.Icon className="size-3.5" />
                {r.onFail === "BLOCK" ? "Blocks" : "Needs approval"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="rounded-xl border border-line bg-card p-4 text-sm">
        <p className="font-medium">How the verdict is chosen</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>
            Any blocking rule fails: <span className="text-block">Blocked</span>
          </li>
          <li>
            Otherwise, any approval rule fails: <span className="text-escalate">Needs approval</span>
          </li>
          <li>
            Otherwise: <span className="text-allow">Allowed</span>
          </li>
        </ol>
        <p className="mt-3 text-xs text-faint">All rules always run, so every proof is complete. A reviewer can approve past an approval rule, never past a blocking one.</p>
      </div>
    </div>
  );
}

// Download the full audit trail as JSON: what compliance teams would file.
function exportAudit(audit: Decision[], pending: PendingAction[]) {
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), decisions: audit, pending }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `recursivegate-audit-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
