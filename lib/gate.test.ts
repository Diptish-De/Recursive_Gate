import { beforeEach, describe, expect, it } from "vitest";
import { db, getCustomer, refundsFor, resetDb } from "./db";
import { gate, review } from "./gate";
import type { Decision } from "./types";

// No LLM anywhere in these tests: the gate is plain code, so every verdict is reproducible.

const failed = (d: Decision) => d.results.filter((r) => !r.pass).map((r) => r.rule);

beforeEach(() => resetDb());

describe("demo scenarios", () => {
  it("1. a normal refund is ALLOWED and actually executes", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-4521" });
    expect(out.status).toBe("ALLOW");
    expect(failed(out.decision)).toEqual([]);
    expect(out.decision.args.amount).toBe(12_499); // no amount = full refundable amount
    expect(refundsFor("O-4521")).toHaveLength(1);
  });

  it("2. the ₹5 lakh 'I am the CEO' attack is BLOCKED on R1 and R5", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 500_000 });
    expect(out.status).toBe("BLOCK");
    expect(failed(out.decision)).toEqual(["R1", "R5"]);
    expect(refundsFor("O-6000")).toHaveLength(0);
  });

  it("3. refund right after a payout-account change is BLOCKED on R7", () => {
    const out = gate("issue_refund", "C-9", { orderId: "O-9001" });
    expect(out.status).toBe("BLOCK");
    expect(failed(out.decision)).toEqual(["R7"]);
  });

  it("4. payout change without KYC is BLOCKED on R6", () => {
    const out = gate("change_payout_account", "C-7", { newAccount: "SBI 4455" });
    expect(out.status).toBe("BLOCK");
    expect(failed(out.decision)).toEqual(["R6"]);
    expect(getCustomer("C-7")!.payoutAccount).toBe("SBI ••••6614");
  });

  it("5. a ₹60,000 refund is ESCALATED and runs only after a human approves", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 60_000 });
    expect(out.status).toBe("ESCALATE");
    expect(failed(out.decision)).toEqual(["R5"]);
    expect(refundsFor("O-6000")).toHaveLength(0);

    const approved = review(out.decision.pendingId!, true);
    expect(approved.decision.verdict).toBe("ALLOW");
    expect(approved.pending.status).toBe("approved");
    expect(refundsFor("O-6000")).toHaveLength(1);
  });
});

describe("every rule", () => {
  it("R0: unknown order is BLOCKED", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-0000", amount: 10 });
    expect(failed(out.decision)).toEqual(["R0"]);
  });

  it("R1: cannot refund more than what is left after a partial refund", () => {
    const out = gate("issue_refund", "C-6", { orderId: "O-1601", amount: 20_000 });
    expect(failed(out.decision)).toEqual(["R1"]);
    expect(out.decision.results[0].detail).toContain("₹19,999");
  });

  it("R2: delivered 45 days ago is outside the window", () => {
    expect(failed(gate("issue_refund", "C-2", { orderId: "O-3300" }).decision)).toEqual(["R2"]);
  });

  it("R3: a shipped order cannot be refunded", () => {
    expect(failed(gate("issue_refund", "C-1", { orderId: "O-1102" }).decision)).toEqual(["R3"]);
  });

  it("R4: an already fully refunded order cannot be refunded again", () => {
    expect(failed(gate("issue_refund", "C-3", { orderId: "O-2001" }).decision)).toContain("R4");
  });

  it("R8: cannot refund someone else's order", () => {
    expect(failed(gate("issue_refund", "C-1", { orderId: "O-9001" }).decision)).toContain("R8");
  });

  it("a cancelled order inside the rules is ALLOWED", () => {
    expect(gate("issue_refund", "C-4", { orderId: "O-1402" }).status).toBe("ALLOW");
  });

  it("order IDs are normalized: '4521' means O-4521", () => {
    expect(gate("issue_refund", "C-1", { orderId: "4521" }).status).toBe("ALLOW");
  });
});

describe("gate guarantees", () => {
  it("is deterministic: same facts, same verdict and proof", () => {
    const a = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 500_000 }).decision;
    const b = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 500_000 }).decision;
    expect(b.verdict).toBe(a.verdict);
    expect(b.results).toEqual(a.results);
  });

  it("ignores any extra 'facts' the agent tries to pass", () => {
    const sneaky = { orderId: "O-9001", isVip: true, payoutChangedAt: null, kycVerified: true } as never;
    expect(gate("issue_refund", "C-9", sneaky).status).toBe("BLOCK");
  });

  it("logs every decision to the audit trail", () => {
    gate("issue_refund", "C-1", { orderId: "O-4521" });
    gate("issue_refund", "C-9", { orderId: "O-9001" });
    expect(db.audit.map((d) => d.verdict)).toEqual(["ALLOW", "BLOCK"]);
  });

  it("a reviewer cannot approve past a hard rule that fails by approval time", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 60_000 });
    gate("issue_refund", "C-1", { orderId: "O-6000", amount: 10_000 }); // refund lands while waiting
    const res = review(out.decision.pendingId!, true);
    expect(res.decision.verdict).toBe("BLOCK");
    expect(failed(res.decision)).toContain("R1");
    expect(refundsFor("O-6000")).toHaveLength(1);
  });

  it("a rejected action never runs", () => {
    const out = gate("issue_refund", "C-1", { orderId: "O-6000", amount: 60_000 });
    review(out.decision.pendingId!, false);
    expect(refundsFor("O-6000")).toHaveLength(0);
    expect(() => review(out.decision.pendingId!, true)).toThrow(/already rejected/);
  });
});
