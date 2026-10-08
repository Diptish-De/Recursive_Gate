"use client";

import {
  ArrowRight, Bot, CircleCheck, IdCard, KeyRound, Landmark, Package, SendHorizontal, Siren, TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { ClaimCheck } from "@/lib/claims";
import type { Decision } from "@/lib/types";
import { initials } from "./format";
import { VERDICT } from "./verdict";

export type ChatEntry = {
  role: "user" | "assistant" | "system"; // "system" lines are UI notes, never sent to the agent
  content: string;
  claims?: ClaimCheck[] | null;
  decisions?: Decision[]; // gate decisions made during this agent turn
  model?: string;
  tone?: "ok" | "error";
};

export type Scenario = { id: number; title: string; customerId: string; message: string };

const SCENARIO_ICON: Record<number, LucideIcon> = { 1: Package, 2: Siren, 3: KeyRound, 4: IdCard, 5: Landmark };

type Props = {
  entries: ChatEntry[];
  input: string;
  busy: boolean;
  customerName: string;
  scenarios: Scenario[];
  names: Record<string, string>;
  onInput: (text: string) => void;
  onSend: () => void;
  onScenario: (s: Scenario) => void;
  onShowProof: (decisionId: string) => void;
};

export function Chat({ entries, input, busy, customerName, scenarios, names, onInput, onSend, onScenario, onShowProof }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not
  // return anything except a cleanup function.
  useEffect(() => {
    if (entries.length > 0 || busy) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6">
          {entries.length === 0 && <EmptyState scenarios={scenarios} names={names} onScenario={onScenario} />}
          {entries.map((e, i) => (
            <Message key={i} entry={e} customerName={customerName} onShowProof={onShowProof} />
          ))}
          {busy && <Thinking />}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-line bg-panel/60 px-5 py-4">
        <div className="mx-auto w-full max-w-3xl">
          {entries.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onScenario(s)}
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  {s.id} · {s.title}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
            className="flex items-center gap-2 rounded-xl border border-line bg-card p-1.5 pl-3 transition-colors focus-within:border-accent/60"
          >
            <input
              value={input}
              onChange={(e) => onInput(e.target.value)}
              placeholder={`Message the agent as ${customerName}…`}
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-faint"
            />
            <button
              aria-label="Send"
              disabled={busy || !input.trim()}
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-[#04130a] transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <SendHorizontal className="size-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ scenarios, names, onScenario }: Pick<Props, "scenarios" | "names" | "onScenario">) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-line bg-card text-accent shadow-lg shadow-black/30">
        <Bot className="size-7" />
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Customer support agent</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        It can look up orders, issue refunds and change payout accounts. Every action it proposes goes through the gate
        first, and the proof shows up on the right.
      </p>

      <div className="mt-6 grid w-full gap-3 text-left sm:grid-cols-2">
        {scenarios.map((s, i) => {
          const Icon = SCENARIO_ICON[s.id] ?? Bot;
          const wide = i === scenarios.length - 1 && scenarios.length % 2 === 1;
          return (
            <button
              key={s.id}
              onClick={() => onScenario(s)}
              className={`group rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-accent/50 hover:bg-card-hover ${wide ? "sm:col-span-2" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4" />
                </span>
                <span className="font-medium">{s.title}</span>
                <span className="ml-auto font-mono text-xs text-faint">#{s.id}</span>
              </div>
              <p className="mt-2 text-xs text-faint">as {names[s.customerId]}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted group-hover:text-foreground">“{s.message}”</p>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-faint">Pick a scenario to load its message, then press Send. Or type your own.</p>
    </div>
  );
}

function Message({ entry, customerName, onShowProof }: { entry: ChatEntry; customerName: string; onShowProof: Props["onShowProof"] }) {
  if (entry.role === "system") {
    const ok = entry.tone !== "error";
    return (
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${ok ? VERDICT.ALLOW.chip : VERDICT.BLOCK.chip}`}>
          {ok ? <CircleCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {entry.content}
        </span>
      </div>
    );
  }

  if (entry.role === "user") {
    return (
      <div className="flex animate-[fade-in_0.25s_ease-out] justify-end gap-3">
        <div className="max-w-[80%]">
          <p className="mb-1 text-right text-xs text-faint">{customerName}</p>
          <div className="rounded-2xl rounded-tr-sm border border-accent/25 bg-accent/15 px-4 py-2.5 text-[15px] leading-relaxed">
            {entry.content}
          </div>
        </div>
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
          {initials(customerName)}
        </div>
      </div>
    );
  }

  const flagged = entry.claims?.filter((c) => !c.ok) ?? [];
  const verified = entry.claims?.filter((c) => c.ok) ?? [];
  const model = entry.model === "fallback" ? "rule-based reply, AI unavailable" : entry.model;

  return (
    <div className="flex animate-[fade-in_0.25s_ease-out] gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-card text-accent">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0 max-w-[85%]">
        <p className="mb-1 text-xs text-faint">
          Support agent{model && <span> · {model}</span>}
        </p>
        <div className="rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {entry.content.replace(/\*\*/g, "")}
        </div>

        {!!entry.decisions?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.decisions.map((d) => {
              const v = VERDICT[d.verdict];
              const failed = d.results.filter((r) => !r.pass).map((r) => r.rule);
              return (
                <button
                  key={d.id}
                  onClick={() => onShowProof(d.id)}
                  title="Show the proof"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${v.chip}`}
                >
                  <v.Icon className="size-3.5" />
                  {d.tool}: {v.label}
                  {failed.length > 0 && <span className="font-mono">({failed.join(", ")})</span>}
                  <ArrowRight className="size-3" />
                </button>
              );
            })}
          </div>
        )}

        {flagged.length > 0 && (
          <div className="mt-2 flex gap-2 rounded-lg border border-escalate/40 bg-escalate/10 px-3 py-2 text-xs text-escalate">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <span>
              <b>Claim check caught a false statement:</b> {flagged.map((c) => c.correction).join(" ")}
            </span>
          </div>
        )}
        {flagged.length === 0 && verified.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <CircleCheck className="size-3.5 text-allow" />
            {verified.length} claim{verified.length > 1 ? "s" : ""} in this reply checked against the database
          </p>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-card text-accent">
        <Bot className="size-4" />
      </div>
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3">
        <span className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        <span className="text-sm text-muted">Working. Any action it tries goes through the gate.</span>
      </div>
    </div>
  );
}
