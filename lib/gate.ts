import { addPending, addRefund, changePayoutAccount, db, logDecision } from "./db";
import { evaluate } from "./engine";
import { loadFacts } from "./facts";
import type { Decision, Facts, GatedTool, PendingAction, RuleResult } from "./types";

// The interceptor. The agent's state-changing tools call gate() and nothing else,
// so there is no path from the LLM to the database that skips the rules.

export type GateArgs = { orderId?: string; amount?: number; newAccount?: string };

export type GateOutcome =
  | { status: "ALLOW"; decision: Decision; result: unknown }
  | { status: "ESCALATE"; decision: Decision; pendingId: string }
  | { status: "BLOCK"; decision: Decision };

// The only code that actually changes state. Reached only after a verdict allows it.
const executors: Record<GatedTool, (f: Facts, args: GateArgs) => unknown> = {
  issue_refund: (f) => addRefund(f.order!.id, f.amount!),
  change_payout_account: (f, args) => changePayoutAccount(f.requesterId, args.newAccount!),
};

// R0 is checked before the rules: an action on an order that does not exist is never allowed.
function missingOrder(tool: GatedTool, facts: Facts, args: GateArgs): RuleResult | null {
  if (tool !== "issue_refund" || facts.order) return null;
  return { rule: "R0", pass: false, onFail: "BLOCK", detail: `order ${args.orderId ?? "(none)"} does not exist` };
}

export function gate(tool: GatedTool, requesterId: string, args: GateArgs): GateOutcome {
  const facts = loadFacts(requesterId, args);
  // Log what the rules actually checked: the real order ID, and the full refundable amount
  // if the agent left the amount out.
  const logged = {
    ...args,
    ...(facts.order ? { orderId: facts.order.id } : {}),
    ...(facts.amount === undefined ? {} : { amount: facts.amount }),
  };

  const r0 = missingOrder(tool, facts, args);
  if (r0) {
    return { status: "BLOCK", decision: logDecision({ requesterId, tool, args: logged, verdict: "BLOCK", results: [r0] }) };
  }

  const { verdict, results } = evaluate(tool, facts);
  const decision = logDecision({ requesterId, tool, args: logged, verdict, results });

  if (verdict === "ALLOW") {
    return { status: "ALLOW", decision, result: executors[tool](facts, args) };
  }
  if (verdict === "ESCALATE") {
    decision.pendingId = addPending(decision).id;
    return { status: "ESCALATE", decision, pendingId: decision.pendingId };
  }
  return { status: "BLOCK", decision };
}

// A human approves or rejects an ESCALATEd action.
// The reviewer can override soft limits (ESCALATE rules) but never hard rules: the BLOCK rules
// are re-checked on fresh facts first, because the world may have changed while it waited.
export function review(
  pendingId: string,
  approve: boolean,
): { pending: PendingAction; decision: Decision; result?: unknown } {
  const pending = db.pending.find((p) => p.id === pendingId);
  if (!pending) throw new Error(`No pending action ${pendingId}`);
  if (pending.status !== "pending") throw new Error(`Action ${pendingId} was already ${pending.status}`);

  const { requesterId, tool } = pending;
  const args = pending.args as GateArgs;

  if (!approve) {
    pending.status = "rejected";
    const decision = logDecision({ requesterId, tool, args, verdict: "BLOCK", results: pending.results, note: "Rejected by reviewer" });
    return { pending, decision };
  }

  const facts = loadFacts(requesterId, args);
  const r0 = missingOrder(tool, facts, args);
  const results = r0 ? [r0] : evaluate(tool, facts).results;
  if (results.some((r) => !r.pass && r.onFail === "BLOCK")) {
    pending.status = "rejected";
    const decision = logDecision({
      requesterId, tool, args, verdict: "BLOCK", results,
      note: "Approval refused: a hard rule fails now",
    });
    return { pending, decision };
  }

  pending.status = "approved";
  const decision = logDecision({ requesterId, tool, args, verdict: "ALLOW", results, note: "Approved by reviewer" });
  return { pending, decision, result: executors[tool](facts, args) };
}
