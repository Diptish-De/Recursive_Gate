import { google } from "@ai-sdk/google";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { db, getCustomer, getOrder, refundsFor } from "./db";
import { gate, type GateOutcome } from "./gate";
import { AGENT_MODEL, FALLBACK_MODEL } from "./models";
import type { Customer, Decision, RuleResult } from "./types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// This prompt makes the agent polite and useful. It is NOT what makes it safe:
// even if a user overrides every line of it, the gate still decides.
// We deliberately tell the agent to attempt every requested action, so the gate (not the
// model's own judgement) is what refuses. The LLM proposes, the logic decides.
const instructionsFor = (c: Customer) => `
You are the customer-operations agent for a payments company. You are chatting with ${c.name} (customer ${c.id}).

- You do not decide what is allowed. When the user asks for a refund or a payout-account change, call the tool. A policy engine checks it and tells you the verdict.
- Pass only IDs and amounts to tools. For a full refund, leave the amount out.
- Never say an action happened unless its tool returned status ALLOW.
- Do not state facts about orders or the account unless a tool returned them in this conversation.
- BLOCK means the action did not happen. Explain the reason in plain words and suggest a valid next step. Do not retry it.
- ESCALATE means it is not done yet. Say a human reviewer will approve or reject it shortly.
- Amounts are Indian rupees (₹). Keep replies short and friendly, in plain text without markdown.
`.trim();

// The failed rules the customer-facing side may see. If ownership (R8) failed, that is the
// only reason given, so nobody learns details of someone else's order.
function visibleFailures(d: Decision): RuleResult[] {
  const failed = d.results.filter((r) => !r.pass);
  return failed.some((r) => r.rule === "R8") ? failed.filter((r) => r.rule === "R8") : failed;
}

// What the agent sees after a gated tool call: the verdict and the reasons, so it can re-plan.
function toAgent(outcome: GateOutcome) {
  const reasons = visibleFailures(outcome.decision).map((r) => `${r.rule}: ${r.detail}`);
  switch (outcome.status) {
    case "ALLOW":
      return { status: "ALLOW", result: outcome.result };
    case "ESCALATE":
      return { status: "ESCALATE", reasons, instruction: "Not done yet. Tell the user a human reviewer must approve this first." };
    case "BLOCK":
      return {
        status: "BLOCK", reasons,
        instruction: "Blocked by policy. It did NOT happen. Explain why simply and suggest a valid next step. Do not retry.",
      };
  }
}

// Used when the LLM fails after an action already went through the gate:
// a plain reply built straight from the verdicts, so the customer still gets an answer.
function fallbackReply(decisions: Decision[]) {
  return decisions
    .map((d) => {
      const reasons = visibleFailures(d).map((r) => r.detail).join("; ");
      if (d.verdict === "ALLOW") return "Done, your request went through.";
      if (d.verdict === "ESCALATE") return `This needs a human reviewer's approval first (${reasons}).`;
      return `I couldn't do that: ${reasons}.`;
    })
    .join(" ");
}

// Tools are built per request so requesterId comes from the session, never from the model.
function createTools(requesterId: string, decisions: Decision[]) {
  const ownOrder = (orderId: string) => {
    const order = getOrder(orderId);
    // Someone else's order looks exactly like a missing one.
    return order && order.customerId === requesterId ? order : undefined;
  };

  return {
    get_customer: tool({
      description: "Get the logged-in customer's profile: name, KYC status and payout account.",
      inputSchema: z.object({}),
      execute: async () => getCustomer(requesterId),
    }),
    list_orders: tool({
      description: "List the logged-in customer's orders.",
      inputSchema: z.object({}),
      execute: async () => db.orders.filter((o) => o.customerId === requesterId),
    }),
    get_order: tool({
      description: "Look up one of the customer's orders by ID, e.g. O-4521. Also returns how much was already refunded.",
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = ownOrder(orderId);
        if (!order) return { found: false };
        return { found: true, ...order, refundedSoFar: refundsFor(order.id).reduce((s, r) => s + r.amount, 0) };
      },
    }),
    issue_refund: tool({
      description: "Refund an order. Pass the order ID, and the amount only for a partial refund.",
      inputSchema: z.object({
        orderId: z.string().describe("Order ID, e.g. O-4521"),
        amount: z.number().positive().optional().describe("Rupees. Leave out for a full refund."),
      }),
      execute: async (args) => {
        const outcome = gate("issue_refund", requesterId, args);
        decisions.push(outcome.decision);
        return toAgent(outcome);
      },
    }),
    change_payout_account: tool({
      description: "Change the bank account that refunds and payouts go to.",
      inputSchema: z.object({ newAccount: z.string().describe("Bank name and account number") }),
      execute: async (args) => {
        const outcome = gate("change_payout_account", requesterId, args);
        decisions.push(outcome.decision);
        return toAgent(outcome);
      },
    }),
  };
}

export async function runAgent(requesterId: string, messages: ChatMessage[]) {
  const customer = getCustomer(requesterId);
  if (!customer) throw new Error(`Unknown customer ${requesterId}`);

  const decisions: Decision[] = [];
  const tools = createTools(requesterId, decisions);
  const models = [AGENT_MODEL, FALLBACK_MODEL];

  for (let i = 0; ; i++) {
    try {
      const result = await generateText({
        model: google(models[i]),
        instructions: instructionsFor(customer),
        messages: messages.map((m) =>
          m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content },
        ),
        tools,
        stopWhen: isStepCount(6),
        temperature: 0,
        maxRetries: 1,
      });
      return {
        reply: result.text.trim() || "Sorry, I couldn't finish that. Could you rephrase?",
        decisions,
        toolCalls: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
        model: models[i],
      };
    } catch (err) {
      console.error(`agent on ${models[i]} failed:`, err instanceof Error ? err.message : err);
      // Never re-run the turn once an action went through the gate: that could repeat it.
      if (decisions.length > 0) {
        return { reply: fallbackReply(decisions), decisions, toolCalls: decisions.map((d) => d.tool), model: "fallback" };
      }
      if (i === models.length - 1) throw err;
    }
  }
}
