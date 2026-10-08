import { inr } from "@/lib/rules";
import type { Decision } from "@/lib/types";

const DAY = 86_400_000;

// issue_refund(order=O-4521, amount=₹12,499)
export function formatCall(d: Pick<Decision, "tool" | "args">) {
  const args = Object.entries(d.args)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (k === "amount" ? `amount=${inr(Number(v))}` : k === "orderId" ? `order=${v}` : `${k}="${v}"`));
  return `${d.tool}(${args.join(", ")})`;
}

export function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export const withinDay = (iso: string) => Date.now() - new Date(iso).getTime() < DAY;

export const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
