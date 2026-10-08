import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getCustomer, getOrder, refundsFor } from "./db";
import { CLAIMS_MODEL } from "./models";

// The claim checker: neural extraction + symbolic verification.
// 1. An LLM pulls the factual claims out of the agent's reply as structured data.
// 2. Plain code checks each claim against the database. The LLM never judges truth.

const claimSchema = z.object({
  claims: z.array(
    z.object({
      subject: z.enum(["customer", "order"]),
      id: z.string().describe("Customer ID like C-1, or order ID like O-4521"),
      field: z.enum(["kycVerified", "status", "total", "refunded"]),
      value: z.string().describe("The claimed value, e.g. 'true', 'false', 'delivered', '12499'"),
    }),
  ),
});

export type Claim = z.infer<typeof claimSchema>["claims"][number];
export type ClaimCheck = Claim & { ok: boolean; actual: string; correction?: string };

const truthy = (v: string) => /^(true|yes|verified|done|complete)/i.test(v.trim());
const fieldLabel: Record<Claim["field"], string> = {
  kycVerified: "KYC verified",
  status: "status",
  total: "total",
  refunded: "refunded",
};

// Look up the real value. Returns null when the subject doesn't exist.
function actualValue(c: Claim): string | null {
  if (c.subject === "customer") {
    const customer = getCustomer(c.id.toUpperCase());
    return customer ? String(customer.kycVerified) : null;
  }
  const order = getOrder(c.id);
  if (!order) return null;
  if (c.field === "status") return order.status;
  if (c.field === "total") return String(order.total);
  return String(refundsFor(order.id).length > 0);
}

function verify(c: Claim): ClaimCheck {
  const actual = actualValue(c);
  if (actual === null) {
    return { ...c, ok: false, actual: "does not exist", correction: `${c.subject} ${c.id} does not exist.` };
  }
  const ok =
    c.field === "status" ? c.value.toLowerCase().includes(actual)
    : c.field === "total" ? Number(c.value.replace(/[^\d.]/g, "")) === Number(actual)
    : truthy(c.value) === (actual === "true");
  return {
    ...c, ok, actual,
    correction: ok ? undefined : `${c.id} ${fieldLabel[c.field]} is actually "${actual}", not "${c.value}".`,
  };
}

export async function checkClaims(reply: string, requesterId: string): Promise<ClaimCheck[]> {
  const { output } = await generateText({
    model: google(CLAIMS_MODEL),
    temperature: 0,
    maxRetries: 1,
    output: Output.object({ schema: claimSchema }),
    prompt: `Extract the factual claims this customer-support reply makes about orders or the customer's account.
Only these kinds of claim count:
- customer KYC verified or not (subject "customer", field "kycVerified"; the user is customer ${requesterId})
- an order's status (field "status": placed, shipped, delivered or cancelled)
- an order's total in rupees (field "total")
- whether an order has been refunded, i.e. money was actually sent back (field "refunded"). A refund that is pending, blocked or waiting for approval is "false".
Return an empty list if there are none. Do not invent claims.

Reply:
"""${reply}"""`,
  });
  return output.claims.map(verify);
}
