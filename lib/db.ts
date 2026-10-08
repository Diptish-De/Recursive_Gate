import type { Customer, Decision, Order, PendingAction, Refund } from "./types";

// In-memory mock database: the "system of record" the gate trusts.
// Dates are relative to server start, so every demo scenario stays valid on any day.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export type Db = {
  customers: Customer[];
  orders: Order[];
  refunds: Refund[];
  audit: Decision[];
  pending: PendingAction[];
};

function seed(): Db {
  return {
    customers: [
      { id: "C-1", name: "Priya Sharma", kycVerified: true, payoutAccount: "HDFC ••••4821", payoutChangedAt: ago(41 * DAY) },
      { id: "C-2", name: "Arjun Mehta", kycVerified: true, payoutAccount: "ICICI ••••1937", payoutChangedAt: ago(120 * DAY) },
      { id: "C-3", name: "Sneha Das", kycVerified: true, payoutAccount: "SBI ••••5502", payoutChangedAt: null },
      { id: "C-4", name: "Rohan Gupta", kycVerified: true, payoutAccount: "Axis ••••7710", payoutChangedAt: ago(200 * DAY) },
      { id: "C-5", name: "Ananya Iyer", kycVerified: true, payoutAccount: "Kotak ••••3348", payoutChangedAt: ago(60 * DAY) },
      { id: "C-6", name: "Vikram Singh", kycVerified: true, payoutAccount: "HDFC ••••9025", payoutChangedAt: null },
      // Edge case: KYC not done, so payout-account changes must be blocked (R6).
      { id: "C-7", name: "Meera Nair", kycVerified: false, payoutAccount: "SBI ••••6614", payoutChangedAt: null },
      { id: "C-8", name: "Kabir Khan", kycVerified: true, payoutAccount: "Yes Bank ••••2209", payoutChangedAt: ago(15 * DAY) },
      // Edge case: payout account changed 2 hours ago, the account-takeover pattern (R7).
      { id: "C-9", name: "Ishaan Bose", kycVerified: true, payoutAccount: "ICICI ••••0458", payoutChangedAt: ago(2 * HOUR) },
      { id: "C-10", name: "Riya Chatterjee", kycVerified: true, payoutAccount: "PNB ••••8136", payoutChangedAt: ago(90 * DAY) },
    ],
    orders: [
      // Demo scenario 1: Priya's damaged order.
      { id: "O-4521", customerId: "C-1", total: 12_499, status: "delivered", deliveredAt: ago(6 * DAY) },
      // Demo scenario 2 (the ₹5 lakh attack) and 5 (high value, needs human approval, R5).
      { id: "O-6000", customerId: "C-1", total: 60_000, status: "delivered", deliveredAt: ago(3 * DAY) },
      // Not delivered yet (R3).
      { id: "O-1102", customerId: "C-1", total: 899, status: "shipped", deliveredAt: null },
      // Outside the 30-day refund window (R2).
      { id: "O-3300", customerId: "C-2", total: 4_599, status: "delivered", deliveredAt: ago(45 * DAY) },
      { id: "O-1205", customerId: "C-2", total: 2_299, status: "delivered", deliveredAt: ago(10 * DAY) },
      // Already fully refunded (R4).
      { id: "O-2001", customerId: "C-3", total: 3_499, status: "delivered", deliveredAt: ago(12 * DAY) },
      { id: "O-1310", customerId: "C-3", total: 1_599, status: "placed", deliveredAt: null },
      { id: "O-1401", customerId: "C-4", total: 7_999, status: "delivered", deliveredAt: ago(2 * DAY) },
      { id: "O-1402", customerId: "C-4", total: 1_299, status: "cancelled", deliveredAt: null },
      { id: "O-1501", customerId: "C-5", total: 15_999, status: "delivered", deliveredAt: ago(20 * DAY) },
      { id: "O-1502", customerId: "C-5", total: 649, status: "shipped", deliveredAt: null },
      // Partially refunded already, so only ₹19,999 is refundable (R1).
      { id: "O-1601", customerId: "C-6", total: 24_999, status: "delivered", deliveredAt: ago(8 * DAY) },
      { id: "O-1602", customerId: "C-6", total: 3_999, status: "delivered", deliveredAt: ago(29 * DAY) },
      { id: "O-7001", customerId: "C-7", total: 5_499, status: "delivered", deliveredAt: ago(4 * DAY) },
      { id: "O-7002", customerId: "C-7", total: 1_899, status: "placed", deliveredAt: null },
      { id: "O-1801", customerId: "C-8", total: 9_999, status: "delivered", deliveredAt: ago(15 * DAY) },
      { id: "O-1802", customerId: "C-8", total: 449, status: "delivered", deliveredAt: ago(1 * DAY) },
      // Demo scenario 3: refund right after a payout change (R7).
      { id: "O-9001", customerId: "C-9", total: 18_999, status: "delivered", deliveredAt: ago(5 * DAY) },
      { id: "O-1001", customerId: "C-10", total: 2_799, status: "delivered", deliveredAt: ago(7 * DAY) },
      { id: "O-1002", customerId: "C-10", total: 34_999, status: "shipped", deliveredAt: null },
    ],
    refunds: [
      { id: "RF-1", orderId: "O-2001", amount: 3_499, createdAt: ago(5 * DAY) },
      { id: "RF-2", orderId: "O-1601", amount: 5_000, createdAt: ago(3 * DAY) },
    ],
    audit: [],
    pending: [],
  };
}

// Next.js can evaluate this module more than once (hot reload, separate route bundles).
// Keeping the db on globalThis means /api/chat and /api/approve always share the same data.
const g = globalThis as unknown as { __recursiveGateDb?: Db };
export const db: Db = (g.__recursiveGateDb ??= seed());

// Put the demo back to its starting state (run between rehearsals).
export function resetDb() {
  Object.assign(db, seed());
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---- Reads (safe for anyone) ----

export const getCustomer = (id: string) => db.customers.find((c) => c.id === id);
// Accepts "O-4521", "o-4521" or "4521": the LLM is not always precise about IDs.
export const normalizeOrderId = (id: string) => {
  const s = id.trim().toUpperCase();
  return /^\d+$/.test(s) ? `O-${s}` : s;
};
export const getOrder = (id: string) => db.orders.find((o) => o.id === normalizeOrderId(id));
export const refundsFor = (orderId: string) => db.refunds.filter((r) => r.orderId === orderId);

// ---- Writes (only the gate may call these) ----

export function addRefund(orderId: string, amount: number): Refund {
  const refund = { id: newId("RF"), orderId, amount, createdAt: new Date().toISOString() };
  db.refunds.push(refund);
  return refund;
}

export function changePayoutAccount(customerId: string, payoutAccount: string): Customer {
  const customer = getCustomer(customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  customer.payoutAccount = payoutAccount;
  customer.payoutChangedAt = new Date().toISOString();
  return customer;
}

export function logDecision(d: Omit<Decision, "id" | "at">): Decision {
  const decision = { ...d, id: newId("D"), at: new Date().toISOString() };
  db.audit.push(decision);
  return decision;
}

export function addPending(decision: Decision): PendingAction {
  const pending: PendingAction = {
    id: newId("P"),
    decisionId: decision.id,
    requesterId: decision.requesterId,
    tool: decision.tool,
    args: decision.args,
    results: decision.results,
    status: "pending",
  };
  db.pending.push(pending);
  return pending;
}
