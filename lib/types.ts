// The shared contract between the agent, the gate and the UI.
// Agree on this file before splitting work: everything else imports from here.

export type Verdict = "ALLOW" | "BLOCK" | "ESCALATE";

export type OrderStatus = "placed" | "shipped" | "delivered" | "cancelled";

export type Customer = {
  id: string;
  name: string;
  kycVerified: boolean;
  payoutAccount: string;
  payoutChangedAt: string | null; // ISO time of the last payout-account change
};

export type Order = {
  id: string;
  customerId: string;
  total: number; // INR, whole rupees
  status: OrderStatus;
  deliveredAt: string | null;
};

export type Refund = {
  id: string;
  orderId: string;
  amount: number;
  createdAt: string;
};

// Tools that change state. Every call to one of these must pass through the gate.
export type GatedTool = "issue_refund" | "change_payout_account";

// What the rule engine reasons over. Built by the fact loader from the database,
// never from anything the LLM says.
export type Facts = {
  requesterId: string;
  amount?: number;
  order?: Order;
  priorRefunds: number; // sum of earlier refunds on this order
  customer: Customer;
  now: Date;
};

export type RuleResult = {
  rule: string;
  pass: boolean;
  onFail: "BLOCK" | "ESCALATE";
  detail: string; // human-readable line shown in the proof panel
};

export type Rule = {
  id: string;
  appliesTo: (GatedTool | "all")[];
  description: string;
  check: (f: Facts) => RuleResult;
};

// One gate decision: what the agent asked for, the verdict, and the proof.
export type Decision = {
  id: string;
  at: string;
  requesterId: string;
  tool: GatedTool;
  args: Record<string, unknown>;
  verdict: Verdict;
  results: RuleResult[];
  pendingId?: string; // set when the verdict is ESCALATE
  note?: string; // e.g. "Approved by reviewer"
};

// An ESCALATEd action waiting for a human to approve or reject it.
export type PendingAction = {
  id: string;
  decisionId: string;
  requesterId: string;
  tool: GatedTool;
  args: Record<string, unknown>;
  results: RuleResult[];
  status: "pending" | "approved" | "rejected";
};
