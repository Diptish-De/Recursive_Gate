"use client";

import { useCallback, useEffect, useState } from "react";
import scenarios from "@/lib/scenarios.json";
import type { Decision, PendingAction } from "@/lib/types";
import { Chat, type ChatEntry, type Scenario } from "./Chat";
import { formatCall } from "./format";
import { ProofPanel } from "./ProofPanel";

type CustomerOption = { id: string; name: string };

const postJson = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

const loadState = (): Promise<{ audit: Decision[]; pending: PendingAction[] }> =>
  fetch("/api/state").then((r) => r.json());

// The whole demo screen: chat on the left, proof panel on the right.
export function Console({ customers }: { customers: CustomerOption[] }) {
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Decision[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);

  // The server's audit log is the single source of truth for the proof panel.
  const refresh = useCallback(
    () =>
      loadState().then((s) => {
        setAudit(s.audit);
        setPending(s.pending);
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      setAudit(s.audit);
      setPending(s.pending);
    });
    return () => {
      alive = false;
    };
  }, []);

  const names = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  function switchCustomer(id: string) {
    if (id === customerId) return;
    setCustomerId(id);
    setEntries([]);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatEntry[] = [...entries, { role: "user", content: text }];
    setEntries(history);
    setInput("");
    setBusy(true);
    try {
      const messages = history.filter((e) => e.role !== "system").map(({ role, content }) => ({ role, content }));
      const data = await postJson("/api/chat", { customerId, messages });
      setEntries([
        ...history,
        data.error
          ? { role: "system", content: data.error, tone: "error" }
          : { role: "assistant", content: data.reply, claims: data.claims },
      ]);
    } catch {
      setEntries([...history, { role: "system", content: "Network error. Is the server running?", tone: "error" }]);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function review(pendingId: string, approve: boolean) {
    const data = await postJson("/api/approve", { pendingId, approve });
    if (data.error) {
      setEntries((e) => [...e, { role: "system", content: data.error, tone: "error" }]);
    } else if (data.pending.requesterId === customerId) {
      const ok = data.decision.verdict === "ALLOW";
      setEntries((e) => [...e, { role: "system", content: `${data.decision.note}: ${formatCall(data.decision)}`, tone: ok ? "ok" : "error" }]);
    }
    void refresh();
  }

  async function reset() {
    await postJson("/api/reset");
    setEntries([]);
    setInput("");
    void refresh();
  }

  function loadScenario(s: Scenario) {
    switchCustomer(s.customerId);
    setInput(s.message);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-zinc-800 px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">
            Recursive<span className="text-accent">Gate</span>
          </h1>
          <p className="text-xs text-zinc-500">The LLM proposes. The logic decides.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
          Logged in as
          <select
            value={customerId}
            onChange={(e) => switchCustomer(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={reset} className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800">
          Reset demo
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[55fr_45fr]">
        <Chat
          entries={entries}
          input={input}
          busy={busy}
          scenarios={scenarios}
          onInput={setInput}
          onSend={send}
          onScenario={loadScenario}
        />
        <ProofPanel audit={audit} pending={pending} names={names} onReview={review} />
      </main>
    </div>
  );
}
