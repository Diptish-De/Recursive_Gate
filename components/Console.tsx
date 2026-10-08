"use client";

import { RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import scenarios from "@/lib/scenarios.json";
import type { Customer, Decision, PendingAction, Verdict } from "@/lib/types";
import { Chat, type ChatEntry, type Scenario } from "./Chat";
import { CustomerBar } from "./CustomerBar";
import { formatCall } from "./format";
import { ProofPanel, type ProofTab } from "./ProofPanel";
import { VERDICT } from "./verdict";

type CustomerOption = { id: string; name: string };
type ServerState = { audit: Decision[]; pending: PendingAction[]; customers: Customer[] };

const postJson = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

const loadState = (): Promise<ServerState> => fetch("/api/state").then((r) => r.json());

// The whole demo screen: chat on the left, proof panel on the right.
export function Console({ customers }: { customers: CustomerOption[] }) {
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<ServerState>({ audit: [], pending: [], customers: [] });
  const [tab, setTab] = useState<ProofTab>("proof");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  // The server's audit log is the single source of truth for the proof panel.
  const refresh = useCallback(() => loadState().then(setServer), []);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (alive) setServer(s);
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

  function showProof(id: string) {
    setTab("proof");
    const n = Date.now();
    setFocus({ id, n });
    setTimeout(() => setFocus((f) => (f?.n === n ? null : f)), 2000);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatEntry[] = [...entries, { role: "user", content: text }];
    setEntries(history);
    setInput("");
    setBusy(true);
    setTab("proof");
    try {
      const messages = history.filter((e) => e.role !== "system").map(({ role, content }) => ({ role, content }));
      const data = await postJson("/api/chat", { customerId, messages });
      setEntries([
        ...history,
        data.error
          ? { role: "system", content: data.error, tone: "error" }
          : { role: "assistant", content: data.reply, claims: data.claims, decisions: data.decisions, model: data.model },
      ]);
    } catch {
      setEntries([...history, { role: "system", content: "Network error. Is the server running?", tone: "error" }]);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function review(pendingId: string, approve: boolean) {
    setReviewing(pendingId);
    try {
      const data = await postJson("/api/approve", { pendingId, approve });
      if (data.error) {
        setEntries((e) => [...e, { role: "system", content: data.error, tone: "error" }]);
      } else if (data.pending.requesterId === customerId) {
        const ok = data.decision.verdict === "ALLOW";
        setEntries((e) => [...e, { role: "system", content: `${data.decision.note}: ${formatCall(data.decision)}`, tone: ok ? "ok" : "error" }]);
      }
    } finally {
      setReviewing(null);
      void refresh();
    }
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

  const count = (v: Verdict) => server.audit.filter((d) => d.verdict === v).length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-panel/80 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-emerald-400 to-emerald-700 text-white shadow-lg shadow-emerald-950/50">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-lg leading-tight font-semibold tracking-tight">
              Recursive<span className="text-accent">Gate</span>
            </h1>
            <p className="text-xs text-muted">The LLM proposes. The logic decides.</p>
          </div>
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Stat value={server.audit.length} label={server.audit.length === 1 ? "decision" : "decisions"} />
          {(["ALLOW", "BLOCK", "ESCALATE"] as const).map((v) => {
            const { Icon, text, stat } = VERDICT[v];
            return <Stat key={v} value={count(v)} label={stat} icon={<Icon className={`size-4 ${text}`} />} />;
          })}
        </div>

        <button
          onClick={reset}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-card hover:text-foreground md:ml-2"
        >
          <RotateCcw className="size-4" /> Reset demo
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-line lg:border-r">
          <CustomerBar
            options={customers}
            customerId={customerId}
            customer={server.customers.find((c) => c.id === customerId)}
            onSwitch={switchCustomer}
          />
          <Chat
            entries={entries}
            input={input}
            busy={busy}
            customerName={names[customerId]}
            scenarios={scenarios}
            names={names}
            onInput={setInput}
            onSend={send}
            onScenario={loadScenario}
            onShowProof={showProof}
          />
        </section>
        <ProofPanel
          tab={tab}
          onTab={setTab}
          audit={server.audit}
          pending={server.pending}
          names={names}
          focus={focus}
          reviewing={reviewing}
          onReview={review}
        />
      </main>
    </div>
  );
}

function Stat({ value, label, icon }: { value: number; label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm">
      {icon}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
