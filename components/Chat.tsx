"use client";

import { useEffect, useRef } from "react";
import type { ClaimCheck } from "@/lib/claims";

export type ChatEntry = {
  role: "user" | "assistant" | "system"; // "system" lines are UI notes, never sent to the agent
  content: string;
  claims?: ClaimCheck[] | null;
  tone?: "ok" | "error";
};

export type Scenario = { id: number; title: string; customerId: string; message: string };

type Props = {
  entries: ChatEntry[];
  input: string;
  busy: boolean;
  scenarios: Scenario[];
  onInput: (text: string) => void;
  onSend: () => void;
  onScenario: (s: Scenario) => void;
};

export function Chat({ entries, input, busy, scenarios, onInput, onSend, onScenario }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not
  // return anything except a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy]);

  return (
    <section className="flex min-h-0 flex-col border-zinc-800 md:border-r">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {entries.length === 0 && (
          <p className="text-sm text-zinc-500">
            Ask the agent for a refund or a payout-account change, or load a demo scenario below.
          </p>
        )}
        {entries.map((e, i) => (
          <Bubble key={i} entry={e} />
        ))}
        {busy && <p className="animate-pulse text-sm text-zinc-500">Agent is working…</p>}
        <div ref={bottom} />
      </div>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => onScenario(s)}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-accent hover:text-white"
            >
              {s.id}. {s.title}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Message the agent…"
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button disabled={busy || !input.trim()} className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

function Bubble({ entry }: { entry: ChatEntry }) {
  if (entry.role === "system") {
    return <p className={`text-center text-xs ${entry.tone === "error" ? "text-block" : "text-allow"}`}>{entry.content}</p>;
  }
  const mine = entry.role === "user";
  const flagged = entry.claims?.filter((c) => !c.ok) ?? [];
  const verified = entry.claims?.filter((c) => c.ok) ?? [];

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-accent/30" : "border border-zinc-800 bg-zinc-900"}`}>
        <p className="whitespace-pre-wrap">{entry.content.replace(/\*\*/g, "")}</p>
        {flagged.length > 0 && (
          <div className="mt-2 rounded border border-escalate/50 bg-escalate/10 p-2 text-xs text-escalate">
            ⚠ Claim check caught a false statement before you could rely on it: {flagged.map((c) => c.correction).join(" ")}
          </div>
        )}
        {flagged.length === 0 && verified.length > 0 && (
          <p className="mt-1 text-xs text-allow">
            ✓ {verified.length} claim{verified.length > 1 ? "s" : ""} checked against the database
          </p>
        )}
      </div>
    </div>
  );
}
