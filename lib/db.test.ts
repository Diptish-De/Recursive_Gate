import { describe, expect, it } from "vitest";
import { getCustomer, getOrder, refundsFor } from "./db";

const DAY = 86_400_000;
const daysAgo = (iso: string | null) => (Date.now() - new Date(iso!).getTime()) / DAY;

// The demo depends on these planted edge cases. If one breaks, a scenario breaks.
describe("seed data", () => {
  it("O-4521 is Priya's ₹12,499 order delivered 6 days ago", () => {
    const o = getOrder("O-4521")!;
    expect(o).toMatchObject({ customerId: "C-1", total: 12_499, status: "delivered" });
    expect(Math.round(daysAgo(o.deliveredAt))).toBe(6);
  });

  it("O-3300 was delivered 45 days ago", () => {
    expect(Math.round(daysAgo(getOrder("O-3300")!.deliveredAt))).toBe(45);
  });

  it("O-2001 is already fully refunded", () => {
    const paid = refundsFor("O-2001").reduce((s, r) => s + r.amount, 0);
    expect(paid).toBe(getOrder("O-2001")!.total);
  });

  it("C-7 has no KYC", () => {
    expect(getCustomer("C-7")!.kycVerified).toBe(false);
  });

  it("C-9 changed payout account under 24h ago and owns delivered O-9001", () => {
    expect(daysAgo(getCustomer("C-9")!.payoutChangedAt)).toBeLessThan(1);
    expect(getOrder("O-9001")).toMatchObject({ customerId: "C-9", status: "delivered" });
  });

  it("O-6000 is Priya's ₹60,000 order delivered 3 days ago", () => {
    const o = getOrder("O-6000")!;
    expect(o).toMatchObject({ customerId: "C-1", total: 60_000 });
    expect(Math.round(daysAgo(o.deliveredAt))).toBe(3);
  });
});
