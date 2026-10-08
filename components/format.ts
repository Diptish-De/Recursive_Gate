import { inr } from "@/lib/rules";
import type { Decision } from "@/lib/types";

// issue_refund(order=O-4521, amount=₹12,499)
export function formatCall(d: Pick<Decision, "tool" | "args">) {
  const args = Object.entries(d.args)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (k === "amount" ? `amount=${inr(Number(v))}` : k === "orderId" ? `order=${v}` : `${k}="${v}"`));
  return `${d.tool}(${args.join(", ")})`;
}
