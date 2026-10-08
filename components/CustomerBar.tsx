"use client";

import { BadgeAlert, BadgeCheck, ChevronDown, TriangleAlert, Wallet } from "lucide-react";
import type { Customer } from "@/lib/types";
import { ago, initials, withinDay } from "./format";

const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5";

type Props = {
  options: { id: string; name: string }[];
  customerId: string;
  customer?: Customer; // full account details, once loaded from the server
  onSwitch: (id: string) => void;
};

// Who the agent is talking to, with the account facts the rules care about.
export function CustomerBar({ options, customerId, customer, onSwitch }: Props) {
  const name = options.find((o) => o.id === customerId)?.name ?? customerId;
  const changed = customer?.payoutChangedAt;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-panel/60 px-5 py-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
        {initials(name)}
      </div>

      <div className="min-w-0">
        <p className="leading-tight font-medium">
          {name} <span className="font-mono text-xs text-faint">{customerId}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {!customer && <span className="text-faint">Loading account…</span>}
          {customer &&
            (customer.kycVerified ? (
              <span className={`${chip} border-allow/25 text-allow`}>
                <BadgeCheck className="size-3.5" /> KYC verified
              </span>
            ) : (
              <span className={`${chip} border-block/30 text-block`}>
                <BadgeAlert className="size-3.5" /> KYC missing
              </span>
            ))}
          {customer && (
            <span className={`${chip} border-line text-muted`}>
              <Wallet className="size-3.5" /> {customer.payoutAccount}
            </span>
          )}
          {changed &&
            (withinDay(changed) ? (
              <span className={`${chip} border-escalate/40 bg-escalate/10 text-escalate`}>
                <TriangleAlert className="size-3.5" /> payout changed {ago(changed)}
              </span>
            ) : (
              <span className="text-faint">payout changed {ago(changed)}</span>
            ))}
        </div>
      </div>

      <label className="ml-auto flex items-center gap-2 text-xs text-muted">
        <span className="hidden 2xl:inline">Logged in as</span>
        <span className="relative">
          <select
            aria-label="Logged in as"
            value={customerId}
            onChange={(e) => onSwitch(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-card py-1.5 pr-8 pl-3 text-sm text-foreground outline-none hover:border-accent/40 focus:border-accent"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted" />
        </span>
      </label>
    </div>
  );
}
