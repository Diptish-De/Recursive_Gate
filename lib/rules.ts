import type { Rule } from "./types";

// Business rules R1-R8. Each rule is a pure function: same facts in, same result out.
// No LLM, no database and no clock inside a rule (time comes in as facts.now).
// That is what makes every verdict deterministic and testable.
//
// To add a rule: give it an id, the tools it applies to, what happens when it fails,
// a one-line description, and a check that returns { pass, detail }. The engine does the rest.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const REFUND_WINDOW_DAYS = 30;
export const AUTO_APPROVE_LIMIT = 50_000;

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export const rules: Rule[] = [
  {
    id: "R1",
    appliesTo: ["issue_refund"],
    onFail: "BLOCK",
    description: "Refund cannot exceed what is still refundable on the order",
    check: (f) => {
      const refundable = f.order!.total - f.priorRefunds;
      const pass = f.amount! <= refundable;
      return { pass, detail: `refund ${inr(f.amount!)} ${pass ? "≤" : ">"} refundable ${inr(refundable)}` };
    },
  },
  {
    id: "R2",
    appliesTo: ["issue_refund"],
    onFail: "BLOCK",
    description: `Refunds only within ${REFUND_WINDOW_DAYS} days of delivery`,
    check: (f) => {
      const { deliveredAt } = f.order!;
      if (!deliveredAt) return { pass: true, detail: "not delivered, so no refund window applies" };
      const days = Math.floor((f.now.getTime() - new Date(deliveredAt).getTime()) / DAY);
      return { pass: days <= REFUND_WINDOW_DAYS, detail: `delivered ${days} days ago (limit ${REFUND_WINDOW_DAYS})` };
    },
  },
  {
    id: "R3",
    appliesTo: ["issue_refund"],
    onFail: "BLOCK",
    description: "Only delivered or cancelled orders can be refunded",
    check: (f) => {
      const { status } = f.order!;
      const pass = status === "delivered" || status === "cancelled";
      return { pass, detail: pass ? `status = ${status}` : `status = ${status}, must be delivered or cancelled` };
    },
  },
  {
    id: "R4",
    appliesTo: ["issue_refund"],
    onFail: "BLOCK",
    description: "An order that is already fully refunded cannot be refunded again",
    check: (f) => {
      const fully = f.priorRefunds >= f.order!.total;
      return {
        pass: !fully,
        detail:
          f.priorRefunds === 0 ? "no previous refund"
          : fully ? `already fully refunded (${inr(f.priorRefunds)})`
          : `${inr(f.priorRefunds)} refunded earlier (partial)`,
      };
    },
  },
  {
    id: "R5",
    appliesTo: ["issue_refund"],
    onFail: "ESCALATE",
    description: `Refunds above ${inr(AUTO_APPROVE_LIMIT)} need a human reviewer`,
    check: (f) => {
      const pass = f.amount! <= AUTO_APPROVE_LIMIT;
      return { pass, detail: `${inr(f.amount!)} ${pass ? "≤" : ">"} ${inr(AUTO_APPROVE_LIMIT)} auto-approval limit` };
    },
  },
  {
    id: "R6",
    appliesTo: ["change_payout_account"],
    onFail: "BLOCK",
    description: "Payout account changes require completed KYC",
    check: (f) => ({
      pass: f.customer.kycVerified,
      detail: f.customer.kycVerified ? "KYC verified" : "KYC not verified, payout changes need KYC",
    }),
  },
  {
    // The showpiece: two separate facts, combined across time, reveal a fraud pattern.
    // An attacker who takes over an account first redirects payouts, then triggers refunds.
    id: "R7",
    appliesTo: ["issue_refund"],
    onFail: "BLOCK",
    description: "No refunds within 24h of a payout-account change (account-takeover pattern)",
    check: (f) => {
      const changed = f.customer.payoutChangedAt;
      if (!changed) return { pass: true, detail: "payout account never changed" };
      const age = f.now.getTime() - new Date(changed).getTime();
      const recent = age < DAY;
      const ago = age < HOUR ? `${Math.round(age / 60_000)} min` : `${Math.floor(age / HOUR)}h`;
      return {
        pass: !recent,
        detail: recent
          ? `payout account changed ${ago} ago, refund now = takeover pattern`
          : `payout account unchanged for ${Math.floor(age / DAY)} days`,
      };
    },
  },
  {
    id: "R8",
    appliesTo: ["all"],
    onFail: "BLOCK",
    description: "Customers can only act on their own orders",
    check: (f) => {
      if (!f.order) return { pass: true, detail: "acts only on the requester's own account" };
      const pass = f.order.customerId === f.requesterId;
      return { pass, detail: pass ? "requester owns this order" : "order belongs to another customer" };
    },
  },
];

// R0 is checked by the gate before any rule runs: with no real order there is nothing to check.
export const R0 = {
  id: "R0",
  appliesTo: ["issue_refund"],
  onFail: "BLOCK",
  description: "The order must exist",
} as const;

// The rulebook as the UI shows it: what each rule is, without its code.
export const rulebook = [R0, ...rules].map(({ id, appliesTo, onFail, description }) => ({
  id,
  appliesTo: [...appliesTo],
  onFail,
  description,
}));
