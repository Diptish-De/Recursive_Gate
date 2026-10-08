import { getCustomer, getOrder, refundsFor } from "./db";
import type { Facts } from "./types";

// The fact loader: the security heart of the gate.
//
// It takes only an order ID and an amount from the agent. Everything the rules reason about
// (who owns the order, its total, its status, KYC, payout history) is read from the database.
// So a manipulated LLM cannot invent a fact that makes a rule pass: "I'm the CEO" or
// "this customer is VIP" never reaches the rules, because the rules never read the chat.
//
// requesterId comes from the logged-in session (the UI), never from the LLM.
export function loadFacts(
  requesterId: string,
  args: { orderId?: string; amount?: number },
  now = new Date(),
): Facts {
  const customer = getCustomer(requesterId);
  if (!customer) throw new Error(`Unknown requester ${requesterId}`);

  const order = args.orderId ? getOrder(args.orderId) : undefined;
  const priorRefunds = order ? refundsFor(order.id).reduce((sum, r) => sum + r.amount, 0) : 0;

  // No amount means "refund whatever is still refundable".
  const amount = args.amount ?? (order ? order.total - priorRefunds : undefined);

  // Copies, so the facts are a snapshot of the moment the decision was made.
  return { requesterId, amount, order: order && { ...order }, priorRefunds, customer: { ...customer }, now };
}
