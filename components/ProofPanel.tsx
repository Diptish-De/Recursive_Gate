"use client";

import type { Decision, PendingAction, Verdict } from "@/lib/types";
import { formatCall } from "./format";

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  ALLOW: { label: "ALLOWED", cls: "border-allow/40 bg-allow/15 text-allow" },
  BLOCK: { label: "BLOCKED", cls: "border-block/40 bg-block/15 text-block" },
  ESCALATE: { label: "NEEDS APPROVAL", cls: "border-escalate/40 bg-escalate/15 text-escalate" },
};

type Props = {
  audit: Decision[];
  pending: PendingAction[];
  names: Record<string, string>;
  onReview: (pendingId: string, approve: boolean) => void;
};

// Every gate decision, newest first, with the full proof. This is also the audit log.
export function ProofPanel({ audit, pending, names, onReview }: Props) {
  const count = (v: Verdict) => audit.filter((d) => d.verdict === v).length;
  return (
    <section className="flex min-h-0 flex-col bg-black/20">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-zinc-800 px-5 py-3">
        <h2 className="font-medium">Proof Panel</h2>
        <span className="text-xs text-zinc-500">
          {audit.length} decisions · <span className="text-allow">{count("ALLOW")} allowed</span> ·{" "}
          <span className="text-block">{count("BLOCK")} blocked</span> ·{" "}
          <span className="text-escalate">{count("ESCALATE")} escalated</span>
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {audit.length === 0 && (
          <p className="text-sm text-zinc-500">Every action the agent tries shows up here, with the proof of why it was allowed or not.</p>
        )}
        {[...audit].reverse().map((d) => (
          <DecisionCard
            key={d.id}
            d={d}
            pending={pending.find((p) => p.id === d.pendingId)}
            name={names[d.requesterId]}
            onReview={onReview}
          />
        ))}
      </div>
    </section>
  );
}

function DecisionCard({
  d, pending, name, onReview,
}: { d: Decision; pending?: PendingAction; name?: string; onReview: Props["onReview"] }) {
  const v = VERDICT[d.verdict];
  return (
    <article className="animate-[fade-in_0.3s_ease-out] rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${v.cls}`}>{v.label}</span>
        <code className="text-sm text-zinc-100">{formatCall(d)}</code>
        <span className="ml-auto text-xs text-zinc-500">
          {d.requesterId} {name} · {new Date(d.at).toLocaleTimeString()}
        </span>
      </header>

      <ul className="space-y-0.5 font-mono text-xs">
        {d.results.map((r) => (
          <li key={r.rule} className={r.pass ? "text-zinc-400" : r.onFail === "BLOCK" ? "text-block" : "text-escalate"}>
            {r.pass ? "✓" : "✗"} {r.rule} {r.detail}
          </li>
        ))}
      </ul>

      {d.note && <p className="mt-2 text-xs text-zinc-200">→ {d.note}</p>}
      {!d.note && d.verdict === "BLOCK" && (
        <p className="mt-2 text-xs text-zinc-500">→ Action never ran. The reason went back to the agent to re-plan.</p>
      )}
      {pending?.status === "pending" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-zinc-400">Paused for a human reviewer:</span>
          <button onClick={() => onReview(pending.id, true)} className="rounded bg-allow/20 px-3 py-1 text-xs font-medium text-allow hover:bg-allow/30">
            Approve
          </button>
          <button onClick={() => onReview(pending.id, false)} className="rounded bg-block/20 px-3 py-1 text-xs font-medium text-block hover:bg-block/30">
            Reject
          </button>
        </div>
      )}
      {pending && pending.status !== "pending" && <p className="mt-2 text-xs text-zinc-500">→ Reviewer {pending.status} this.</p>}
    </article>
  );
}
